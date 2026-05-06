<script setup>
import { Plus, X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const totalWeight = computed(() => {
  return (props.modelValue.variants || []).reduce((sum, v) => sum + (Number(v.weight) || 0), 0)
})

function addVariant() {
  const variants = [...(props.modelValue.variants || []), { url: '', weight: 50 }]
  emit('update:modelValue', { ...props.modelValue, variants })
}

function removeVariant(idx) {
  const variants = [...(props.modelValue.variants || [])]
  if (variants.length <= 2) return // A/B 至少 2 个
  variants.splice(idx, 1)
  emit('update:modelValue', { ...props.modelValue, variants })
}

function updateVariant(idx, key, value) {
  const variants = [...(props.modelValue.variants || [])]
  variants[idx] = { ...variants[idx], [key]: key === 'weight' ? Number(value) || 0 : value }
  emit('update:modelValue', { ...props.modelValue, variants })
}

function getPercent(weight) {
  if (totalWeight.value <= 0) return '0'
  return ((Number(weight) || 0) / totalWeight.value * 100).toFixed(1)
}
</script>

<template>
  <div class="space-y-3">
    <div class="text-xs text-muted-foreground">
      每次访问按权重随机选一个跳转。当前总权重: {{ totalWeight }}
    </div>

    <div class="space-y-2">
      <div
        v-for="(v, idx) in (modelValue.variants || [])"
        :key="idx"
        class="rounded border p-2 space-y-2 bg-background"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono w-8 text-muted-foreground">#{{ idx + 1 }}</span>
          <Input
            :model-value="v.url"
            placeholder="https://variant.com"
            class="flex-1"
            @update:model-value="updateVariant(idx, 'url', $event)"
          />
          <button
            type="button"
            class="p-1 hover:bg-destructive/20 rounded text-destructive disabled:opacity-30"
            :disabled="(modelValue.variants || []).length <= 2"
            title="A/B 至少需要 2 个 variant"
            @click="removeVariant(idx)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="flex items-center gap-2 pl-10">
          <Label class="text-xs">权重</Label>
          <Input
            type="number"
            min="0"
            max="10000"
            :model-value="v.weight"
            class="w-20 h-8"
            @update:model-value="updateVariant(idx, 'weight', $event)"
          />
          <span class="text-xs text-muted-foreground">
            ≈ {{ getPercent(v.weight) }}%
          </span>
        </div>
      </div>
    </div>

    <Button type="button" variant="ghost" size="sm" @click="addVariant">
      <Plus class="w-3 h-3 mr-1" />
      添加 variant
    </Button>
  </div>
</template>