<script setup>
import { ChevronDown, ChevronUp, Globe, Plus, SplitSquareHorizontal, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const rules = computed({
  get: () => props.modelValue || [],
  set: val => emit('update:modelValue', val),
})

function genId() {
  return 'rule_' + Math.random().toString(36).slice(2, 10)
}

function addCountryRule() {
  rules.value = [
    ...rules.value,
    {
      id: genId(),
      type: 'country',
      match: [],
      url: '',
    },
  ]
}

function addTimeRule() {
  rules.value = [
    ...rules.value,
    {
      id: genId(),
      type: 'time',
      tz: 'America/Sao_Paulo',
      windows: [{ start: '09:00', end: '18:00' }],
      url: '',
    },
  ]
}

function addAbRule() {
  rules.value = [
    ...rules.value,
    {
      id: genId(),
      type: 'ab',
      variants: [
        { url: '', weight: 50 },
        { url: '', weight: 50 },
      ],
    },
  ]
}

function updateRule(index, newRule) {
  const next = [...rules.value]
  next[index] = newRule
  rules.value = next
}

function deleteRule(index) {
  const next = [...rules.value]
  next.splice(index, 1)
  rules.value = next
}

function moveUp(index) {
  if (index === 0) return
  const next = [...rules.value]
  ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
  rules.value = next
}

function moveDown(index) {
  if (index === rules.value.length - 1) return
  const next = [...rules.value]
  ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
  rules.value = next
}

const showAddMenu = ref(false)
</script>

<template>
  <div class="space-y-3">
    <!-- 规则列表 -->
    <div v-if="rules.length === 0" class="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
      暂无规则。规则按从上到下顺序匹配,第一条命中即跳转。
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(rule, idx) in rules"
        :key="rule.id"
        class="rounded border p-3 space-y-2 bg-muted/30"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground font-mono">#{{ idx + 1 }}</span>
            <Badge v-if="rule.type === 'country'" variant="default">
              <Globe class="w-3 h-3 mr-1" /> 地理定向
            </Badge>
            <Badge v-else-if="rule.type === 'time'" variant="default">
              ⏰ 时间段
            </Badge>
            <Badge v-else-if="rule.type === 'ab'" variant="default">
              <SplitSquareHorizontal class="w-3 h-3 mr-1" /> A/B 测试
            </Badge>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="p-1 hover:bg-muted rounded disabled:opacity-30"
              :disabled="idx === 0"
              title="上移"
              @click="moveUp(idx)"
            >
              <ChevronUp class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="p-1 hover:bg-muted rounded disabled:opacity-30"
              :disabled="idx === rules.length - 1"
              title="下移"
              @click="moveDown(idx)"
            >
              <ChevronDown class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="p-1 hover:bg-destructive/20 rounded text-destructive"
              title="删除"
              @click="deleteRule(idx)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 各类型的编辑器 -->
        <DashboardLinksRulesCountryRule
          v-if="rule.type === 'country'"
          :model-value="rule"
          @update:model-value="updateRule(idx, $event)"
        />
        <DashboardLinksRulesTimeRule
          v-else-if="rule.type === 'time'"
          :model-value="rule"
          @update:model-value="updateRule(idx, $event)"
        />
        <DashboardLinksRulesAbRule
          v-else-if="rule.type === 'ab'"
          :model-value="rule"
          @update:model-value="updateRule(idx, $event)"
        />
      </div>
    </div>

    <!-- 添加规则按钮 -->
    <div class="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="showAddMenu = !showAddMenu"
      >
        <Plus class="w-4 h-4 mr-2" />
        添加规则
      </Button>
      <div v-if="showAddMenu" class="absolute z-10 mt-1 w-56 rounded border bg-popover shadow-md p-1">
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2 py-2 text-sm hover:bg-muted rounded text-left"
          @click="addCountryRule(); showAddMenu = false"
        >
          <Globe class="w-4 h-4" />
          <div>
            <div class="font-medium">
              地理定向
            </div>
            <div class="text-xs text-muted-foreground">
              按访问者国家跳转
            </div>
          </div>
        </button>
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2 py-2 text-sm hover:bg-muted rounded text-left"
          @click="addTimeRule(); showAddMenu = false"
        >
          <span class="w-4 h-4 text-center">⏰</span>
          <div>
            <div class="font-medium">
              时间段
            </div>
            <div class="text-xs text-muted-foreground">
              按访问时间跳转
            </div>
          </div>
        </button>
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2 py-2 text-sm hover:bg-muted rounded text-left"
          @click="addAbRule(); showAddMenu = false"
        >
          <SplitSquareHorizontal class="w-4 h-4" />
          <div>
            <div class="font-medium">
              A/B 测试
            </div>
            <div class="text-xs text-muted-foreground">
              按权重随机分流
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>