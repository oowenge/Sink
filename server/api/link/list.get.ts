import { z } from 'zod'

const KV_PAGE_SIZE = 30
const MAX_SCAN_PAGES = 10

export default eventHandler(async (event) => {
  const debug: any = { step: 'start', error: null }

  try {
    debug.step = 'requireAuth'
    const currentUser = requireAuth(event)
    debug.user = { username: currentUser.username, role: currentUser.role }

    debug.step = 'parse query'
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const { limit, cursor: initialCursor } = await getValidatedQuery(event, z.object({
      limit: z.coerce.number().max(1024).default(20),
      cursor: z.string().trim().max(1024).optional(),
    }).parse)
    debug.limit = limit

    const collected: any[] = []
    let cursor: string | undefined = (initialCursor && initialCursor.length > 0) ? initialCursor : undefined
    let listComplete = false
    let pagesScanned = 0

    while (collected.length < limit && pagesScanned < MAX_SCAN_PAGES) {
      debug.step = `KV.list page ${pagesScanned}`
      const listOptions: any = { prefix: 'link:', limit: KV_PAGE_SIZE }
      if (cursor) listOptions.cursor = cursor

      const page = await KV.list(listOptions)
      debug.lastPageKeys = page.keys?.length ?? 0

      if (Array.isArray(page.keys)) {
        debug.step = `getWithMetadata page ${pagesScanned}`
        const enriched = await Promise.all(page.keys.map(async (key: { name: string }) => {
          const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
          if (link) return { ...(metadata as any), ...(link as any) }
          return link
        }))

        debug.step = `filter page ${pagesScanned}`
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

    debug.step = 'done'
    return {
      links: collected,
      list_complete: listComplete,
      cursor: listComplete ? undefined : cursor,
      _debug: debug,
    }
  }
  catch (err: any) {
    debug.error = {
      message: err?.message ?? '(no message)',
      name: err?.name ?? '(no name)',
      stack: err?.stack?.slice(0, 1500) ?? '(no stack)',
    }
    return { links: [], list_complete: true, cursor: undefined, _debug: debug }
  }
})