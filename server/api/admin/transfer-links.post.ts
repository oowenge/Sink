/**
 * POST /api/admin/transfer-links
 *
 * 批量转移链接的 owner
 *
 * Body: { slugs: string[], newOwner: string }
 *
 * 操作:
 *   1. 验证 newOwner 必须是已存在的用户
 *   2. 同时更新 KV + D1
 *   3. 写审计日志
 */
import { z } from 'zod'

const BodySchema = z.object({
  slugs: z.array(z.string().trim().min(1).max(2048)).min(1).max(500),
  newOwner: z.string().trim().min(1).max(50),
})

export default eventHandler(async (event) => {
  const currentUser = requireAdmin(event)
  const body = await readValidatedBody(event, BodySchema.parse)

  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const DB = (cloudflare.env as any)?.DB

  // 验证 newOwner 用户存在
  const targetUser = await KV.get(`user:${body.newOwner}`, { type: 'json' })
  if (!targetUser) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: `用户 ${body.newOwner} 不存在`,
    })
  }

  // 去重
  const uniqueSlugs = [...new Set(body.slugs)]

  let success = 0
  let notFound = 0
  let alreadyOwner = 0
  let failed = 0
  const failedItems: Array<{ slug: string, reason: string }> = []
  const transferred: Array<{ slug: string, oldOwner: string }> = []

  for (const slug of uniqueSlugs) {
    try {
      // Step 1: 取 KV
      const link = await KV.get(`link:${slug}`, { type: 'json' }) as any
      if (!link) {
        notFound++
        continue
      }

      const oldOwner = link.owner || '(无)'
      if (link.owner === body.newOwner) {
        alreadyOwner++
        continue
      }

      // Step 2: 改 KV
      const updated = { ...link, owner: body.newOwner }
      const expiration = link.expiration && link.expiration > Math.floor(Date.now() / 1000) ? link.expiration : undefined
      await KV.put(`link:${slug}`, JSON.stringify(updated), {
        expiration,
        metadata: {
          expiration,
          url: link.url,
          comment: link.comment,
        },
      })

      // Step 3: 改 D1
      if (DB) {
        try {
          await DB.prepare('UPDATE links SET owner = ? WHERE slug = ?')
            .bind(body.newOwner, slug)
            .run()
        }
        catch (err: any) {
          console.error(`[transfer] D1 update 失败: ${slug}`, err?.message)
        }
      }

      success++
      transferred.push({ slug, oldOwner })
    }
    catch (err: any) {
      failed++
      failedItems.push({ slug, reason: err?.message || 'unknown' })
    }
  }

  // 写审计日志(汇总成一条)
  if (success > 0) {
    await writeAuditLog(event, {
      action: 'edit',
      details: {
        operation: 'transfer_owner',
        newOwner: body.newOwner,
        operator: currentUser.username,
        count: success,
        sampleSlugs: transferred.slice(0, 20).map(t => t.slug),
      },
    })
  }

  return {
    requested: uniqueSlugs.length,
    success,
    notFound,
    alreadyOwner,
    failed,
    failedItems,
  }
})