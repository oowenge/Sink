<script setup>
import { AlertTriangle, Loader2, Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

definePageMeta({
  middleware: 'admin-only',
})

const days = ref(30)
const limit = ref(100)
const items = ref([])
const totalCold = ref(0)
const shown = ref(0)
const loading = ref(false)
const deleting = ref(false)
const selectedSlugs = ref(new Set())

const confirmDialogOpen = ref(false)
const confirmText = ref('')

async function fetchList() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('days', String(days.value))
    params.set('limit', String(limit.value))
    const data = await useAPI(`/api/admin/cold-links?${params.toString()}`)
    items.value = data.items || []
    totalCold.value = data.totalCold || 0
    shown.value = data.shown || 0
    selectedSlugs.value = new Set()
  }
  catch (e) {
    console.error(e)
    toast.error(e?.data?.message || '查询失败')
  }
  finally {
    loading.value = false
  }
}

function toggleSelect(slug) {
  const next = new Set(selectedSlugs.value)
  if (next.has(slug)) {
    next.delete(slug)
  }
  else {
    next.add(slug)
  }
  selectedSlugs.value = next
}

function selectAll() {
  if (selectedSlugs.value.size === items.value.length) {
    selectedSlugs.value = new Set()
  }
  else {
    selectedSlugs.value = new Set(items.value.map(i => i.slug))
  }
}

const allSelected = computed(() => {
  return items.value.length > 0 && selectedSlugs.value.size === items.value.length
})

async function executeDelete() {
  if (confirmText.value !== '确认删除') {
    toast.error('请输入"确认删除"4 个字')
    return
  }

  const slugsToDelete = Array.from(selectedSlugs.value)
  if (slugsToDelete.length === 0) return

  deleting.value = true
  try {
    const result = await useAPI('/api/admin/cold-links-delete', {
      method: 'POST',
      body: { slugs: slugsToDelete },
    })
    if (result.failed === 0) {
      toast.success(`成功删除 ${result.success} 条冷链接`)
    }
    else {
      toast.warning(`删除完成: ${result.success} 成功, ${result.failed} 失败`)
      console.warn('删除失败的链接:', result.failedItems)
    }
    confirmDialogOpen.value = false
    confirmText.value = ''
    await fetchList()
  }
  catch (e) {
    console.error(e)
    toast.error(e?.data?.message || '删除失败')
  }
  finally {
    deleting.value = false
  }
}

function formatDate(ts) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleDateString('zh-CN')
}

function formatDays(daysSince) {
  if (daysSince === null) return '从未访问'
  if (daysSince === 0) return '今天'
  return `${daysSince} 天前`
}

onMounted(fetchList)
</script>

<template>
  <main class="space-y-6">
    <DashboardBreadcrumb title="冷链接清理" />

    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        冷链接清理
      </h1>
    </div>

    <!-- 警告提示 -->
    <Alert variant="destructive">
      <AlertTriangle class="w-4 h-4" />
      <AlertTitle>危险操作</AlertTitle>
      <AlertDescription>
        删除后无法恢复。请仔细核对后再确认操作。删除会同时清除 KV、D1 和访问日志,但访问统计数据(Analytics Engine)会保留。
      </AlertDescription>
    </Alert>

    <!-- 查询条件 -->
    <Card>
      <CardHeader>
        <CardTitle>查询条件</CardTitle>
        <CardDescription>找出在指定天数内没人访问的链接</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap items-end gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">未访问天数(阈值)</label>
            <Input v-model.number="days" type="number" min="1" max="3650" class="w-32" />
            <p class="text-xs text-muted-foreground">
              超过这个天数没人访问 = 冷链接
            </p>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">最多显示</label>
            <Input v-model.number="limit" type="number" min="1" max="1000" class="w-32" />
          </div>
          <Button :disabled="loading" @click="fetchList">
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            <Search v-else class="w-4 h-4 mr-2" />
            查询
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 结果 -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>冷链接列表</CardTitle>
            <CardDescription>
              <span v-if="totalCold > 0">
                共找到 <strong class="text-destructive">{{ totalCold }}</strong> 条冷链接
                <span v-if="shown < totalCold">(显示前 {{ shown }} 条,如需更多请增大"最多显示")</span>
              </span>
              <span v-else>未找到符合条件的冷链接</span>
            </CardDescription>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="items.length > 0"
              variant="outline"
              size="sm"
              @click="selectAll"
            >
              {{ allSelected ? '取消全选' : '全选' }}
            </Button>
            <Button
              v-if="selectedSlugs.size > 0"
              variant="destructive"
              size="sm"
              @click="confirmDialogOpen = true"
            >
              <Trash2 class="w-4 h-4 mr-2" />
              删除选中 {{ selectedSlugs.size }} 条
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="items.length === 0 && !loading" class="text-sm text-muted-foreground py-8 text-center">
          没有冷链接 🎉 所有链接最近都有访问
        </div>

        <div v-else class="space-y-2 max-h-[600px] overflow-y-auto">
          <div
            v-for="item in items"
            :key="item.slug"
            class="rounded border p-3 flex items-center gap-3 hover:bg-muted/30"
            :class="selectedSlugs.has(item.slug) ? 'bg-destructive/10 border-destructive/30' : ''"
          >
            <input
              type="checkbox"
              :checked="selectedSlugs.has(item.slug)"
              class="w-4 h-4"
              @change="toggleSelect(item.slug)"
            >
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <code class="font-mono text-sm font-medium">{{ item.slug }}</code>
                <Badge v-if="item.hasRules" variant="default">
                  含规则
                </Badge>
                <span v-if="item.owner" class="text-xs text-muted-foreground">
                  by {{ item.owner }}
                </span>
              </div>
              <div class="text-xs text-muted-foreground truncate" :title="item.url">
                → {{ item.url }}
              </div>
              <div v-if="item.comment" class="text-xs text-muted-foreground italic truncate">
                💬 {{ item.comment }}
              </div>
              <div class="flex gap-3 text-xs text-muted-foreground">
                <span>创建: {{ formatDate(item.createdAt) }}</span>
                <span>·</span>
                <span class="text-destructive">最后访问: {{ formatDays(item.daysSinceAccess) }}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 确认对话框 -->
    <Dialog v-model:open="confirmDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-destructive flex items-center gap-2">
            <AlertTriangle class="w-5 h-5" />
            确认删除冷链接
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-2">
          <p class="text-sm">
            即将<strong class="text-destructive">永久删除 {{ selectedSlugs.size }} 条冷链接</strong>,操作不可撤销。
          </p>
          <p class="text-sm text-muted-foreground">
            被删除的短链将立即失效,访问者会看到 404。
          </p>
          <div class="space-y-2">
            <label class="text-sm font-medium">请输入 <code class="text-destructive font-bold">确认删除</code> 4 个字以继续</label>
            <Input v-model="confirmText" placeholder="确认删除" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="secondary">
              取消
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            :disabled="confirmText !== '确认删除' || deleting"
            @click="executeDelete"
          >
            <Loader2 v-if="deleting" class="w-4 h-4 mr-2 animate-spin" />
            永久删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>