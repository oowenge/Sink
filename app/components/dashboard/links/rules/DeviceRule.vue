<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const DEVICE_OPTIONS = [
  { value: 'mobile', label: '📱 手机', desc: '手机浏览器' },
  { value: 'tablet', label: '💻 平板', desc: 'iPad/Android 平板' },
  { value: 'desktop', label: '🖥️ 桌面', desc: '电脑浏览器' },
  { value: 'ios', label: '🍎 iOS', desc: 'iPhone/iPad' },
  { value: 'android', label: '🤖 安卓', desc: 'Android 设备' },
  { value: 'bot', label: '🤖 爬虫', desc: '搜索引擎/AI 抓取' },
]

function isSelected(value) {
  return Array.isArray(props.modelValue.match) && props.modelValue.match.includes(value)
}

function toggle(value) {
  const current = Array.isArray(props.modelValue.match) ? [...props.modelValue.match] : []
  const idx = current.indexOf(value)
  if (idx >= 0) {
    current.splice(idx, 1)
  }
  else {
    current.push(value)
  }
  emit('update:modelValue', { ...props.modelValue, match: current })
}

function updateUrl(e) {
  emit('update:modelValue', { ...props.modelValue, url: e.target.value })
}
</script>

<template>
  <div class="space-y-3">
    <!-- 设备选择 -->
    <div class="space-y-2">
      <Label class="text-xs">匹配设备(可多选)</Label>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="opt in DEVICE_OPTIONS"
          :key="opt.value"
          type="button"
          class="flex flex-col items-start gap-0.5 rounded border p-2 text-left text-xs"
          :class="isSelected(opt.value)
            ? 'bg-primary text-primary-foreground border-primary'
            : 'hover:bg-muted'"
          @click="toggle(opt.value)"
        >
          <span class="font-medium">{{ opt.label }}</span>
          <span class="text-[10px]" :class="isSelected(opt.value) ? 'opacity-80' : 'text-muted-foreground'">
            {{ opt.desc }}
          </span>
        </button>
      </div>
      <p class="text-xs text-muted-foreground">
        提示: iPhone 同时属于"手机"和"iOS",规则只要命中任一类别即可匹配
      </p>
    </div>

    <!-- 跳转 URL -->
    <div class="space-y-2">
      <Label class="text-xs">命中后跳转到</Label>
      <Input
        :model-value="modelValue.url"
        placeholder="https://target.com"
        @update:model-value="emit('update:modelValue', { ...modelValue, url: $event })"
      />
    </div>
  </div>
</template>