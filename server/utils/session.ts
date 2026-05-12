/**
 * Session 管理工具 - 基于 Cloudflare KV
 *
 * KV schema:
 *   session:{token}            → { username, role, createdAt, expiresAt }
 *   user_sessions:{username}   → string[]  (该 user 的所有活跃 token,反查索引)
 *
 * TTL: 7 天(KV 自动过期)
 *
 * 注意:函数名加 "User" 前缀避免和 Nitro 内置的 getSession 冲突
 */

import type { H3Event } from 'h3'

export interface UserSessionData {
  username: string
  role: 'admin' | 'user'
  createdAt: number
  expiresAt: number
}

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

/**
 * 生成一个新的 session token
 */
export function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * 内部:读取 user_sessions:{username} 索引,带容错(非数组返回空)
 */
async function readUserSessionsIndex(
  KV: KVNamespace,
  username: string,
): Promise<string[]> {
  const raw = await KV.get(`user_sessions:${username}`, { type: 'json' })
  if (!Array.isArray(raw))
    return []
  return raw.filter(t => typeof t === 'string')
}

/**
 * 创建一个新 session,返回 token。
 * 副作用:把 token 加入 user_sessions:{username} 索引,用于后续按 user 撤销
 */
export async function createUserSession(
  event: H3Event,
  username: string,
  role: 'admin' | 'user',
): Promise<string> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const token = generateSessionToken()
  const now = Math.floor(Date.now() / 1000)
  const session: UserSessionData = {
    username,
    role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  }

  await KV.put(
    `session:${token}`,
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECONDS },
  )

  // 维护 user→sessions 反查索引
  // 已知竞态:同一 user 毫秒级并发登录可能丢失 token(read-modify-write 非原子)。
  // 影响:revokeAll 时该 token 不被踢。可接受(改密频率极低)
  const tokens = await readUserSessionsIndex(KV, username)
  tokens.push(token)
  await KV.put(
    `user_sessions:${username}`,
    JSON.stringify(tokens),
    { expirationTtl: SESSION_TTL_SECONDS },
  )

  return token
}

/**
 * 读取一个 session,返回 UserSessionData 或 null
 */
export async function getUserSession(
  event: H3Event,
  token: string,
): Promise<UserSessionData | null> {
  if (!token)
    return null
  try {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const value = await KV.get(`session:${token}`, { type: 'json' }) as UserSessionData | null
    if (!value)
      return null

    const now = Math.floor(Date.now() / 1000)
    if (value.expiresAt < now) {
      await KV.delete(`session:${token}`)
      return null
    }

    return value
  }
  catch {
    return null
  }
}

/**
 * 删除一个 session(登出用)。
 * 副作用:从 user_sessions:{username} 索引里也移除该 token
 */
export async function deleteUserSession(
  event: H3Event,
  token: string,
): Promise<void> {
  if (!token)
    return
  try {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env

    // 先读出 session 拿 username(为了维护索引)
    const session = await KV.get(`session:${token}`, { type: 'json' }) as UserSessionData | null

    await KV.delete(`session:${token}`)

    // 同步维护反查索引
    if (session?.username) {
      const tokens = await readUserSessionsIndex(KV, session.username)
      const filtered = tokens.filter(t => t !== token)
      if (filtered.length > 0) {
        await KV.put(
          `user_sessions:${session.username}`,
          JSON.stringify(filtered),
          { expirationTtl: SESSION_TTL_SECONDS },
        )
      }
      else {
        await KV.delete(`user_sessions:${session.username}`)
      }
    }
  }
  catch {
    // 忽略删除失败
  }
}

/**
 * 撤销某 user 的所有活跃 session(改密码、强制登出场景)
 *
 * 已知边界:
 *   - 索引建立之前签发的"老 session"不在列表里,踢不到,等自然过期(最多 7 天)
 *   - 并发竞态期间签发的 token 可能丢索引,踢不到
 */
export async function revokeAllUserSessions(
  event: H3Event,
  username: string,
): Promise<void> {
  try {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env

    const tokens = await readUserSessionsIndex(KV, username)
    if (tokens.length > 0) {
      await Promise.all(
        tokens.map(t => KV.delete(`session:${t}`)),
      )
    }
    await KV.delete(`user_sessions:${username}`)
  }
  catch {
    // 忽略
  }
}

/**
 * 从请求 header 提取 Bearer token
 */
export function extractBearerToken(event: H3Event): string {
  const auth = getRequestHeader(event, 'Authorization') || ''
  const match = auth.match(/^Bearer\s+(\S+)\s*$/i)
  return match ? match[1].trim() : ''
}
