/**
 * DELETE /api/admin/security/blocklist
 * 从黑名单移除某条记录
 *
 * Body: { type: 'ip' | 'cidr', value: string }
 */
import { z } from 'zod'

const DeleteBlockSchema = z.object({
  type: z.enum(['ip', 'cidr']),
  value: z.string().trim().min(1).max(50),
})

export default eventHandler(async (event) => {
  requireAdmin(event)
  const body = await readValidatedBody(event, DeleteBlockSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const key = `blocklist:${body.type}:${body.value}`
  await KV.delete(key)

  // 同时清除可能的 IP 失败计数,让用户立即可以重试
  if (body.type === 'ip') {
    await KV.delete(`login_fail:ip:${body.value}`)
  }

  return {
    success: true,
    message: `已从黑名单移除: ${body.value}`,
  }
})