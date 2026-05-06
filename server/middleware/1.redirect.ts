import type { LinkSchema } from '@@/schemas/link'
import type { z } from 'zod'
import { parsePath, withQuery } from 'ufo'

export default eventHandler(async (event) => {
  const { pathname: slug } = parsePath(event.path.replace(/^\/|\/$/g, '')) // remove leading and trailing slashes
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
      // 规则引擎: 检查 rules 数组,命中则替换 url
      let targetUrl = link.url
      let matchedRule: { ruleId: string, ruleType: string, variantIndex?: number } | null = null

      const rules = (link as any).rules
      if (Array.isArray(rules) && rules.length > 0) {
        const country = (event.context.cloudflare?.request?.cf as any)?.country
        const matched = matchRules(rules, { country, now: new Date() })
        if (matched) {
          targetUrl = matched.url
          matchedRule = {
            ruleId: matched.ruleId,
            ruleType: matched.ruleType,
            variantIndex: matched.variantIndex,
          }
        }
      }

      // 把命中规则信息挂到 event.context,access-log 可读
      event.context.link = link
      event.context.matchedRule = matchedRule
      event.context.resolvedUrl = targetUrl

      try {
        await useAccessLog(event)
      }
      catch (error) {
        console.error('Failed write access log:', error)
      }
      const target = redirectWithQuery ? withQuery(targetUrl, getQuery(event)) : targetUrl
      // 有规则时强制使用 302(防浏览器/CDN 缓存,每次重新计算规则)
      // 无规则时用配置的状态码(默认 301,性能更好)
      const hasRules = Array.isArray(rules) && rules.length > 0
      const statusCode = hasRules ? 302 : +useRuntimeConfig(event).redirectStatusCode
      return sendRedirect(event, target, statusCode)
    }
  }
})