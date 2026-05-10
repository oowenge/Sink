import type { LinkSchema } from '@@/schemas/link'
import type { z } from 'zod'
import { parsePath, withQuery } from 'ufo'

/**
 * 从 User-Agent 解析设备类别
 * 一个访问者可能匹配多个类别(例如 iPhone = mobile + ios)
 */
function detectDeviceCategories(event: any): Array<'mobile' | 'tablet' | 'desktop' | 'ios' | 'android' | 'bot'> {
  const ua = (getRequestHeader(event, 'user-agent') || '').toLowerCase()
  const cats: Array<'mobile' | 'tablet' | 'desktop' | 'ios' | 'android' | 'bot'> = []

  if (!ua) return ['desktop'] // 没 UA 兜底为桌面

  // bot 检测(优先级最高)
  if (/bot|spider|crawler|fetch|curl|wget|postman|axios|python|java\//i.test(ua)) {
    cats.push('bot')
    return cats
  }

  // iOS 检测(iPhone/iPad/iPod)
  const isIos = /iphone|ipad|ipod/.test(ua)
  if (isIos) cats.push('ios')

  // 安卓检测
  const isAndroid = /android/.test(ua)
  if (isAndroid) cats.push('android')

  // 平板检测
  const isTablet = /ipad|tablet|kindle|playbook|silk/.test(ua)
    || (isAndroid && !/mobile/.test(ua)) // 安卓平板的 UA 通常不含 'mobile'

  // 移动检测
  const isMobile = /mobile|iphone|ipod|blackberry|opera mini|opera mobi|webos|windows phone/.test(ua)
    || (isAndroid && /mobile/.test(ua))

  if (isTablet) cats.push('tablet')
  else if (isMobile) cats.push('mobile')
  else cats.push('desktop')

  return cats
}

// 一天的秒数(用于判断 lastAccessedAt 是否需要更新)
const ONE_DAY_SECONDS = 24 * 60 * 60

/**
 * 判断 lastAccessedAt 是否在"今天 UTC"
 * 同一 UTC 日期内只更新一次,避免高频写入
 */
function isSameUtcDay(ts1: number, ts2: number): boolean {
  if (!ts1 || !ts2) return false
  const day1 = Math.floor(ts1 / ONE_DAY_SECONDS)
  const day2 = Math.floor(ts2 / ONE_DAY_SECONDS)
  return day1 === day2
}

/**
 * 异步更新 lastAccessedAt 到 KV + D1
 * 用 event.waitUntil 在后台执行,不阻塞跳转响应
 */
async function updateAccessTime(
  event: any,
  link: any,
  KV: any,
  now: number,
): Promise<void> {
  try {
    // 更新 KV(写完整 link 对象,只改 lastAccessedAt)
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

    // 更新 D1(只改一个字段,效率高)
    await updateLastAccessedAt(event, link.slug, now)
  }
  catch (err: any) {
    console.error('[redirect] updateAccessTime 失败:', link?.slug, err?.message)
  }
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

    // fallback to original slug if caseSensitive is false and the slug is not found
    if (!caseSensitive && !link && lowerCaseSlug !== slug) {
      console.log('original slug fallback:', `slug:${slug} lowerCaseSlug:${lowerCaseSlug}`)
      link = await getLink(slug)
    }

    if (link) {
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

      // 写访问日志(原有)
      try {
        await useAccessLog(event)
      }
      catch (error) {
        console.error('Failed write access log:', error)
      }

      // 更新 lastAccessedAt(每天最多 1 次,直接 await 保证执行)
      try {
        const now = Math.floor(Date.now() / 1000)
        const lastAt = (link as any).lastAccessedAt
        if (!lastAt || !isSameUtcDay(lastAt, now)) {
          console.log('[redirect] 更新 lastAccessedAt:', link.slug, 'old=', lastAt, 'new=', now)
          await updateAccessTime(event, link, KV, now)
        }
      }
      catch (err: any) {
        console.error('[redirect] lastAccessedAt 更新失败:', err?.message)
      }

      // 决定状态码
      // 优先级: 有规则强制 302 > 链接配置 redirectStatus > 全局默认
      const target = redirectWithQuery ? withQuery(targetUrl, getQuery(event)) : targetUrl
      const hasRules = Array.isArray(rules) && rules.length > 0
      let statusCode: number
      if (hasRules) {
        statusCode = 302 // 有规则强制 302,防 CDN 缓存
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