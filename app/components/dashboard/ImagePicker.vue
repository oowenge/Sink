<script setup>
import { Image as ImageIcon, Link2, Loader2, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '图片网址',
  },
})

const emit = defineEmits(['update:modelValue'])

const mode = ref('url') // 'url' / 'upload'
const uploading = ref(false)
const fileInput = ref(null)
const preview = ref('')
const showImageError = ref(false)
const dragActive = ref(false)

watch(() => props.modelValue, (v) => {
  preview.value = v || ''
  showImageError.value = false
}, { immediate: true })

function updateUrl(e) {
  emit('update:modelValue', e.target.value)
}

function clearImage() {
  emit('update:modelValue', '')
  if (fileInput.value) fileInput.value.value = ''
}

function triggerUpload() {
  fileInput.value?.click()
}

/**
 * 压缩图片:
 *   - 最长边 > 512 -> 缩到 512 等比
 *   - JPEG/WebP 质量 0.75
 *   - PNG 保留(避免破坏透明背景)
 *   - GIF 不压缩(canvas 只能取第一帧,会破坏动画)
 *   - < 200 KB 不压(没必要)
 */
async function compressImage(file) {
  if (file.type === 'image/gif') return file
  if (file.size < 200 * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxSize = 512
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * maxSize / width)
          width = maxSize
        }
        else {
          width = Math.round(width * maxSize / height)
          height = maxSize
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const quality = outputType === 'image/jpeg' ? 0.75 : undefined
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(file)
          return
        }
        if (blob.size >= file.size) {
          resolve(file)
          return
        }
        const ext = outputType === 'image/png' ? 'png' : 'jpg'
        const baseName = file.name.replace(/\.[^/.]+$/, '')
        const compressed = new File([blob], `${baseName}.${ext}`, { type: outputType })
        resolve(compressed)
      }, outputType, quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

async function handleFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    toast.error('只支持 JPG / PNG / WebP / GIF')
    e.target.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    toast.error(`文件过大: ${(file.size / 1024 / 1024).toFixed(2)} MB,最大 5 MB`)
    e.target.value = ''
    return
  }

  uploading.value = true
  try {
    const compressed = await compressImage(file)
    const ratio = (compressed.size / file.size * 100).toFixed(0)
    if (compressed !== file) {
      console.log(`[upload] 压缩: ${(file.size / 1024).toFixed(0)} KB -> ${(compressed.size / 1024).toFixed(0)} KB (${ratio}%)`)
    }

    const form = new FormData()
    form.append('image', compressed)
    const data = await useAPI('/api/upload-image', {
      method: 'POST',
      body: form,
    })
    emit('update:modelValue', data.url)
    toast.success('上传成功')
  }
  catch (err) {
    console.error(err)
    toast.error(err?.data?.message || '上传失败')
  }
  finally {
    uploading.value = false
    e.target.value = ''
  }
}

function onDragOver(e) {
  e.preventDefault()
  dragActive.value = true
}
function onDragLeave() {
  dragActive.value = false
}
async function onDrop(e) {
  e.preventDefault()
  dragActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const fakeEvent = { target: { files: [file], value: '' } }
  await handleFileSelect(fakeEvent)
}
</script>

<template>
  <div class="space-y-2">
    <!-- 模式切换 tabs -->
    <div class="flex gap-1 text-xs">
      <button
        type="button"
        class="px-2 py-1 rounded transition-colors"
        :class="mode === 'url' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
        @click="mode = 'url'"
      >
        <Link2 class="w-3 h-3 inline mr-1" /> 输入网址
      </button>
      <button
        type="button"
        class="px-2 py-1 rounded transition-colors"
        :class="mode === 'upload' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
        @click="mode = 'upload'"
      >
        <Upload class="w-3 h-3 inline mr-1" /> 上传图片
      </button>
    </div>

    <!-- URL 输入 -->
    <div v-if="mode === 'url'">
      <Input
        :model-value="modelValue"
        :placeholder="placeholder"
        @input="updateUrl"
      />
    </div>

    <!-- 上传 -->
    <div v-else>
      <div
        class="rounded-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors"
        :class="dragActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'"
        @click="triggerUpload"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <div v-if="uploading" class="flex flex-col items-center gap-1 text-sm text-muted-foreground">
          <Loader2 class="w-5 h-5 animate-spin" />
          <span>上传中...</span>
        </div>
        <div v-else class="flex flex-col items-center gap-1 text-sm text-muted-foreground">
          <Upload class="w-5 h-5" />
          <span>点击或拖拽图片到此处</span>
          <span class="text-xs">JPG / PNG / WebP / GIF · 最大 5 MB</span>
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="handleFileSelect"
      >
    </div>

    <!-- 图片预览 + 删除 -->
    <div v-if="preview" class="relative inline-block">
      <img
        :src="preview"
        class="max-w-[200px] max-h-[120px] rounded border object-contain bg-muted/20"
        @error="showImageError = true"
      >
      <button
        type="button"
        class="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80"
        title="清除图片"
        @click.stop="clearImage"
      >
        <X class="w-3 h-3" />
      </button>
      <p v-if="showImageError" class="text-xs text-destructive mt-1">
        <ImageIcon class="w-3 h-3 inline" /> 图片无法加载
      </p>
    </div>
  </div>
</template>