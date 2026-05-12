/**
 * POST /api/auth/change-password
 * 当前登录用户修改自己的密码
 *
 * 流程:
 *   1. 必须已登录
 *   2. 失败限流检查(5 次失败 / 15 分钟)
 *   3. 验证 oldPassword 正确
 *   4. hash newPassword 并写回 KV
 *   5. 不强制踢掉其他设备(用户当前 session 继续有效)
 *
 * 安全考虑:
 *   - oldPassword 错误限流防止 session 被偷后攻击者枚举旧密码
 *   - 成功修改后清除失败计数
 */
import { z } from 'zod'

const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
})

interface UserRecord {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  displayName?: string
  createdAt?: number
  lastLoginAt?: number
  disabled?: boolean
}

// 失败限流参数
const CHPW_MAX_FAILS = 5
const CHPW_LOCK_SECONDS = 900 // 15 分钟

export default eventHandler(async (event) => {
  const currentUser = requireAuth(event)
  const body = await readValidatedBody(event, ChangePasswordSchema.parse)

  // 新旧密码不能一样
  if (body.oldPassword === body.newPassword) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '新密码不能与旧密码相同',
    })
  }

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // ★ 失败限流检查
  const failKey = `chpw_fail:${currentUser.username}`
  const failCountRaw = await KV.get(failKey)
  const failCount = failCountRaw ? Number.parseInt(failCountRaw, 10) : 0
  if (failCount >= CHPW_MAX_FAILS) {
    throw createError({
      status: 429,
      statusText: 'Too Many Requests',
      message: `密码修改失败次数过多,请 ${Math.ceil(CHPW_LOCK_SECONDS / 60)} 分钟后再试`,
    })
  }

  // 取出当前用户
  const existing = await KV.get(`user:${currentUser.username}`, { type: 'json' }) as UserRecord | null
  if (!existing) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: '用户不存在',
    })
  }

  // 验证旧密码
  const oldPasswordOk = await verifyPassword(body.oldPassword, existing.passwordHash)
  if (!oldPasswordOk) {
    // ★ 失败计数 +1(TTL 重置为 15 分钟)
    await KV.put(failKey, String(failCount + 1), { expirationTtl: CHPW_LOCK_SECONDS })

    const remaining = Math.max(0, CHPW_MAX_FAILS - (failCount + 1))
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: remaining > 0
        ? `旧密码错误,还可尝试 ${remaining} 次`
        : `旧密码错误,已锁定 ${Math.ceil(CHPW_LOCK_SECONDS / 60)} 分钟`,
    })
  }

  // hash 新密码并保存
  const newHash = await hashPassword(body.newPassword)
  const updated: UserRecord = {
    ...existing,
    passwordHash: newHash,
  }
  await KV.put(`user:${currentUser.username}`, JSON.stringify(updated))

  // ★ 成功后清除失败计数
  try {
    await KV.delete(failKey)
  }
  catch {
    // 忽略
  }

  return {
    success: true,
    message: '密码修改成功',
  }
})
