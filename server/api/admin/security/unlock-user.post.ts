/**
 * POST /api/admin/security/unlock-user
 * 解锁某个 username
 *
 * Body: { username: string }
 */
import { z } from 'zod'

const UnlockSchema = z.object({
  username: z.string().trim().min(1).max(50),
})

export default eventHandler(async (event) => {
  requireAdmin(event)
  const body = await readValidatedBody(event, UnlockSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  await KV.delete(`login_fail:user:${body.username}`)

  return {
    success: true,
    message: `已解锁用户 ${body.username}`,
  }
})