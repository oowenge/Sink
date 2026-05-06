interface Link {
  slug: string
  url: string
  comment?: string
}

// 单次 KV.list 拿多少 keys
const KV_PAGE_SIZE = 30
// 整个扫描最大页数
const MAX_PAGES = 50

export default eventHandler(async (event) => {
  const currentUser = requireAuth(event)
  const { cloudflare } = event.context
  const useD1 = (cloudflare?.env as any)?.USE_D1_QUERY === 'true'

  if (useD1) {
    return searchFromD1(event, currentUser)
  }

  return searchFromKV(event, currentUser)
})

// ============ D1 实现 ============
async function searchFromD1(event: any, currentUser: any): Promise<Link[]> {
  const DB = (event.context as any)?.cloudflare?.env?.DB
  if (!DB) {
    console.error('[search] D1 binding 不存在,退回 KV')
    return searchFromKV(event, currentUser)
  }

  const isAdmin = currentUser.role === 'admin'

  try {
    let result
    if (isAdmin) {
      result = await DB.prepare(
        'SELECT slug, url, comment FROM links ORDER BY created_at DESC',
      ).all()
    }
    else {
      result = await DB.prepare(
        'SELECT slug, url, comment FROM links WHERE owner = ? ORDER BY created_at DESC',
      ).bind(currentUser.username).all()
    }

    const rows = result?.results || []
    return rows.map((r: any) => ({
      slug: r.slug,
      url: r.url,
      comment: r.comment || undefined,
    }))
  }
  catch (err: any) {
    console.error('[search] D1 查询失败,退回 KV:', err?.message)
    return searchFromKV(event, currentUser)
  }
}

// ============ 旧 KV 实现 (兜底) ============
async function searchFromKV(event: any, currentUser: any): Promise<Link[]> {
  const isAdmin = currentUser.role === 'admin'
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const list: Link[] = []
  let cursor: string | undefined
  let pagesScanned = 0

  try {
    while (pagesScanned < MAX_PAGES) {
      const listOptions: { prefix: string, limit: number, cursor?: string } = {
        prefix: 'link:',
        limit: KV_PAGE_SIZE,
      }
      if (cursor) listOptions.cursor = cursor

      const { keys, list_complete, cursor: nextCursor } = await KV.list(listOptions)

      if (Array.isArray(keys) && keys.length > 0) {
        const batchResults = await Promise.all(keys.map(async (key) => {
          try {
            if (isAdmin && (key as any).metadata?.url) {
              return {
                slug: key.name.replace('link:', ''),
                url: (key as any).metadata.url,
                comment: (key as any).metadata.comment,
              } as Link
            }

            const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
            if (!link) return null

            if (!isAdmin && (link as any).owner !== currentUser.username) {
              return null
            }

            if (!(key as any).metadata?.url) {
              await KV.put(key.name, JSON.stringify(link), {
                expiration: (metadata as any)?.expiration,
                metadata: {
                  ...(metadata as any),
                  url: (link as any).url,
                  comment: (link as any).comment,
                },
              })
            }

            return {
              slug: key.name.replace('link:', ''),
              url: (link as any).url,
              comment: (link as any).comment,
            } as Link
          }
          catch (err) {
            console.error(`[search] Error processing key ${key.name}:`, err)
            return null
          }
        }))

        for (const item of batchResults) {
          if (item) list.push(item)
        }
      }

      pagesScanned++

      if (list_complete) break
      cursor = nextCursor
      if (!cursor) break
    }

    return list
  }
  catch (err: any) {
    console.error('[search] error:', err?.message, err?.stack)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch link list',
    })
  }
}