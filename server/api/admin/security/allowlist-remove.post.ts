/**
 * DELETE /api/admin/security/allowlist
 * 从白名单移除某条记录
 *
 * Body: { type: 'ip' | 'cidr', value: string }
 */
import { z } from 'zod'

const DeleteAllowSchema = z.object({
  type: z.enum(['ip', 'cidr']),
  value: z.string().trim().min(1).max(50),
})

export default eventHandler(async (event) => {
  requireAdmin(event)
  const body = await readValidatedBody(event, DeleteAllowSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const key = `allowlist:${body.type}:${body.value}`
  await KV.delete(key)

  return {
    success: true,
    message: `已从白名单移除: ${body.value}`,
  }
})