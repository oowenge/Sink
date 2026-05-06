/**
 * POST /api/auth/change-password
 * 当前登录用户修改自己的密码
 *
 * 流程:
 *   1. 必须已登录
 *   2. 验证 oldPassword 正确
 *   3. hash newPassword 并写回 KV
 *   4. 不强制踢掉其他设备(用户当前 session 继续有效)
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
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: '旧密码错误',
    })
  }

  // hash 新密码并保存
  const newHash = await hashPassword(body.newPassword)
  const updated: UserRecord = {
    ...existing,
    passwordHash: newHash,
  }

  await KV.put(`user:${currentUser.username}`, JSON.stringify(updated))

  return {
    success: true,
    message: '密码修改成功',
  }
})