import { z } from 'zod'

// ===== 安全工具:与 link.ts 一致的 regex =====
const COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
function colorField(maxLen: number = 20) {
  return z.string().trim().max(maxLen).regex(COLOR_REGEX, 'must be a hex color like #RRGGBB')
}

const PIXEL_FB_REGEX = /^\d{6,20}$/
const PIXEL_GOOGLE_REGEX = /^(?:G|AW|UA|GT)-[A-Za-z0-9-]{4,40}$/
const PIXEL_TIKTOK_REGEX = /^[\w-]{5,40}$/
const PIXEL_TWITTER_REGEX = /^\w{5,40}$/

/**
 * Splash 中转页模板 schema
 */
export const SplashTemplateSchema = z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().url().max(2048).refine(
    (u) => {
      try {
        return ['http:', 'https:'].includes(new URL(u).protocol)
      }
      catch {
        return false
      }
    },
    { message: 'URL scheme must be http or https' },
  ).optional().or(z.literal('')),
  buttonText: z.string().trim().max(50).optional(),
  buttonColor: colorField(20).optional(),
  bgColor: colorField(20).optional(),
  textColor: colorField(20).optional(),
  countdownSeconds: z.number().int().min(0).max(60).default(5),
  pixelFacebook: z.string().trim().max(50).regex(PIXEL_FB_REGEX, 'Facebook Pixel ID must be 6-20 digits').optional().or(z.literal('')),
  pixelGoogleAds: z.string().trim().max(100).regex(PIXEL_GOOGLE_REGEX, 'Google ID must be like G-XXXX / AW-XXXX / UA-XXXX / GT-XXXX').optional().or(z.literal('')),
  pixelTiktok: z.string().trim().max(50).regex(PIXEL_TIKTOK_REGEX, 'TikTok Pixel ID format invalid').optional().or(z.literal('')),
  pixelTwitter: z.string().trim().max(50).regex(PIXEL_TWITTER_REGEX, 'Twitter Pixel ID format invalid').optional().or(z.literal('')),
  // customHtml: 保留字段,API 层做 admin 权限门(仅 admin 可写)
  customHtml: z.string().trim().max(5000).optional(),
})

export type SplashTemplate = z.infer<typeof SplashTemplateSchema>

/**
 * 内置模板预设(用户可"复制并修改"快速创建)
 */
export const BUILTIN_PRESETS = [
  {
    key: 'simple',
    label: '简约',
    description: '白底黑字,5 秒倒计时',
    config: {
      title: '即将跳转',
      subtitle: '页面将在 5 秒后自动跳转',
      buttonText: '立即跳转',
      buttonColor: '#0066cc',
      bgColor: '#ffffff',
      textColor: '#333333',
      countdownSeconds: 5,
    },
  },
  {
    key: 'brand',
    label: '品牌曝光',
    description: '带图片 + 大标题,8 秒',
    config: {
      title: '欢迎',
      subtitle: '感谢您的访问,即将为您跳转',
      buttonText: '继续前往',
      buttonColor: '#667eea',
      bgColor: '#f5f7fa',
      textColor: '#1a202c',
      countdownSeconds: 8,
    },
  },
  {
    key: 'promo',
    label: '营销活动',
    description: '彩色背景 + 倒计时 + CTA,10 秒',
    config: {
      title: '🎉 活动进行中',
      subtitle: '点击下方按钮立即查看活动详情',
      buttonText: '立即查看',
      buttonColor: '#ff6b35',
      bgColor: '#ffe5d9',
      textColor: '#5c2e00',
      countdownSeconds: 10,
    },
  },
  {
    key: 'minimal',
    label: '极简',
    description: '仅按钮,3 秒',
    config: {
      title: '',
      subtitle: '',
      buttonText: '继续',
      buttonColor: '#000000',
      bgColor: '#ffffff',
      textColor: '#000000',
      countdownSeconds: 3,
    },
  },
]
