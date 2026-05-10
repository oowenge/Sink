<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

// 从 URL 解析 UTM 参数
function parseUtm(url) {
  const result = {
    source: '',
    medium: '',
    campaign: '',
    term: '',
    content: '',
  }
  if (!url) return result
  try {
    const u = new URL(url)
    result.source = u.searchParams.get('utm_source') || ''
    result.medium = u.searchParams.get('utm_medium') || ''
    result.campaign = u.searchParams.get('utm_campaign') || ''
    result.term = u.searchParams.get('utm_term') || ''
    result.content = u.searchParams.get('utm_content') || ''
  }
  catch {
    // url 不合法,忽略
  }
  return result
}

const utm = ref(parseUtm(props.modelValue))

// 当外部 url 变化时,如果是手动改的,同步 utm 表单
watch(() => props.modelValue, (newUrl) => {
  utm.value = parseUtm(newUrl)
}, { immediate: false })

// 每次表单字段变化,重新构建 URL
function rebuildUrl() {
  let baseUrl = props.modelValue.trim()
  if (!baseUrl) return

  try {
    const u = new URL(baseUrl)
    // 清除所有现有 utm 参数
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
    utmKeys.forEach(k => u.searchParams.delete(k))

    // 加回填了的字段
    if (utm.value.source.trim()) u.searchParams.set('utm_source', utm.value.source.trim())
    if (utm.value.medium.trim()) u.searchParams.set('utm_medium', utm.value.medium.trim())
    if (utm.value.campaign.trim()) u.searchParams.set('utm_campaign', utm.value.campaign.trim())
    if (utm.value.term.trim()) u.searchParams.set('utm_term', utm.value.term.trim())
    if (utm.value.content.trim()) u.searchParams.set('utm_content', utm.value.content.trim())

    emit('update:modelValue', u.toString())
  }
  catch {
    // baseUrl 还不是合法 URL,先不构建
  }
}

const hasAnyUtm = computed(() => {
  return !!(utm.value.source || utm.value.medium || utm.value.campaign || utm.value.term || utm.value.content)
})
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-muted-foreground">
      自动拼接 UTM 参数到目标网址。<span v-if="hasAnyUtm" class="text-primary">已配置</span>
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <Label class="text-xs">utm_source <span class="text-muted-foreground">(必填)</span></Label>
        <Input v-model="utm.source" placeholder="例如: facebook" @input="rebuildUrl" />
      </div>
      <div class="space-y-1">
        <Label class="text-xs">utm_medium <span class="text-muted-foreground">(必填)</span></Label>
        <Input v-model="utm.medium" placeholder="例如: cpc" @input="rebuildUrl" />
      </div>
      <div class="space-y-1">
        <Label class="text-xs">utm_campaign <span class="text-muted-foreground">(必填)</span></Label>
        <Input v-model="utm.campaign" placeholder="例如: spring2026" @input="rebuildUrl" />
      </div>
      <div class="space-y-1">
        <Label class="text-xs">utm_term <span class="text-muted-foreground">(可选)</span></Label>
        <Input v-model="utm.term" placeholder="付费关键词" @input="rebuildUrl" />
      </div>
      <div class="space-y-1 sm:col-span-2">
        <Label class="text-xs">utm_content <span class="text-muted-foreground">(可选)</span></Label>
        <Input v-model="utm.content" placeholder="区分同一广告的不同变体" @input="rebuildUrl" />
      </div>
    </div>

    <div class="text-xs text-muted-foreground space-y-1">
      <p><strong>常见值参考</strong>:</p>
      <p>· <code>source</code>: facebook / google / whatsapp / instagram / direct / email</p>
      <p>· <code>medium</code>: cpc / social / email / banner / referral</p>
      <p>· <code>campaign</code>: 任意命名,推荐用"活动名+年月",如 <code>spring2026</code></p>
    </div>
  </div>
</template>