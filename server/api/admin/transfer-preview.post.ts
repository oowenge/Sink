/**
 * POST /api/admin/transfer-preview
 *
 * 预览要转移的 slug 列表当前状态
 *
 * Body: { slugs: string[] }
 */
import { z } from 'zod'

const BodySchema = z.object({
  slugs: z.array(z.string().trim().min(1).max(2048)).min(1).max(500),
})

export default eventHandler(async (event) => {
  requireAdmin(event)
  const body = await readValidatedBody(event, BodySchema.parse)

  // 去重
  const uniqueSlugs = [...new Set(body.slugs)]

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const items = await Promise.all(uniqueSlugs.map(async (slug) => {
    try {
      const link = await KV.get(`link:${slug}`, { type: 'json' }) as any
      if (!link) {
        return { slug, status: 'not_found', currentOwner: null, url: null }
      }
      return {
        slug,
        status: 'ok',
        currentOwner: link.owner || null,
        url: link.url,
        comment: link.comment || null,
      }
    }
    catch (err: any) {
      return { slug, status: 'error', error: err?.message }
    }
  }))

  return {
    total: uniqueSlugs.length,
    items,
  }
})