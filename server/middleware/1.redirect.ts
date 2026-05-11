import type { LinkSchema } from '@@/schemas/link'
import type { z } from 'zod'
import { parsePath, withQuery } from 'ufo'
import { getSplashTemplate, mergeSplashConfig } from '@@/server/utils/splash-template'
import { renderSplashPage } from '@@/server/utils/splash-page'

// 一天的秒数(用于判断 lastAccessedAt 是否需要更新)
const ONE_DAY_SECONDS = 24 * 60 * 60
// 密码验证 cookie 名前缀
const PWD_COOKIE_PREFIX = 'sink_pwd_'

/**
 * 检测访问者是不是 OG 抓取爬虫
 * 涵盖 WhatsApp/Telegram/iMessage/Twitter/Facebook/Slack/Discord/LinkedIn 等
 */
function isOgCrawler(ua: string): boolean {
  if (!ua) return false
  return /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|slackbot|slack-imgproxy|skype|pinterest|tumblr|redditbot|applebot|googlebot|bingbot|yandex|baiduspider|microsoft office|msedge.*preview/i.test(ua)
}

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
 */
function isPasswordVerified(event: any, slug: string, passwordHash: string): boolean {
  const cookieName = `${PWD_COOKIE_PREFIX}${slug}`
  const cookieVal = getCookie(event, cookieName)
  if (!cookieVal) return false
  const expectedToken = passwordHash.slice(0, 16)
  return cookieVal === expectedToken
}

/**
 * 计算 OG 卡片要用的元数据
 * 优先级:用户手填 > 自动抓取缓存 > 无
 */
function resolveOgMetadata(link: any): { title?: string, description?: string, image?: string } {
  return {
    title: link.title || link.ogTitle,
    description: link.description || link.ogDescription,
    image: link.image || link.ogImage,
  }
}

/**
 * HTML 实体转义(防 XSS)
 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 渲染带 OG meta 的 HTML(给爬虫看)
 * 也带 meta refresh 兜底跳转(万一被人浏览器打开)
 */
