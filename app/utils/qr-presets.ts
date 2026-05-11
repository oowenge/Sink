/**
 * QR 码预设主题
 *
 * 每个预设是一组 qr-code-styling 的配置
 */

export interface QrPreset {
  key: string
  label: string
  emoji: string
  config: {
    dotsType: string
    dotsColor: string
    bgColor: string
    cornerSquareType: string
    cornerSquareColor: string
    cornerDotType: string
    cornerDotColor: string
  }
}

export const QR_PRESETS: QrPreset[] = [
  {
    key: 'classic',
    label: '经典黑白',
    emoji: '⚫',
    config: {
      dotsType: 'square',
      dotsColor: '#000000',
      bgColor: '#ffffff',
      cornerSquareType: 'square',
      cornerSquareColor: '#000000',
      cornerDotType: 'square',
      cornerDotColor: '#000000',
    },
  },
  {
    key: 'tech-blue',
    label: '科技蓝',
    emoji: '🔵',
    config: {
      dotsType: 'rounded',
      dotsColor: '#1e40af',
      bgColor: '#ffffff',
      cornerSquareType: 'extra-rounded',
      cornerSquareColor: '#1e40af',
      cornerDotType: 'dot',
      cornerDotColor: '#3b82f6',
    },
  },
  {
    key: 'business',
    label: '商务深灰',
    emoji: '⬛',
    config: {
      dotsType: 'classy',
      dotsColor: '#1f2937',
      bgColor: '#ffffff',
      cornerSquareType: 'square',
      cornerSquareColor: '#1f2937',
      cornerDotType: 'square',
      cornerDotColor: '#374151',
    },
  },
  {
    key: 'neon-pink',
    label: '霓虹粉',
    emoji: '🌸',
    config: {
      dotsType: 'dots',
      dotsColor: '#ec4899',
      bgColor: '#ffffff',
      cornerSquareType: 'extra-rounded',
      cornerSquareColor: '#db2777',
      cornerDotType: 'dot',
      cornerDotColor: '#ec4899',
    },
  },
  {
    key: 'forest-green',
    label: '森林绿',
    emoji: '🌳',
    config: {
      dotsType: 'classy-rounded',
      dotsColor: '#15803d',
      bgColor: '#f0fdf4',
      cornerSquareType: 'extra-rounded',
      cornerSquareColor: '#166534',
      cornerDotType: 'dot',
      cornerDotColor: '#22c55e',
    },
  },
  {
    key: 'sunset-orange',
    label: '日落橙',
    emoji: '🌅',
    config: {
      dotsType: 'extra-rounded',
      dotsColor: '#ea580c',
      bgColor: '#fff7ed',
      cornerSquareType: 'extra-rounded',
      cornerSquareColor: '#c2410c',
      cornerDotType: 'dot',
      cornerDotColor: '#f97316',
    },
  },
]

/**
 * 默认配置(经典黑白)
 */
export const DEFAULT_QR_CONFIG = {
  ...QR_PRESETS[0].config,
  logoMargin: 8,
  logoSize: 0.3,
  errorCorrection: 'H',
  preset: 'classic',
}