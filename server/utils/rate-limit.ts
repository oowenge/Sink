/**
 * 登录失败限流 + IP 黑/白名单工具
 *
 * KV key 格式:
 *   login_fail:user:{username}  → { count, lockedUntil }       TTL 5 分钟
 *   login_fail:ip:{ip}          → { count }                    TTL 5 分钟(每次失败刷新)
 *   blocklist:ip:{ip}           → { reason, blockedAt, ... }   永久
 *   blocklist:cidr:{cidr}       → { reason, blockedAt, ... }   永久
 *   allowlist:ip:{ip}           → { addedAt, ... }             永久
 *   allowlist:cidr:{cidr}       → { addedAt, ... }             永久
 */
import type { H3Event } from 'h3'

export const USER_LOCK_THRESHOLD = 3 // 同 username 失败几次后锁
export const USER_LOCK_DURATION = 5 * 60 // 5 分钟(秒)
export const IP_BLOCK_THRESHOLD = 10 // 同 IP 失败几次后永久封禁
export const FAIL_WINDOW = 5 * 60 // 失败计数窗口期(秒)

export interface UserFailRecord {
  count: number
  lockedUntil?: number
}

export interface IpFailRecord {
  count: number
}

export interface BlocklistRecord {
  reason: 'auto_50_fails' | 'manual'
  blockedAt: number
  blockedBy: string
  note?: string
}

export interface AllowlistRecord {
  addedAt: number
  addedBy: string
  note?: string
}

/**
 * 检查 IP 是否在白名单内(单 IP 或 CIDR)
 */
export async function isIpAllowlisted(event: H3Event, ip: string): Promise<boolean> {
  if (!ip) return false
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 先查精确 IP 匹配
  const exact = await KV.get(`allowlist:ip:${ip}`)
  if (exact) return true

  // 再查 CIDR 匹配
  const cidrList = await KV.list({ prefix: 'allowlist:cidr:' })
  for (const key of cidrList.keys || []) {
    const cidr = key.name.replace('allowlist:cidr:', '')
    if (ipInCidr(ip, cidr)) return true
  }

  return false
}

/**
 * 检查 IP 是否在黑名单内(单 IP 或 CIDR)
 */
export async function isIpBlocklisted(event: H3Event, ip: string): Promise<{ blocked: boolean, record?: BlocklistRecord }> {
  if (!ip) return { blocked: false }
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 精确 IP
  const exact = await KV.get(`blocklist:ip:${ip}`, { type: 'json' }) as BlocklistRecord | null
  if (exact) return { blocked: true, record: exact }

  // CIDR
  const cidrList = await KV.list({ prefix: 'blocklist:cidr:' })
  for (const key of cidrList.keys || []) {
    const cidr = key.name.replace('blocklist:cidr:', '')
    if (ipInCidr(ip, cidr)) {
      const record = await KV.get(key.name, { type: 'json' }) as BlocklistRecord | null
      return { blocked: true, record: record || undefined }
    }
  }

  return { blocked: false }
}

/**
 * 检查用户是否当前被锁定
 */
export async function getUserLockStatus(event: H3Event, username: string): Promise<{ locked: boolean, remainingSeconds: number, failCount: number }> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const record = await KV.get(`login_fail:user:${username}`, { type: 'json' }) as UserFailRecord | null
  if (!record) return { locked: false, remainingSeconds: 0, failCount: 0 }

  const now = Math.floor(Date.now() / 1000)
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      locked: true,
      remainingSeconds: record.lockedUntil - now,
      failCount: record.count,
    }
  }

  return { locked: false, remainingSeconds: 0, failCount: record.count }
}

/**
 * 记录一次登录失败,返回新的状态
 *
 * 逻辑:
 *   - username 失败次数 +1,达到 USER_LOCK_THRESHOLD 则锁 USER_LOCK_DURATION
 *   - ip 失败次数 +1,达到 IP_BLOCK_THRESHOLD 则永久封禁
 *   - 白名单 IP 跳过 IP 计数
 */
export async function recordLoginFailure(
  event: H3Event,
  username: string,
  ip: string,
): Promise<{ userLocked: boolean, ipBlocked: boolean, userFailCount: number, ipFailCount: number }> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const now = Math.floor(Date.now() / 1000)

  // 1. 更新 username 失败计数
  const userKey = `login_fail:user:${username}`
  const oldUser = await KV.get(userKey, { type: 'json' }) as UserFailRecord | null
  const userCount = (oldUser?.count || 0) + 1
  let userLocked = false
  let lockedUntil: number | undefined
  if (userCount >= USER_LOCK_THRESHOLD) {
    userLocked = true
    lockedUntil = now + USER_LOCK_DURATION
  }
  await KV.put(userKey, JSON.stringify({ count: userCount, lockedUntil }), {
    expirationTtl: FAIL_WINDOW,
  })

  // 2. 更新 IP 失败计数(白名单 IP 跳过)
  let ipCount = 0
  let ipBlocked = false
  if (ip && !(await isIpAllowlisted(event, ip))) {
    const ipKey = `login_fail:ip:${ip}`
    const oldIp = await KV.get(ipKey, { type: 'json' }) as IpFailRecord | null
    ipCount = (oldIp?.count || 0) + 1
    await KV.put(ipKey, JSON.stringify({ count: ipCount }), { expirationTtl: FAIL_WINDOW })

    if (ipCount >= IP_BLOCK_THRESHOLD) {
      ipBlocked = true
      const blockRecord: BlocklistRecord = {
        reason: 'auto_50_fails',
        blockedAt: now,
        blockedBy: 'system',
      }
      await KV.put(`blocklist:ip:${ip}`, JSON.stringify(blockRecord))
    }
  }

  return {
    userLocked,
    ipBlocked,
    userFailCount: userCount,
    ipFailCount: ipCount,
  }
}

/**
 * 登录成功后清除该 username 的失败计数
 * IP 计数不清除(避免攻击者用一个有效账号清除自己的攻击痕迹)
 */
export async function clearUserFailCount(event: H3Event, username: string): Promise<void> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  await KV.delete(`login_fail:user:${username}`)
}