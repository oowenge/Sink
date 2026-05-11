<script setup>
import { Download } from 'lucide-vue-next'
import QRCodeStyling from 'qr-code-styling'

const props = defineProps({
  data: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: '',
  },
  // 用户保存的 QR 配置(从 link.qrConfig 来)
  qrConfig: {
    type: Object,
    default: null,
  },
})

const qrCodeEl = ref(null)
let qrCode = null

function buildOptions() {
  // 默认 = 经典黑白 + 错误纠正 H
  const cfg = props.qrConfig || {}
  // 优先用户配置的 logo;不用 props.image(它是 Google favicon,有 CORS 问题)
  // 如果用户没配置 logo,QR 就不带 logo
  const logoUrl = cfg.logoUrl || ''

  return {
    width: 256,
    height: 256,
    data: props.data,
    margin: 10,
    image: logoUrl,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: cfg.errorCorrection || 'H',
    },
    imageOptions: {
      hideBackgroundDots: true,
      // 夹紧:logoSize < 0.2 会让库内部渲染崩溃,> 0.5 影响扫码
      imageSize: Math.max(0.2, Math.min(0.5, cfg.logoSize ?? 0.3)),
      margin: cfg.logoMargin ?? 8,
      crossOrigin: 'anonymous',
    },
    dotsOptions: {
      type: cfg.dotsType || 'square',
      color: cfg.dotsColor || '#000000',
    },
    backgroundOptions: {
      color: cfg.bgColor || '#ffffff',
    },
    cornersSquareOptions: {
      type: cfg.cornerSquareType || 'square',
      color: cfg.cornerSquareColor || cfg.dotsColor || '#000000',
    },
    cornersDotOptions: {
      type: cfg.cornerDotType || 'square',
      color: cfg.cornerDotColor || cfg.dotsColor || '#000000',
    },
  }
}

function downloadQRCode(ext = 'png') {
  const slug = props.data.split('/').pop()
  qrCode?.download({ extension: ext, name: `qr_${slug}` })
}

onMounted(async () => {
  qrCode = new QRCodeStyling(buildOptions())
  try {
    qrCode.append(qrCodeEl.value)
  }
  catch (error) {
    console.error('QR append failed:', error)
  }
})

// 当 qrConfig 或 data 变化时,重新渲染
watch(() => [props.data, props.qrConfig, props.image], () => {
  if (qrCode) {
    qrCode.update(buildOptions())
  }
})
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div
      ref="qrCodeEl"
      :data-text="data"
      class="bg-white p-1 rounded-lg"
    />
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        @click="downloadQRCode('png')"
      >
        <Download class="w-4 h-4 mr-2" />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        @click="downloadQRCode('svg')"
      >
        <Download class="w-4 h-4 mr-2" />
        SVG
      </Button>
    </div>
  </div>
</template>