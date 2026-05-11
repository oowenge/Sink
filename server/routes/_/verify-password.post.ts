/**
 * POST /_/verify-password
 *
 * 验证短链密码,验证通过后:
 *   1. 设置 cookie sink_pwd_{slug} = passwordHash 前 16 位
 *   2. 302 跳回 /{slug}
 * 验证失败:
 *   - 重新渲染密码页 + 错误提示
 *   - 5 次失败锁 10 分钟(同 IP + 同 slug)
 */
import { z } from 'zod'

const PWD_COOKIE_PREFIX = 'sink_pwd_'
const PWD_COOKIE_TTL = 24 * 60 * 60 // 24 小时
const MAX_FAILS = 5
const LOCK_SECONDS = 10 * 60 // 10 分钟

const BodySchema = z.object({
  slug: z.string().trim().min(1).max(2048),
  password: z.string().min(1).max(64),
})

export default eventHandler(async (event) => {
  // 表单 POST 是 application/x-www-form-urlencoded,需要 readBody 解析
  const body = await readBody(event)
  let payload: { slug: string, password: string }
  try {
    payload = BodySchema.parse(body)
  }
  catch {
    throw createError({ status: 400, statusText: 'Bad Request' })
  }

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 取链接(为了拿 lang 配置)
  const link = await KV.get(`link:${payload.slug}`, { type: 'json' }) as any
  if (!link || !link.passwordHash) {
    // 链接不存在或没密码 -> 直接跳回
    return sendRedirect(event, `/${payload.slug}`, 302)
  }

  // 解析使用的语言
  const lang = resolvePasswordLang(
    link.passwordLang,
    getRequestHeader(event, 'accept-language'),
  )

  // 限流 key:同 IP + 同 slug
  const ip = getClientIp(event) || 'unknown'
  const failKey = `pwdfail:${ip}:${payload.slug}`
  const lockKey = `pwdlock:${ip}:${payload.slug}`

  // 是否被锁
  const locked = await KV.get(lockKey)
  if (locked) {
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'no-store')
    return renderPasswordPage(payload.slug, lang, 'locked', { lockMins: Math.ceil(LOCK_SECONDS / 60) })
  }

  // 验证密码
  const ok = await verifyPassword(payload.password, link.passwordHash)
  if (!ok) {
    // 失败计数
    const current = parseInt((await KV.get(failKey)) || '0') + 1
    if (current >= MAX_FAILS) {
      // 锁定
      await KV.put(lockKey, '1', { expirationTtl: LOCK_SECONDS })
      await KV.delete(failKey)
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      setHeader(event, 'cache-control', 'no-store')
      return renderPasswordPage(payload.slug, lang, 'locked', { lockMins: Math.ceil(LOCK_SECONDS / 60) })
    }
    else {
      await KV.put(failKey, String(current), { expirationTtl: 15 * 60 })
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      setHeader(event, 'cache-control', 'no-store')
      return renderPasswordPage(payload.slug, lang, 'wrong', { failedTimes: current, maxFails: MAX_FAILS })
    }
  }

  // 验证成功
  await KV.delete(failKey)
  setCookie(event, `${PWD_COOKIE_PREFIX}${payload.slug}`, link.passwordHash.slice(0, 16), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: PWD_COOKIE_TTL,
  })

  return sendRedirect(event, `/${payload.slug}`, 302)
})