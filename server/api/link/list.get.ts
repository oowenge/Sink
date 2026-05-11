import { z } from 'zod'

// ============ 旧 KV 实现的常量 ============
const KV_PAGE_SIZE = 1000
const MAX_SCAN_PAGES = 10

// ============ 新 D1 实现的常量 ============
const D1_DEFAULT_LIMIT = 100
const D1_MAX_LIMIT = 1024

export default eventHandler(async (event) => {
  const currentUser = requireAuth(event)
  const { cloudflare } = event.context
  const useD1 = (cloudflare?.env as any)?.USE_D1_QUERY === 'true'

  const { limit, cursor: initialCursor, tags: tagsFilter } = await getValidatedQuery(event, z.object({
    limit: z.coerce.number().max(D1_MAX_LIMIT).default(D1_DEFAULT_LIMIT),
    cursor: z.string().trim().max(1024).optional(),
    // tags 是逗号分隔的标签列表,AND 关系
    tags: z.string().trim().max(500).optional(),
  }).parse)

  if (useD1) {
    return listFromD1(event, currentUser, limit, initialCursor, tagsFilter)
  }

  return listFromKV(event, currentUser, limit, initialCursor)
})

// ============ D1 实现 ============
async function listFromD1(event: any, currentUser: any, limit: number, cursor: string | undefined, tagsFilter?: string) {
  const DB = (event.context as any)?.cloudflare?.env?.DB
  if (!DB) {
    console.error('[list] D1 binding 不存在,退回 KV')
    return listFromKV(event, currentUser, limit, cursor)
  }

  // cursor 是上一页最后一条的 created_at_id 复合值,格式: "createdAt:id"
  // 用 (created_at, id) 复合排序保证唯一稳定的分页
  let cursorCreatedAt: number | null = null
  let cursorId: string | null = null
  if (cursor) {
    const [c, i] = cursor.split(':')
    cursorCreatedAt = +c || null
    cursorId = i || null
  }

  const isAdmin = currentUser.role === 'admin'

  // 构建 SQL
  const conditions: string[] = []
  const params: any[] = []

  if (!isAdmin) {
    conditions.push('owner = ?')
    params.push(currentUser.username)
  }

  // cursor 分页:返回比 cursor 更旧的记录(created_at DESC, id DESC)
  if (cursorCreatedAt !== null && cursorId !== null) {
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    params.push(cursorCreatedAt, cursorCreatedAt, cursorId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `
    SELECT * FROM links
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `
  params.push(limit + 1) // 多取 1 条用于判断是否还有下一页

  try {
    const result = await DB.prepare(sql).bind(...params).all()
    const rows = result?.results || []

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    const links = items.map(d1RowToLink)

    let nextCursor: string | undefined
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]
      nextCursor = `${last.created_at}:${last.id}`
    }

    return {
      links,
      list_complete: !hasMore,
      cursor: nextCursor,
    }
  }
  catch (err: any) {
    console.error('[list] D1 查询失败,退回 KV:', err?.message)
    return listFromKV(event, currentUser, limit, cursor)
  }
}

// ============ 旧 KV 实现 (兜底) ============
async function listFromKV(event: any, currentUser: any, limit: number, initialCursor: string | undefined) {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const collected: any[] = []
  let cursor: string | undefined = (initialCursor && initialCursor.length > 0) ? initialCursor : undefined
  let listComplete = false
  let pagesScanned = 0

  while (collected.length < limit && pagesScanned < MAX_SCAN_PAGES) {
    const listOptions: any = { prefix: 'link:', limit: KV_PAGE_SIZE }
    if (cursor) listOptions.cursor = cursor

    const page = await KV.list(listOptions)

    if (Array.isArray(page.keys)) {
      const enriched = await Promise.all(page.keys.map(async (key: { name: string }) => {
        const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
        if (link) return { ...(metadata as any), ...(link as any) }
        return link
      }))

      const filtered = enriched.filter(link => canAccessLink(currentUser, link))
      const remaining = limit - collected.length

      if (filtered.length >= remaining) {
        collected.push(...filtered.slice(0, remaining))
        break
      }
      else {
        collected.push(...filtered)
      }
    }

    pagesScanned++

    if (page.list_complete) {
      listComplete = true
      break
    }

    cursor = page.cursor
  }

  return {
    links: collected,
    list_complete: listComplete,
    cursor: listComplete ? undefined : cursor,
  }
}