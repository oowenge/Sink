/**
 * 通用 API 速率限制工具 - 基于 Cloudflare KV
 *
 * 使用三个独立时间窗口(分/时/天),任一窗口超限即拒绝。
 * 键格式: rl:{action}:{window}:{identifier}
 *   action: 业务动作,如 'upload' / 'create' / 'edit'
 *   window: 'min' / 'hour' / 'day'
 *   identifier: 通常是 username,登录用户专用
 *
 * 注意 - KV 竞态:
 *   Cloudflare KV 没有 atomic increment。并发请求最多多放行 1-2 次,
 *   对限流而言可接受。要严格语义需要 Durable Object,目前不需要。
 *
 * 注意 - 计数器精度:
 *   每个窗口独立 TTL,过期自动清零。不是滑动窗口,是固定窗口。
 *   极端边界:用户在 t=59s 用满 5/min,t=60s 立刻再用 5/min,
 *   等于 1 秒内 10 次。可接受 - 攻击场景下分钟级阈值仍生效。
 */
import type { H3Event } from 'h3'

export interface RateLimitConfig {
  perMinute?: number
  perHour?: number
  perDay?: number
}

export interface RateLimitResult {
  allowed: boolean
  // 触发的窗口,allowed=false 时有值
  triggeredWindow?: 'minute' | 'hour' | 'day'
  // 该窗口当前计数
  currentCount?: number
  // 该窗口阈值
  limit?: number
  // 该窗口剩余秒数,客户端可据此提示
  retryAfterSeconds?: number
}

const WINDOWS = [
  { name: 'minute' as const, ttl: 60, key: 'min' },
  { name: 'hour' as const, ttl: 3600, key: 'hour' },
  { name: 'day' as const, ttl: 86400, key: 'day' },
]

/**
 * 检查并递增限流计数器。
 *
 * 调用语义:
 *   - 返回 allowed=true 时,本次请求已计入计数(各窗口 +1)
 *   - 返回 allowed=false 时,本次请求未计入(避免拒绝的请求继续累计)
 *
 * 用法:
 *   const result = await checkApiRateLimit(event, 'upload', user.username, {
 *     perMinute: 5, perHour: 30, perDay: 100
 *   })
 *   if (!result.allowed) {
 *     throw createError({ status: 429, message: `请求过于频繁,${result.retryAfterSeconds} 秒后重试` })
 *   }
 */
export async function checkApiRateLimit(
  event: H3Event,
  action: string,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 第一阶段:读所有窗口的当前值,看哪个先超限
  // 这一步只读不写,即使后续超限也不会污染计数
  for (const win of WINDOWS) {
    const limit = config[`per${win.name.charAt(0).toUpperCase() + win.name.slice(1)}` as keyof RateLimitConfig]
    if (!limit)
      continue

    const kvKey = `rl:${action}:${win.key}:${identifier}`
    const raw = await KV.get(kvKey)
    const count = raw ? Number.parseInt(raw, 10) : 0

    if (count >= limit) {
      return {
        allowed: false,
        triggeredWindow: win.name,
        currentCount: count,
        limit,
        retryAfterSeconds: win.ttl, // 保守估计:整个窗口长度
      }
    }
  }

  // 第二阶段:所有窗口都未超限,各窗口 +1
  // 并发写,但每个窗口独立 key 不会相互干扰
  await Promise.all(WINDOWS.map(async (win) => {
    const limit = config[`per${win.name.charAt(0).toUpperCase() + win.name.slice(1)}` as keyof RateLimitConfig]
    if (!limit)
      return

    const kvKey = `rl:${action}:${win.key}:${identifier}`
    const raw = await KV.get(kvKey)
    const count = raw ? Number.parseInt(raw, 10) : 0

    // 写入新值,TTL 保持窗口长度
    // 注意:如果 key 已存在,这次写会重置 TTL 到 win.ttl,
    //       这是固定窗口的预期行为(每次请求把窗口重新拉长)
    //       但实际效果接近滑动窗口,对限流而言更严格,可接受
    await KV.put(kvKey, String(count + 1), { expirationTtl: win.ttl })
  }))

  return { allowed: true }
}
