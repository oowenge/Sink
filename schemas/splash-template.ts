import { z } from 'zod'

/**
 * Splash 中转页模板 schema
 */
export const SplashTemplateSchema = z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().url().max(2048).optional().or(z.literal('')),
  buttonText: z.string().trim().max(50).optional(),
  buttonColor: z.string().trim().max(20).optional(),
  bgColor: z.string().trim().max(20).optional(),
  textColor: z.string().trim().max(20).optional(),
  countdownSeconds: z.number().int().min(0).max(60).default(5),
  pixelFacebook: z.string().trim().max(50).optional(),
  pixelGoogleAds: z.string().trim().max(100).optional(),
  pixelTiktok: z.string().trim().max(50).optional(),
  pixelTwitter: z.string().trim().max(50).optional(),
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