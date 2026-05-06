<script setup>
import { Check, X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

// 国家列表(中文 + 国旗 + ISO 代码),包含全部主要市场国
const COUNTRIES = [
  { code: 'BR', name: '巴西', flag: '🇧🇷' },
  { code: 'AR', name: '阿根廷', flag: '🇦🇷' },
  { code: 'MX', name: '墨西哥', flag: '🇲🇽' },
  { code: 'CO', name: '哥伦比亚', flag: '🇨🇴' },
  { code: 'CL', name: '智利', flag: '🇨🇱' },
  { code: 'PE', name: '秘鲁', flag: '🇵🇪' },
  { code: 'PT', name: '葡萄牙', flag: '🇵🇹' },
  { code: 'ES', name: '西班牙', flag: '🇪🇸' },
  { code: 'US', name: '美国', flag: '🇺🇸' },
  { code: 'CA', name: '加拿大', flag: '🇨🇦' },
  { code: 'GB', name: '英国', flag: '🇬🇧' },
  { code: 'FR', name: '法国', flag: '🇫🇷' },
  { code: 'DE', name: '德国', flag: '🇩🇪' },
  { code: 'IT', name: '意大利', flag: '🇮🇹' },
  { code: 'NL', name: '荷兰', flag: '🇳🇱' },
  { code: 'RU', name: '俄罗斯', flag: '🇷🇺' },
  { code: 'CN', name: '中国大陆', flag: '🇨🇳' },
  { code: 'HK', name: '中国香港', flag: '🇭🇰' },
  { code: 'TW', name: '中国台湾', flag: '🇹🇼' },
  { code: 'JP', name: '日本', flag: '🇯🇵' },
  { code: 'KR', name: '韩国', flag: '🇰🇷' },
  { code: 'SG', name: '新加坡', flag: '🇸🇬' },
  { code: 'MY', name: '马来西亚', flag: '🇲🇾' },
  { code: 'TH', name: '泰国', flag: '🇹🇭' },
  { code: 'VN', name: '越南', flag: '🇻🇳' },
  { code: 'PH', name: '菲律宾', flag: '🇵🇭' },
  { code: 'ID', name: '印度尼西亚', flag: '🇮🇩' },
  { code: 'IN', name: '印度', flag: '🇮🇳' },
  { code: 'AU', name: '澳大利亚', flag: '🇦🇺' },
  { code: 'NZ', name: '新西兰', flag: '🇳🇿' },
  { code: 'AE', name: '阿联酋', flag: '🇦🇪' },
  { code: 'SA', name: '沙特阿拉伯', flag: '🇸🇦' },
  { code: 'TR', name: '土耳其', flag: '🇹🇷' },
  { code: 'EG', name: '埃及', flag: '🇪🇬' },
  { code: 'ZA', name: '南非', flag: '🇿🇦' },
  { code: 'NG', name: '尼日利亚', flag: '🇳🇬' },
]

const searchTerm = ref('')
const showDropdown = ref(false)

const filteredCountries = computed(() => {
  const matched = props.modelValue.match || []
  const term = searchTerm.value.trim().toLowerCase()
  return COUNTRIES.filter((c) => {
    if (matched.includes(c.code)) return false
    if (!term) return true
    return c.code.toLowerCase().includes(term) || c.name.includes(term)
  })
})

const selectedCountries = computed(() => {
  const matched = props.modelValue.match || []
  return matched.map(code => COUNTRIES.find(c => c.code === code) || { code, name: code, flag: '🏳' })
})

function addCountry(code) {
  const matched = [...(props.modelValue.match || [])]
  if (!matched.includes(code)) {
    matched.push(code)
    emit('update:modelValue', { ...props.modelValue, match: matched })
  }
  searchTerm.value = ''
  showDropdown.value = false
}

function removeCountry(code) {
  const matched = (props.modelValue.match || []).filter(c => c !== code)
  emit('update:modelValue', { ...props.modelValue, match: matched })
}

function updateUrl(e) {
  emit('update:modelValue', { ...props.modelValue, url: e.target.value })
}
</script>

<template>
  <div class="space-y-3">
    <!-- 国家选择 -->
    <div class="space-y-2">
      <Label class="text-xs">匹配国家</Label>
      <div class="flex flex-wrap gap-1 min-h-[32px] p-2 rounded border bg-background">
        <Badge
          v-for="c in selectedCountries"
          :key="c.code"
          variant="secondary"
          class="gap-1"
        >
          {{ c.flag }} {{ c.name }} ({{ c.code }})
          <button type="button" class="hover:text-destructive" @click="removeCountry(c.code)">
            <X class="w-3 h-3" />
          </button>
        </Badge>
        <span v-if="selectedCountries.length === 0" class="text-xs text-muted-foreground">
          点击下方搜索框添加国家
        </span>
      </div>

      <div class="relative">
        <Input
          v-model="searchTerm"
          placeholder="搜索国家(中文或代码)"
          @focus="showDropdown = true"
          @blur="setTimeout(() => showDropdown = false, 200)"
        />
        <div
          v-if="showDropdown && filteredCountries.length > 0"
          class="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded border bg-popover shadow-md"
        >
          <button
            v-for="c in filteredCountries"
            :key="c.code"
            type="button"
            class="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-muted text-left"
            @mousedown.prevent="addCountry(c.code)"
          >
            <span>{{ c.flag }}</span>
            <span class="flex-1">{{ c.name }}</span>
            <span class="text-xs text-muted-foreground font-mono">{{ c.code }}</span>
          </button>
        </div>
      </div>
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