import { z } from 'zod'
import { nanoid } from 'nanoid'
import { BatchLinkSchema, type BatchLinkItem } from '@@/shared/schemas/link'

// KV 每请求 ops 上限 50,每条 link 占 2 ops(get 查重 + put 写入),保守用 20 条/批
const BATCH_SIZE = 20

interface SuccessItem {
  row: number
  url: string
  slug: string
  shortLink: string
}

interface FailureItem {
  row: number
  url: string
  reason: string
}

export default eventHandler(async (event) => {
  const { caseSensitive, slugRegex, defaultSlugLength } = useRuntimeConfig(event)
  const { KV } = hubKV ? { KV: hubKV() } : event.context.cloudflare.env  // 兼容两种取 KV 的方式

  // 1. 解析 + 校验 body
  const body = await readValidatedBody(event, BatchLinkSchema.parse)

  // 2. 取 host,用于拼 shortLink
  const host = getRequestHost(event, { xForwardedHost: true })
  const protocol = getRequestProtocol(event, { xForwardedProto: true })
  const baseUrl = `${protocol}://${host}`

  // 3. 预处理:补 slug、归一化、标记重复
  const seenSlugsInBatch = new Set<string>()
  const prepared = body.links.map((item, idx) => {
    let slug = item.slug?.trim() || ''
    if (!slug) slug = nanoid(defaultSlugLength || 6)
    if (!caseSensitive) slug = slug.toLowerCase()
    return { ...item, slug, _row: idx + 1, _dupInBatch: seenSlugsInBatch.has(slug) ? true : (seenSlugsInBatch.add(slug), false) }
  })

  const succeeded: SuccessItem[] = []
  const failed: FailureItem[] = []

  // 4. 分批处理
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE)

    // 4a. 并发查重
    const existsResults = await Promise.all(
      chunk.map(item =>
        item._dupInBatch
          ? Promise.resolve('__DUP_IN_BATCH__')
          : KV.get(`link:${item.slug}`, { type: 'json' })
      )
    )

    // 4b. 决定写哪些
    const toWrite: typeof chunk = []
    chunk.forEach((item, j) => {
      const existing = existsResults[j]

      if (existing === '__DUP_IN_BATCH__') {
        failed.push({ row: item._row, url: item.url, reason: `slug "${item.slug}" duplicated within this batch` })
        return
      }

      if (existing && body.onConflict === 'skip') {
        failed.push({ row: item._row, url: item.url, reason: `slug "${item.slug}" already exists` })
        return
      }

      toWrite.push(item)
    })

    // 4c. 并发写入(每条一次 put)
    const writeResults = await Promise.allSettled(
      toWrite.map((item) => {
        const now = Math.floor(Date.now() / 1000)
        const link = {
          id: nanoid(10),
          url: item.url,
          slug: item.slug,
          comment: item.comment || undefined,
          expiration: item.expiration || undefined,
          createdAt: now,
          updatedAt: now,
        }
        const opts = item.expiration
          ? { expiration: item.expiration, metadata: { expiration: item.expiration } }
          : undefined
        return KV.put(`link:${item.slug}`, JSON.stringify(link), opts).then(() => link)
      })
    )

    writeResults.forEach((res, j) => {
      const item = toWrite[j]
      if (res.status === 'fulfilled') {
        succeeded.push({
          row: item._row,
          url: item.url,
          slug: item.slug,
          shortLink: `${baseUrl}/${item.slug}`,
        })
      } else {
        failed.push({
          row: item._row,
          url: item.url,
          reason: res.reason?.message || 'KV write failed',
        })
      }
    })
  }

  // 5. 按行号排序,前端展示更直观
  succeeded.sort((a, b) => a.row - b.row)
  failed.sort((a, b) => a.row - b.row)

  setResponseStatus(event, 207)  // 207 Multi-Status,表示部分成功
  return {
    total: body.links.length,
    successCount: succeeded.length,
    failureCount: failed.length,
    succeeded,
    failed,
  }
})
