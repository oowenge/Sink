/**
 * POST /_/verify-password
 *
 * 验证短链密码,验证通过后:
 *   1. 设置 cookie sink_pwd_{slug} = passwordHash 前 16 位
 *   2. 302 跳回 /{slug} (再次访问就会通过)
 * 验证失败:
 *   - 重新渲染密码页 + 错误提示
 *   - 5 次失败锁 10 分钟(同 IP + 同 slug)
 *
 * 这个路径放在 _/ 下避免和 slug 冲突
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

function renderPasswordPage(slug: string, errorMsg = ''): string {
  const errBlock = errorMsg
    ? `<div style="background:#fee;color:#c33;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:14px;">${errorMsg}</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>需要密码 · 短链</title>
<meta name="robots" content="noindex,nofollow">
<style>
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  padding: 20px;
}
.card {
  background: #fff; border-radius: 12px; padding: 32px 28px; width: 100%; max-width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
h1 { margin: 0 0 8px; font-size: 22px; color: #333; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
input[type=password] {
  width: 100%; padding: 12px 14px; font-size: 16px; border: 2px solid #e0e0e0;
  border-radius: 8px; outline: none; transition: border-color .15s;
}
input[type=password]:focus { border-color: #667eea; }
button {
  width: 100%; margin-top: 12px; padding: 12px; font-size: 15px; font-weight: 600;
  border: none; border-radius: 8px; background: #667eea; color: #fff; cursor: pointer; transition: background .15s;
}
button:hover { background: #5568d3; }
.icon { width: 48px; height: 48px; margin: 0 auto 16px; display: block; }
</style>
</head>
<body>
<div class="card">
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  <h1>需要密码</h1>
  <p class="subtitle">此链接受密码保护,请输入密码访问</p>
  ${errBlock}
  <form method="POST" action="/_/verify-password" autocomplete="off">
    <input type="hidden" name="slug" value="${slug}">
    <input type="password" name="password" placeholder="请输入密码" required autofocus maxlength="32">
    <button type="submit">访问</button>
  </form>
</div>
</body>
</html>`
}

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

  // 限流 key:同 IP + 同 slug
  const ip = getClientIp(event) || 'unknown'
  const failKey = `pwdfail:${ip}:${payload.slug}`
  const lockKey = `pwdlock:${ip}:${payload.slug}`

  // 是否被锁
  const locked = await KV.get(lockKey)
  if (locked) {
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'no-store')
    return renderPasswordPage(payload.slug, `失败次数过多,请 ${Math.ceil(LOCK_SECONDS / 60)} 分钟后再试`)
  }

  // 取链接
  const link = await KV.get(`link:${payload.slug}`, { type: 'json' }) as any
  if (!link || !link.passwordHash) {
    // 链接不存在或没密码 -> 直接跳回(让 redirect 中间件处理)
    return sendRedirect(event, `/${payload.slug}`, 302)
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
      return renderPasswordPage(payload.slug, `失败次数过多,请 ${Math.ceil(LOCK_SECONDS / 60)} 分钟后再试`)
    }
    else {
      // 累计计数(15 分钟内有效)
      await KV.put(failKey, String(current), { expirationTtl: 15 * 60 })
      setHeader(event, 'content-type', 'text/html; charset=utf-8')
      setHeader(event, 'cache-control', 'no-store')
      return renderPasswordPage(payload.slug, `密码错误(已失败 ${current}/${MAX_FAILS} 次)`)
    }
  }

  // 验证成功:清理失败计数,设置 cookie,跳回
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