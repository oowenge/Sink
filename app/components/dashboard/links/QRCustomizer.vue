<script setup>
import { Download, RotateCcw } from 'lucide-vue-next'
import QRCodeStyling from 'qr-code-styling'
import { DEFAULT_QR_CONFIG, QR_PRESETS } from '@/utils/qr-presets'

const props = defineProps({
  modelValue: {
    type: Object,
    default: null,
  },
  shortLinkUrl: {
    type: String,
    default: '',
  },
  slug: {
    type: String,
    default: 'qrcode',
  },
  defaultLogo: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const config = ref({ ...DEFAULT_QR_CONFIG, ...(props.modelValue || {}) })

watch(() => props.modelValue, (v) => {
  if (v) {
    const merged = { ...DEFAULT_QR_CONFIG, ...v }
    if (merged.logoUrl && (!merged.logoSize || merged.logoSize < 0.2)) {
      merged.logoSize = 0.3
    }
    config.value = merged
  }
})

function emitChange() {
  emit('update:modelValue', { ...config.value })
}

function applyPreset(preset) {
  config.value = {
    ...config.value,
    ...preset.config,
    preset: preset.key,
  }
  emitChange()
}

function reset() {
  config.value = { ...DEFAULT_QR_CONFIG }
  emitChange()
}

function onLogoChange(url) {
  config.value.logoUrl = url
  if (!config.value.logoSize || config.value.logoSize < 0.2) {
    config.value.logoSize = 0.3
  }
  emitChange()
}

function onField(field, value) {
  config.value[field] = value
  config.value.preset = ''
  emitChange()
}

const previewEl = ref(null)
let qrCode = null

function buildOptions() {
  const cfg = config.value
  const logoUrl = cfg.logoUrl || ''
  return {
    width: 200,
    height: 200,
    data: props.shortLinkUrl || 'https://example.com',
    margin: 8,
    image: logoUrl,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: cfg.errorCorrection || 'H',
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: Math.max(0.2, Math.min(0.5, cfg.logoSize ?? 0.3)),
      margin: cfg.logoMargin ?? 8,
      crossOrigin: 'anonymous',
    },
    dotsOptions: { type: cfg.dotsType || 'square', color: cfg.dotsColor || '#000000' },
    backgroundOptions: { color: cfg.bgColor || '#ffffff' },
    cornersSquareOptions: { type: cfg.cornerSquareType || 'square', color: cfg.cornerSquareColor || cfg.dotsColor || '#000000' },
    cornersDotOptions: { type: cfg.cornerDotType || 'square', color: cfg.cornerDotColor || cfg.dotsColor || '#000000' },
  }
}

onMounted(() => {
  qrCode = new QRCodeStyling(buildOptions())
  qrCode.append(previewEl.value)
})

watch(config, () => {
  if (qrCode) qrCode.update(buildOptions())
}, { deep: true })

watch(() => props.shortLinkUrl, () => {
  if (qrCode) qrCode.update(buildOptions())
})

function download(ext) {
  qrCode?.download({ extension: ext, name: `qr_${props.slug}` })
}
</script>

<template>
  <div class="space-y-4">
    <!-- 预设主题 -->
    <div class="space-y-2">
      <Label class="text-xs">预设主题</Label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="p in QR_PRESETS"
          :key="p.key"
          type="button"
          class="rounded border p-2 text-xs flex items-center gap-1 transition-colors"
          :class="config.preset === p.key
            ? 'bg-primary text-primary-foreground border-primary'
            : 'hover:bg-muted'"
          @click="applyPreset(p)"
        >
          <span>{{ p.emoji }}</span>
          <span>{{ p.label }}</span>
        </button>
      </div>
    </div>

    <Separator />

    <!-- 预览 + 下载 -->
    <div class="flex items-start gap-4">
      <div class="flex flex-col items-center gap-2">
        <div ref="previewEl" class="bg-white p-1 rounded border" />
        <div class="flex gap-1">
          <Button variant="outline" size="sm" @click="download('png')">
            <Download class="w-3 h-3 mr-1" /> PNG
          </Button>
          <Button variant="outline" size="sm" @click="download('svg')">
            <Download class="w-3 h-3 mr-1" /> SVG
          </Button>
        </div>
      </div>

      <!-- 自定义参数 -->
      <div class="flex-1 space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label class="text-xs">点样式</Label>
            <Select
              :model-value="config.dotsType"
              @update:model-value="v => onField('dotsType', v)"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">
                  方形
                </SelectItem>
                <SelectItem value="rounded">
                  圆角
                </SelectItem>
                <SelectItem value="dots">
                  圆点
                </SelectItem>
                <SelectItem value="classy">
                  典雅
                </SelectItem>
                <SelectItem value="classy-rounded">
                  典雅圆角
                </SelectItem>
                <SelectItem value="extra-rounded">
                  超圆
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <Label class="text-xs">点颜色</Label>
            <input
              type="color"
              :value="config.dotsColor"
              class="w-full h-9 rounded border cursor-pointer"
              @input="e => onField('dotsColor', e.target.value)"
            >
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label class="text-xs">背景色</Label>
            <input
              type="color"
              :value="config.bgColor"
              class="w-full h-9 rounded border cursor-pointer"
              @input="e => onField('bgColor', e.target.value)"
            >
          </div>
          <div class="space-y-1">
            <Label class="text-xs">纠错等级</Label>
            <Select
              :model-value="config.errorCorrection"
              @update:model-value="v => onField('errorCorrection', v)"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L">
                  L 低 (7%)
                </SelectItem>
                <SelectItem value="M">
                  M 中 (15%)
                </SelectItem>
                <SelectItem value="Q">
                  Q 较高 (25%)
                </SelectItem>
                <SelectItem value="H">
                  H 高 (30%) 推荐
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label class="text-xs">角框样式</Label>
            <Select
              :model-value="config.cornerSquareType"
              @update:model-value="v => onField('cornerSquareType', v)"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">
                  方形
                </SelectItem>
                <SelectItem value="extra-rounded">
                  圆角
                </SelectItem>
                <SelectItem value="dot">
                  圆点
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <Label class="text-xs">角点样式</Label>
            <Select
              :model-value="config.cornerDotType"
              @update:model-value="v => onField('cornerDotType', v)"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">
                  方形
                </SelectItem>
                <SelectItem value="dot">
                  圆点
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>

    <Separator />

    <!-- Logo -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-xs">中心 Logo</Label>
        <p class="text-xs text-muted-foreground">
          留空 = 不带 Logo
        </p>
      </div>
      <DashboardImagePicker
        :model-value="config.logoUrl"
        placeholder="Logo 网址或上传"
        @update:model-value="onLogoChange"
      />
      <div v-if="config.logoUrl" class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <Label class="text-xs">Logo 大小 ({{ Math.round((config.logoSize ?? 0.3) * 100) }}%)</Label>
          <input
            type="range"
            min="0.2"
            max="0.5"
            step="0.05"
            :value="config.logoSize ?? 0.3"
            class="w-full"
            @input="e => onField('logoSize', Number(e.target.value))"
          >
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Logo 边距 ({{ config.logoMargin ?? 8 }}px)</Label>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            :value="config.logoMargin ?? 8"
            class="w-full"
            @input="e => onField('logoMargin', Number(e.target.value))"
          >
        </div>
      </div>
    </div>

    <Separator />

    <!-- 重置 -->
    <Button variant="ghost" size="sm" @click="reset">
      <RotateCcw class="w-3 h-3 mr-2" /> 恢复默认
    </Button>
  </div>
</template>