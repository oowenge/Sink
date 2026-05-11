<script setup>
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const input = ref('')
const suggestions = ref([])
const allTags = ref([]) // 全部已有标签 [{name, count}]
const showSuggestions = ref(false)

const tags = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])

async function loadAllTags() {
  try {
    const data = await useAPI('/api/link/tags')
    allTags.value = data.tags || []
  }
  catch (e) {
    // 静默失败,不阻塞编辑器
    console.warn('加载标签库失败', e)
  }
}

function updateSuggestions() {
  const q = input.value.trim().toLowerCase()
  if (!q) {
    suggestions.value = []
    return
  }
  // 排除已选标签
  const existing = new Set(tags.value)
  suggestions.value = allTags.value
    .filter(t => !existing.has(t.name) && t.name.includes(q))
    .slice(0, 8)
}

watch(input, updateSuggestions)

function addTag(name) {
  const cleaned = name.trim().toLowerCase()
  if (!cleaned) return
  if (cleaned.length > 30) return
  if (/[,'"\\]/.test(cleaned)) return
  if (tags.value.includes(cleaned)) return
  if (tags.value.length >= 10) return

  emit('update:modelValue', [...tags.value, cleaned])
  input.value = ''
  suggestions.value = []
}

function removeTag(idx) {
  const next = [...tags.value]
  next.splice(idx, 1)
  emit('update:modelValue', next)
}

function onKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    if (input.value.trim()) addTag(input.value)
  }
  else if (e.key === 'Backspace' && !input.value && tags.value.length > 0) {
    removeTag(tags.value.length - 1)
  }
}

onMounted(loadAllTags)
</script>

<template>
  <div class="space-y-2">
    <div
      class="flex flex-wrap items-center gap-1.5 p-2 rounded-md border min-h-[2.5rem] focus-within:ring-2 focus-within:ring-ring focus-within:border-input"
    >
      <Badge
        v-for="(tag, idx) in tags"
        :key="tag"
        variant="secondary"
        class="gap-1 pl-2 pr-1"
      >
        #{{ tag }}
        <button
          type="button"
          class="hover:bg-destructive/20 rounded-sm"
          @click="removeTag(idx)"
        >
          <X class="w-3 h-3" />
        </button>
      </Badge>
      <input
        v-model="input"
        type="text"
        :placeholder="tags.length === 0 ? '输入标签名,回车确认' : ''"
        class="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
        @keydown="onKeydown"
        @focus="showSuggestions = true"
        @blur="setTimeout(() => showSuggestions = false, 200)"
      >
    </div>

    <!-- 自动联想 -->
    <div
      v-if="showSuggestions && suggestions.length > 0"
      class="rounded-md border bg-popover shadow-md p-1 max-h-48 overflow-y-auto"
    >
      <button
        v-for="s in suggestions"
        :key="s.name"
        type="button"
        class="flex items-center justify-between w-full px-2 py-1.5 text-sm hover:bg-muted rounded text-left"
        @mousedown.prevent="addTag(s.name)"
      >
        <span>#{{ s.name }}</span>
        <span class="text-xs text-muted-foreground">{{ s.count }} 条</span>
      </button>
    </div>

    <p class="text-xs text-muted-foreground">
      最多 10 个标签 · 不区分大小写 · 用回车或逗号添加 · 已使用 {{ tags.length }}/10
    </p>
  </div>
</template>