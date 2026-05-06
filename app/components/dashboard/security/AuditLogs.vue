<script setup>
import { Loader2, RefreshCw, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const items = ref([])
const loading = ref(false)
const hasMore = ref(false)
const cursor = ref('')

// 过滤条件
const filterActor = ref('')
const filterAction = ref('all')
const filterSearch = ref('')

const ACTION_LABELS = {
  create: '创建',
  edit: '编辑',
  delete: '删除',
  batch_create: '批量创建',
}

const ACTION_COLORS = {
  create: 'default',
  edit: 'secondary',
  delete: 'destructive',
  batch_create: 'default',
}

async function fetchList(reset = true) {
  if (reset) {
    cursor.value = ''
    items.value = []
  }
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('limit', '50')
    if (cursor.value) params.set('cursor', cursor.value)
    if (filterActor.value.trim()) params.set('actor', filterActor.value.trim())
    if (filterAction.value !== 'all') params.set('action', filterAction.value)
    if (filterSearch.value.trim()) params.set('q', filterSearch.value.trim())

    const data = await useAPI(`/api/admin/audit-logs?${params.toString()}`)
    if (reset) {
      items.value = data.items || []
    }
    else {
      items.value = [...items.value, ...(data.items || [])]
    }
    hasMore.value = !!data.hasMore
    cursor.value = data.cursor || ''
  }
  catch (e) {
    console.error(e)
    toast.error(e?.data?.message || '获取失败')
  }
  finally {
    loading.value = false
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  fetchList(false)
}

function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN')
}

function shortTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 把 rulesSummary 转成可读文字
function describeRulesSummary(s) {
  if (!s) return null
  const parts = []
  if (s.added?.length) {
    parts.push(`新增 ${s.added.length} 条规则`)
  }
  if (s.removed?.length) {
    parts.push(`删除 ${s.removed.length} 条规则`)
  }
  if (s.modified?.length) {
    parts.push(`修改 ${s.modified.length} 条规则`)
  }
  return parts.join(' · ')
}

// 规则类型中文
function ruleTypeLabel(type) {
  if (type === 'country') return '地理'
  if (type === 'time') return '时间'
  if (type === 'ab') return 'A/B'
  return type
}

let searchTimer = null
watch(filterSearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => fetchList(true), 400)
})

watch([filterActor, filterAction], () => {
  fetchList(true)
})

onMounted(() => fetchList(true))
</script>

<template>
  <Card class="lg:col-span-2">
    <CardHeader class="flex flex-row items-center justify-between">
      <div>
        <CardTitle>操作日志</CardTitle>
        <CardDescription>所有 创建 / 编辑 / 删除 操作的审计记录(保留 90 天)</CardDescription>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="fetchList(true)">
        <RefreshCw class="w-4 h-4 mr-2" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- 过滤条 -->
      <div class="flex flex-wrap gap-2 items-center">
        <div class="relative flex-1 min-w-[200px]">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="filterSearch"
            placeholder="搜索 slug 或 URL"
            class="pl-9"
          />
        </div>
        <Input
          v-model="filterActor"
          placeholder="操作者"
          class="w-32"
        />
        <Select v-model="filterAction">
          <SelectTrigger class="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              全部动作
            </SelectItem>
            <SelectItem value="create">
              创建
            </SelectItem>
            <SelectItem value="edit">
              编辑
            </SelectItem>
            <SelectItem value="delete">
              删除
            </SelectItem>
            <SelectItem value="batch_create">
              批量创建
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 列表 -->
      <div v-if="!loading && items.length === 0" class="text-sm text-muted-foreground py-8 text-center">
        无操作记录
      </div>

      <div v-else class="space-y-2 max-h-[600px] overflow-y-auto">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded border p-3 space-y-2 bg-muted/20"
        >
          <!-- 第一行:动作 + 操作者 + 时间 -->
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <Badge :variant="ACTION_COLORS[item.action] || 'default'">
                {{ ACTION_LABELS[item.action] || item.action }}
              </Badge>
              <span class="text-sm font-medium">{{ item.actor }}</span>
              <span class="text-xs text-muted-foreground font-mono">{{ item.actorIp }}</span>
            </div>
            <span class="text-xs text-muted-foreground font-mono">{{ shortTime(item.timestamp) }}</span>
          </div>

          <!-- 第二行:目标信息 -->
          <div v-if="item.targetSlug || item.targetUrl" class="text-sm space-y-1">
            <div v-if="item.targetSlug" class="flex items-baseline gap-2">
              <span class="text-xs text-muted-foreground">短链:</span>
              <code class="font-mono">{{ item.targetSlug }}</code>
            </div>
            <div v-if="item.targetUrl" class="flex items-baseline gap-2">
              <span class="text-xs text-muted-foreground">目标:</span>
              <code class="font-mono text-xs truncate flex-1" :title="item.targetUrl">{{ item.targetUrl }}</code>
            </div>
            <div v-if="item.oldUrl && item.oldUrl !== item.targetUrl" class="flex items-baseline gap-2">
              <span class="text-xs text-muted-foreground">原 URL:</span>
              <code class="font-mono text-xs text-muted-foreground line-through truncate flex-1" :title="item.oldUrl">{{ item.oldUrl }}</code>
            </div>
          </div>

          <!-- 规则变化摘要 -->
          <div v-if="item.rulesSummary" class="text-xs space-y-1 pl-2 border-l-2 border-primary/30">
            <div class="text-primary font-medium">
              {{ describeRulesSummary(item.rulesSummary) }}
              <span class="text-muted-foreground font-normal">
                ({{ item.rulesSummary.before }} → {{ item.rulesSummary.after }} 条)
              </span>
            </div>
            <div v-if="item.rulesSummary.added?.length" class="space-y-0.5">
              <div v-for="(r, i) in item.rulesSummary.added" :key="`a-${i}`" class="text-green-600">
                + {{ ruleTypeLabel(r.type) }}: <span class="text-muted-foreground">{{ JSON.stringify(r).slice(0, 100) }}</span>
              </div>
            </div>
            <div v-if="item.rulesSummary.removed?.length" class="space-y-0.5">
              <div v-for="(r, i) in item.rulesSummary.removed" :key="`r-${i}`" class="text-destructive">
                - {{ ruleTypeLabel(r.type) }}: <span class="text-muted-foreground">{{ JSON.stringify(r).slice(0, 100) }}</span>
              </div>
            </div>
            <div v-if="item.rulesSummary.modified?.length" class="space-y-0.5">
              <div v-for="(r, i) in item.rulesSummary.modified" :key="`m-${i}`" class="text-yellow-600">
                ~ {{ ruleTypeLabel(r.type) }}: <span class="text-muted-foreground">{{ JSON.stringify(r).slice(0, 100) }}</span>
              </div>
            </div>
          </div>

          <!-- 批量操作详情 -->
          <div v-if="item.action === 'batch_create' && item.details" class="text-xs text-muted-foreground">
            共 {{ item.details.total }} 条 / 成功 {{ item.details.success }} / 失败 {{ item.details.failed }}
            <span v-if="item.details.sampleSlugs?.length" class="block mt-1">
              示例: {{ item.details.sampleSlugs.slice(0, 5).join(', ') }}{{ item.details.sampleSlugs.length > 5 ? '...' : '' }}
            </span>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" class="text-center pt-2">
          <Button variant="outline" size="sm" :disabled="loading" @click="loadMore">
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            加载更多
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>