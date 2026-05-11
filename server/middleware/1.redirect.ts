import type { LinkSchema } from '@@/schemas/link'
import type { z } from 'zod'
import { parsePath, withQuery } from 'ufo'

// 一天的秒数(用于判断 lastAccessedAt 是否需要更新)
const ONE_DAY_SECONDS = 24 * 60 * 60
// 密码验证 cookie 名前缀
const PWD_COOKIE_PREFIX = 'sink_pwd_'
// 密码 cookie 有效期(24 小时)
const PWD_COOKIE_TTL = 24 * 60 * 60

/**
 * 从 User-Agent 解析设备类别
 */
function detectDeviceCategories(event: any): Array<'mobile' | 'tablet' | 'desktop' | 'ios' | 'android' | 'bot'> {
  const ua = (getRequestHeader(event, 'user-agent') || '').toLowerCase()
  const cats: Array<'mobile' | 'tablet' | 'desktop' | 'ios' | 'android' | 'bot'> = []

  if (!ua) return ['desktop']

  if (/bot|spider|crawler|fetch|curl|wget|postman|axios|python|java\//i.test(ua)) {
    cats.push('bot')
    return cats
  }

  const isIos = /iphone|ipad|ipod/.test(ua)
  if (isIos) cats.push('ios')

  const isAndroid = /android/.test(ua)
  if (isAndroid) cats.push('android')

  const isTablet = /ipad|tablet|kindle|playbook|silk/.test(ua)
    || (isAndroid && !/mobile/.test(ua))

  const isMobile = /mobile|iphone|ipod|blackberry|opera mini|opera mobi|webos|windows phone/.test(ua)
    || (isAndroid && /mobile/.test(ua))

  if (isTablet) cats.push('tablet')
  else if (isMobile) cats.push('mobile')
  else cats.push('desktop')

  return cats
}

/**
 * 判断 lastAccessedAt 是否在"今天 UTC"
 */
function isSameUtcDay(ts1: number, ts2: number): boolean {
  if (!ts1 || !ts2) return false
  const day1 = Math.floor(ts1 / ONE_DAY_SECONDS)
  const day2 = Math.floor(ts2 / ONE_DAY_SECONDS)
  return day1 === day2
}

/**
 * 异步更新 lastAccessedAt 到 KV + D1
 */
async function updateAccessTime(
  event: any,
  link: any,
  KV: any,
  now: number,
): Promise<void> {
  try {
    const updated = { ...link, lastAccessedAt: now }
    const expiration = link.expiration && link.expiration > now ? link.expiration : undefined
    await KV.put(`link:${link.slug}`, JSON.stringify(updated), {
      expiration,
      metadata: {
        expiration,
        url: link.url,
        comment: link.comment,
      },
    })

    await updateLastAccessedAt(event, link.slug, now)
  }
  catch (err: any) {
    console.error('[redirect] updateAccessTime 失败:', link?.slug, err?.message)
  }
}

/**
 * 检查 cookie 中是否已通过密码验证
 * cookie 值格式:cookieToken(基于 passwordHash 派生,不暴露 hash 本身)
 */
function isPasswordVerified(event: any, slug: string, passwordHash: string): boolean {
  const cookieName = `${PWD_COOKIE_PREFIX}${slug}`
  const cookieVal = getCookie(event, cookieName)
  if (!cookieVal) return false
  // 简单校验:cookie 值 = passwordHash 前 16 位 (不可逆,只用于"已验证"标志)
  const expectedToken = passwordHash.slice(0, 16)
  return cookieVal === expectedToken
}

/**
 * 渲染密码输入页 HTML
 */
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
button:disabled { background: #aaa; cursor: not-allowed; }
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
  const { pathname: slug } = parsePath(event.path.replace(/^\/|\/$/g, ''))
  const { slugRegex, reserveSlug } = useAppConfig(event)
  const { homeURL, linkCacheTtl, redirectWithQuery, caseSensitive } = useRuntimeConfig(event)
  const { cloudflare } = event.context

  if (event.path === '/' && homeURL)
    return sendRedirect(event, homeURL)

  if (slug && !reserveSlug.includes(slug) && slugRegex.test(slug) && cloudflare) {
    const { KV } = cloudflare.env

    let link: z.infer<typeof LinkSchema> | null = null

    const getLink = async (key: string) =>
      await KV.get(`link:${key}`, { type: 'json', cacheTtl: linkCacheTtl })

    const lowerCaseSlug = slug.toLowerCase()
    link = await getLink(caseSensitive ? slug : lowerCaseSlug)

    if (!caseSensitive && !link && lowerCaseSlug !== slug) {
      console.log('original slug fallback:', `slug:${slug} lowerCaseSlug:${lowerCaseSlug}`)
      link = await getLink(slug)
    }

    if (link) {
      // ====== 密码保护检查(在跳转规则之前)======
      const passwordHash = (link as any).passwordHash
      if (passwordHash) {
        const verified = isPasswordVerified(event, link.slug, passwordHash)
        if (!verified) {
          // 没通过验证,返回密码输入页
          setHeader(event, 'content-type', 'text/html; charset=utf-8')
          setHeader(event, 'cache-control', 'no-store')
          return renderPasswordPage(link.slug)
        }
      }

      // 规则引擎
      let targetUrl = link.url
      let matchedRule: { ruleId: string, ruleType: string, variantIndex?: number } | null = null

      const rules = (link as any).rules
      if (Array.isArray(rules) && rules.length > 0) {
        const country = (event.context.cloudflare?.request?.cf as any)?.country
        const device = detectDeviceCategories(event)
        const matched = matchRules(rules, { country, device, now: new Date() })
        if (matched) {
          targetUrl = matched.url
          matchedRule = {
            ruleId: matched.ruleId,
            ruleType: matched.ruleType,
            variantIndex: matched.variantIndex,
          }
        }
      }

      event.context.link = link
      event.context.matchedRule = matchedRule
      event.context.resolvedUrl = targetUrl

      // 写访问日志
      try {
        await useAccessLog(event)
      }
      catch (error) {
        console.error('Failed write access log:', error)
      }

      // 更新 lastAccessedAt(每天最多 1 次)
      try {
        const now = Math.floor(Date.now() / 1000)
        const lastAt = (link as any).lastAccessedAt
        if (!lastAt || !isSameUtcDay(lastAt, now)) {
          await updateAccessTime(event, link, KV, now)
        }
      }
      catch (err: any) {
        console.error('[redirect] lastAccessedAt 更新失败:', err?.message)
      }

      // 决定状态码
      const target = redirectWithQuery ? withQuery(targetUrl, getQuery(event)) : targetUrl
      const hasRules = Array.isArray(rules) && rules.length > 0
      let statusCode: number
      if (hasRules) {
        statusCode = 302
      }
      else if ((link as any).redirectStatus) {
        statusCode = (link as any).redirectStatus
      }
      else {
        statusCode = +useRuntimeConfig(event).redirectStatusCode
      }
      return sendRedirect(event, target, statusCode)
    }
  }
})