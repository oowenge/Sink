<script setup>
import { Image as ImageIcon } from 'lucide-vue-next'

const props = defineProps({
  url: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
})

// 显示用的域名(从 URL 取主机名)
const domain = computed(() => {
  if (!props.url) return ''
  try {
    return new URL(props.url).hostname.replace(/^www\./, '')
  }
  catch {
    return ''
  }
})

const hasAny = computed(() => !!(props.title || props.description || props.image))

const showImageError = ref(false)
function onImageError() {
  showImageError.value = true
}

watch(() => props.image, () => {
  showImageError.value = false
})
</script>

<template>
  <div class="space-y-2">
    <p class="text-xs text-muted-foreground">
      分享预览效果(WhatsApp / iMessage / Twitter 等)
    </p>

    <!-- WhatsApp 风格 -->
    <div class="rounded-lg border bg-muted/30 overflow-hidden max-w-md">
      <div v-if="hasAny" class="flex flex-col">
        <!-- 图片 -->
        <div
          v-if="image && !showImageError"
          class="aspect-video bg-muted overflow-hidden"
        >
          <img
            :src="image"
            class="w-full h-full object-cover"
            @error="onImageError"
          >
        </div>
        <div
          v-else-if="image && showImageError"
          class="aspect-video bg-muted flex items-center justify-center text-muted-foreground text-xs"
        >
          <ImageIcon class="w-5 h-5 mr-2" /> 图片加载失败
        </div>

        <!-- 文字部分 -->
        <div class="p-3 space-y-1">
          <p v-if="domain" class="text-xs text-muted-foreground uppercase">
            {{ domain }}
          </p>
          <p v-if="title" class="font-semibold text-sm line-clamp-2">
            {{ title }}
          </p>
          <p v-if="description" class="text-xs text-muted-foreground line-clamp-3">
            {{ description }}
          </p>
        </div>
      </div>

      <!-- 没有任何 OG 数据 -->
      <div v-else class="p-6 text-center text-xs text-muted-foreground">
        <p>暂无预览数据</p>
        <p class="mt-1">填入下方字段后此处实时预览</p>
      </div>
    </div>
  </div>
</template>