function renderOgHtml(targetUrl: string, og: { title?: string, description?: string, image?: string }): string {
  const title = og.title ? escHtml(og.title) : ''
  const desc = og.description ? escHtml(og.description) : ''
  const image = og.image ? escHtml(og.image) : ''
  const safeUrl = escHtml(targetUrl)

  const ogTags: string[] = []
  // 标题
  if (title) {
    ogTags.push(`<title>${title}</title>`)
    ogTags.push(`<meta property="og:title" content="${title}">`)
    ogTags.push(`<meta name="twitter:title" content="${title}">`)
  }
  // 描述
  if (desc) {
    ogTags.push(`<meta name="description" content="${desc}">`)
    ogTags.push(`<meta property="og:description" content="${desc}">`)
    ogTags.push(`<meta name="twitter:description" content="${desc}">`)
  }
  // 图片
  if (image) {
    ogTags.push(`<meta property="og:image" content="${image}">`)
    ogTags.push(`<meta name="twitter:image" content="${image}">`)
    ogTags.push(`<meta name="twitter:card" content="summary_large_image">`)
  }
  else {
    ogTags.push(`<meta name="twitter:card" content="summary">`)
  }
  // 共用
  ogTags.push(`<meta property="og:url" content="${safeUrl}">`)
  ogTags.push(`<meta property="og:type" content="website">`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0; url=${safeUrl}">
${ogTags.join('\n')}
</head>
<body>
<p>Redirecting to <a href="${safeUrl}">${safeUrl}</a>...</p>
<script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`
}

/**
 * 后台抓取 OG 元数据并更新缓存
 * 不 await,fire-and-forget
 */
async function fetchAndCacheOg(event: any, link: any, KV: any): Promise<void> {
  try {
    const og = await fetchOgMetadata(link.url)
    const now = Math.floor(Date.now() / 1000)
    const hasAnyData = og.title || og.description || og.image

    if (!hasAnyData) {
      // 抓不到任何数据,也记一下 fetchedAt 避免反复尝试
      await updateOgCache(event, link.slug, {}, now)
      return
    }

    // 更新 D1
    await updateOgCache(event, link.slug, og, now)

    // 同步更新 KV(让下次访问立即能用)
    const updatedLink = {
      ...link,
      ogTitle: og.title,
      ogDescription: og.description,
      ogImage: og.image,
      ogFetchedAt: now,
    }
    const expiration = link.expiration && link.expiration > now ? link.expiration : undefined
    await KV.put(`link:${link.slug}`, JSON.stringify(updatedLink), {
      expiration,
      metadata: {
        expiration,
        url: link.url,
        comment: link.comment,
      },
    })
  }
  catch (err: any) {
    console.error('[redirect] OG 抓取失败:', link?.slug, err?.message)
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
          const lang = resolvePasswordLang(
            (link as any).passwordLang,
            getRequestHeader(event, 'accept-language'),
          )
          setHeader(event, 'content-type', 'text/html; charset=utf-8')
          setHeader(event, 'cache-control', 'no-store')
          return renderPasswordPage(link.slug, lang)
        }
      }

      // 规则引擎(决定目标 URL)
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

      // ====== OG 爬虫检测 ======
      const ua = getRequestHeader(event, 'user-agent') || ''
      if (isOgCrawler(ua)) {
        // 1. 计算要返回的 OG 数据(用户手填 > 自动抓取缓存)
        const og = resolveOgMetadata(link as any)
        const hasAnyOgData = og.title || og.description || og.image

        // 2. 如果没有任何 OG 数据 + 缓存已过期 -> 触发懒抓取
        // (注意:这里是 await 不是 fire-and-forget,因为爬虫不会重试)
        if (!hasAnyOgData && !isOgCacheFresh((link as any).ogFetchedAt)) {
          await fetchAndCacheOg(event, link, KV)
          // 重新计算
          const refreshed = await KV.get(`link:${link.slug}`, { type: 'json' }) as any
          if (refreshed) {
            Object.assign(link, refreshed)
            const refreshedOg = resolveOgMetadata(refreshed)
            if (refreshedOg.title || refreshedOg.description || refreshedOg.image) {
              setHeader(event, 'content-type', 'text/html; charset=utf-8')
              setHeader(event, 'cache-control', 'public, max-age=3600')
              return renderOgHtml(targetUrl, refreshedOg)
            }
          }
        }
        else if (hasAnyOgData) {
          setHeader(event, 'content-type', 'text/html; charset=utf-8')
          setHeader(event, 'cache-control', 'public, max-age=3600')
          return renderOgHtml(targetUrl, og)
        }
        // 没有任何 OG 数据,fallthrough 到普通 302
      }

      // ====== 关键:爬虫不写访问日志,直接 302(不污染 Analytics) ======
      // 此时爬虫 = OG 抓不到任何数据的爬虫(罕见),给 302 让它去拿目标内容
      if (isOgCrawler(ua)) {
        const target = redirectWithQuery ? withQuery(targetUrl, getQuery(event)) : targetUrl
        return sendRedirect(event, target, 302)
      }

      // ====== Splash 中转页(仅对真人访客;爬虫永远跳过 Splash) ======
      const splashTemplateId = (link as any).splashTemplateId
      const query = getQuery(event)
      const splashSkip = query?.splash_skip === '1' || query?.splash_skip === 1

      if (splashTemplateId && !splashSkip && !isOgCrawler(ua)) {
        try {
          const template = await getSplashTemplate(event, splashTemplateId)
          if (template) {
            const splashCfg = mergeSplashConfig(template, (link as any).splashOverrides)
            // 写访问日志(在 Splash 之前记录,因为用户已经"点了"短链)
            try {
              await useAccessLog(event)
            }
            catch (error) {
              console.error('Failed write access log (splash):', error)
            }
            // 更新 lastAccessedAt
            try {
              const now = Math.floor(Date.now() / 1000)
              const lastAt = (link as any).lastAccessedAt
              if (!lastAt || !isSameUtcDay(lastAt, now)) {
                await updateAccessTime(event, link, KV, now)
              }
            }
            catch (err: any) {
              console.error('[redirect] lastAccessedAt 更新失败(splash):', err?.message)
            }
            // 计算最终 URL(用规则引擎决定的)
            const splashTarget = redirectWithQuery ? withQuery(targetUrl, query) : targetUrl
            // 渲染 Splash HTML
            const html = renderSplashPage({
              finalUrl: splashTarget,
              title: splashCfg.title,
              subtitle: splashCfg.subtitle,
              imageUrl: splashCfg.imageUrl,
              buttonText: splashCfg.buttonText,
              buttonColor: splashCfg.buttonColor,
              bgColor: splashCfg.bgColor,
              textColor: splashCfg.textColor,
              countdownSeconds: splashCfg.countdownSeconds,
              pixelFacebook: splashCfg.pixelFacebook,
              pixelGoogleAds: splashCfg.pixelGoogleAds,
              pixelTiktok: splashCfg.pixelTiktok,
              pixelTwitter: splashCfg.pixelTwitter,
              customHtml: splashCfg.customHtml,
            })
            setHeader(event, 'content-type', 'text/html; charset=utf-8')
            setHeader(event, 'cache-control', 'no-store')
            return html
          }
          // 模板不存在(可能已被删除),fallthrough 到普通跳转
        }
        catch (err: any) {
          console.error('[redirect] Splash 渲染失败:', err?.message)
          // 出错也 fallthrough 到普通跳转,不影响主流程
        }
      }

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