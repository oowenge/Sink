/**
 * OG 元数据抓取工具
 *
 * 从目标 URL 抓取 <meta og:title> / og:description / og:image
 *
 * 设计要点:
 *   - 超时 5 秒(Cloudflare Workers CPU 时间有限)
 *   - 只读前 64KB(大部分网站 OG meta 都在前面)
 *   - 7 天缓存(由调用方判断 ogFetchedAt)
 */

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML_SIZE = 64 * 1024 // 64 KB
const OG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

export interface OgMetadata {
  title?: string
  description?: string
  image?: string
}

/**
 * 判断 OG 缓存是否仍然有效
 */
export function isOgCacheFresh(ogFetchedAt: number | undefined): boolean {
  if (!ogFetchedAt) return false
  const now = Math.floor(Date.now() / 1000)
  return now - ogFetchedAt < OG_CACHE_TTL_SECONDS
}

/**
 * 简单的 HTML meta 标签解析(不引入完整 HTML 解析器以节省 worker 时间)
 */
function extractMetaContent(html: string, property: string): string | undefined {
  // 匹配 <meta property="og:xxx" content="yyy"> 或 <meta name="og:xxx" content="yyy">
  // 也支持反向 <meta content="yyy" property="og:xxx">
  const propEscaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const patterns = [
    new RegExp(`<meta\\s+[^>]*?(?:property|name)\\s*=\\s*["']${propEscaped}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta\\s+[^>]*?content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${propEscaped}["']`, 'i'),
  ]

  for (const re of patterns) {
    const match = html.match(re)
    if (match && match[1]) {
      // HTML 实体解码常见几个
      return match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .trim()
    }
  }
  return undefined
}

/**
 * 提取 <title> 标签内容
 */
function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : undefined
}

/**
 * 从 URL 抓取 OG 元数据
 *
 * 优先级:og:xxx > twitter:xxx > meta description / title 标签
 *
 * @param url 要抓取的目标 URL
 * @returns OG 元数据,失败返回空对象
 */
export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  const result: OgMetadata = {}

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // 假装是一个普通浏览器,避免被某些站点拒绝
        'user-agent': 'Mozilla/5.0 (compatible; CTOpenGraphFetcher/1.0; +https://cturl.dpdns.org)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn('[og-fetcher] HTTP', res.status, url)
      return result
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      console.warn('[og-fetcher] 非 HTML 内容,跳过:', contentType)
      return result
    }

    // 流式读取前 MAX_HTML_SIZE 字节
    const reader = res.body?.getReader()
    if (!reader) return result

    const decoder = new TextDecoder('utf-8', { fatal: false })
    let html = ''
    let totalSize = 0

    while (totalSize < MAX_HTML_SIZE) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      totalSize += value.byteLength
      // 如果已经找到 </head>,可以提前结束
      if (html.toLowerCase().includes('</head>')) break
    }

    // 主动 cancel,避免读完全部 body
    try { await reader.cancel() } catch {}

    // 提取 OG meta(优先 og: > twitter: > 普通)
    result.title = extractMetaContent(html, 'og:title')
      || extractMetaContent(html, 'twitter:title')
      || extractTitle(html)

    result.description = extractMetaContent(html, 'og:description')
      || extractMetaContent(html, 'twitter:description')
      || extractMetaContent(html, 'description')

    result.image = extractMetaContent(html, 'og:image')
      || extractMetaContent(html, 'og:image:url')
      || extractMetaContent(html, 'twitter:image')
      || extractMetaContent(html, 'twitter:image:src')

    // 如果 og:image 是相对路径,补全成绝对路径
    if (result.image && !result.image.match(/^https?:\/\//i)) {
      try {
        result.image = new URL(result.image, url).toString()
      }
      catch {
        result.image = undefined
      }
    }

    return result
  }
  catch (err: any) {
    console.warn('[og-fetcher] 抓取失败:', url, err?.message)
    return result
  }
}