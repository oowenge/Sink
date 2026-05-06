/**
 * POST /api/admin/security/blocklist
 * 添加 IP 或 CIDR 到黑名单
 *
 * Body: { value: string, note?: string }
 *   value 自动判断是 IP 还是 CIDR
 */
import { z } from 'zod'

const AddBlockSchema = z.object({
  value: z.string().trim().min(1).max(50),
  note: z.string().trim().max(200).optional(),
})

export default eventHandler(async (event) => {
  const currentUser = requireAdmin(event)
  const body = await readValidatedBody(event, AddBlockSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 自动识别格式
  const isIp = isValidIPv4(body.value)
  const isCidr = isValidCidr(body.value)

  if (!isIp && !isCidr) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '格式错误,必须是 IP (1.2.3.4) 或 CIDR (1.2.3.0/24)',
    })
  }

  const keyType = isIp ? 'ip' : 'cidr'
  const key = `blocklist:${keyType}:${body.value}`

  const record = {
    reason: 'manual' as const,
    blockedAt: Math.floor(Date.now() / 1000),
    blockedBy: currentUser.username,
    note: body.note || undefined,
  }

  await KV.put(key, JSON.stringify(record))

  return {
    success: true,
    type: keyType,
    value: body.value,
    message: `已加入黑名单: ${body.value}`,
  }
})