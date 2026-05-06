/**
 * POST /api/admin/cold-links-delete
 *
 * 批量删除指定的 slug 列表(冷链接清理)
 *
 * Body: { slugs: string[] }
 *
 * 操作:
 *   1. 同时删除 KV + D1
 *   2. 写一条审计日志(action=delete)对每条
 *   3. 返回成功/失败计数
 */
import { z } from 'zod'

const BodySchema = z.object({
  slugs: z.array(z.string().trim().min(1).max(2048)).min(1).max(500),
})

export default eventHandler(async (event) => {
  const currentUser = requireAdmin(event)
  const body = await readValidatedBody(event, BodySchema.parse)

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  let success = 0
  let failed = 0
  const failedItems: Array<{ slug: string, reason: string }> = []

  for (const slug of body.slugs) {
    try {
      // 先取出来,记审计日志用
      const existing = await KV.get(`link:${slug}`, { type: 'json' }) as any

      // 删 KV
      await KV.delete(`link:${slug}`)

      // 删 D1
      await deleteLinkFromD1(event, slug)

      // 写审计日志
      await writeAuditLog(event, {
        action: 'delete',
        targetSlug: slug,
        targetUrl: existing?.url,
        oldRules: existing?.rules,
        details: { reason: 'cold_link_cleanup', operator: currentUser.username },
      })

      success++
    }
    catch (err: any) {
      failed++
      failedItems.push({ slug, reason: err?.message || 'unknown error' })
    }
  }

  return {
    requested: body.slugs.length,
    success,
    failed,
    failedItems,
  }
})