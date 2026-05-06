<script setup>
import { ArrowRight, Loader2, RefreshCw, UserCog } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

definePageMeta({
  middleware: 'admin-only',
})

const inputText = ref('')
const newOwner = ref('')
const allUsers = ref([])
const previewItems = ref([])
const previewLoading = ref(false)
const transferring = ref(false)
const result = ref(null)

const confirmDialogOpen = ref(false)

// 解析输入文本得到 slug 数组
const parsedSlugs = computed(() => {
  return inputText.value
    .split(/[\n,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
})

const uniqueCount = computed(() => new Set(parsedSlugs.value).size)

// 预览统计
const previewStats = computed(() => {
  const stats = { ok: 0, notFound: 0, alreadyOwner: 0, error: 0 }
  for (const item of previewItems.value) {
    if (item.status === 'not_found') stats.notFound++
    else if (item.status === 'error') stats.error++
    else if (item.currentOwner === newOwner.value) stats.alreadyOwner++
    else stats.ok++
  }
  return stats
})

const canTransfer = computed(() => {
  return previewStats.value.ok > 0 && newOwner.value && !transferring.value
})

// 加载用户列表
async function loadUsers() {
  try {
    const data = await useAPI('/api/admin/users')
    allUsers.value = data.users || data || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载用户列表失败')
  }
}

async function preview() {
  if (parsedSlugs.value.length === 0) {
    toast.error('请输入至少一个 slug')
    return
  }
  previewLoading.value = true
  result.value = null
  try {
    const data = await useAPI('/api/admin/transfer-preview', {
      method: 'POST',
      body: { slugs: parsedSlugs.value },
    })
    previewItems.value = data.items || []
  }
  catch (e) {
    console.error(e)
    toast.error(e?.data?.message || '预览失败')
  }
  finally {
    previewLoading.value = false
  }
}

async function executeTransfer() {
  if (!newOwner.value) {
    toast.error('请选择目标用户')
    return
  }
  transferring.value = true
  try {
    const data = await useAPI('/api/admin/transfer-links', {
      method: 'POST',
      body: {
        slugs: parsedSlugs.value,
        newOwner: newOwner.value,
      },
    })
    result.value = data
    confirmDialogOpen.value = false
    if (data.failed === 0) {
      toast.success(`成功转移 ${data.success} 条链接到 ${newOwner.value}`)
    }
    else {
      toast.warning(`完成: ${data.success} 成功, ${data.failed} 失败`)
    }
    // 重新预览以反映最新状态
    await preview()
  }
  catch (e) {
    console.error(e)
    toast.error(e?.data?.message || '转移失败')
  }
  finally {
    transferring.value = false
  }
}

function statusLabel(item) {
  if (item.status === 'not_found') return { text: '不存在', color: 'text-destructive' }
  if (item.status === 'error') return { text: '错误', color: 'text-destructive' }
  if (item.currentOwner === newOwner.value) return { text: '已是目标', color: 'text-muted-foreground' }
  return { text: '可转移', color: 'text-green-600' }
}

onMounted(loadUsers)
</script>

<template>
  <main class="space-y-6">
    <DashboardBreadcrumb title="批量转移链接" />

    <h1 class="text-2xl font-bold">
      批量转移链接 owner
    </h1>

    <!-- 输入区 -->
    <Card>
      <CardHeader>
        <CardTitle>输入要转移的链接</CardTitle>
        <CardDescription>每行一个 slug,或用逗号、空格分隔。最多 500 条。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Textarea
          v-model="inputText"
          rows="8"
          placeholder="raphabetaya
raphap11
rapha1xx
..."
          class="font-mono text-sm"
        />

        <div class="flex flex-wrap items-end gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">转移到用户</label>
            <Select v-model="newOwner">
              <SelectTrigger class="w-48">
                <SelectValue placeholder="选择目标用户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="u in allUsers" :key="u.username" :value="u.username">
                  {{ u.username }} ({{ u.role }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span class="text-sm text-muted-foreground">
            共 <strong>{{ uniqueCount }}</strong> 条 (去重后)
          </span>

          <Button :disabled="previewLoading || uniqueCount === 0" @click="preview">
            <Loader2 v-if="previewLoading" class="w-4 h-4 mr-2 animate-spin" />
            <RefreshCw v-else class="w-4 h-4 mr-2" />
            预览
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 预览区 -->
    <Card v-if="previewItems.length > 0">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          预览结果
          <Badge v-if="newOwner" variant="default">→ {{ newOwner }}</Badge>
        </CardTitle>
        <CardDescription>
          可转移 <strong class="text-green-600">{{ previewStats.ok }}</strong> 条
          · 已是目标 <strong>{{ previewStats.alreadyOwner }}</strong> 条
          · 不存在 <strong class="text-destructive">{{ previewStats.notFound }}</strong> 条
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="border rounded-md max-h-96 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted sticky top-0 z-10">
              <tr>
                <th class="text-left p-2">
                  Slug
                </th>
                <th class="text-left p-2">
                  当前 owner
                </th>
                <th class="text-left p-2 w-12" />
                <th class="text-left p-2">
                  目标
                </th>
                <th class="text-left p-2">
                  URL
                </th>
                <th class="text-left p-2">
                  状态
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in previewItems"
                :key="item.slug"
                class="border-t hover:bg-muted/30"
              >
                <td class="p-2 font-mono text-xs">
                  {{ item.slug }}
                </td>
                <td class="p-2 text-xs">
                  <Badge variant="secondary">
                    {{ item.currentOwner || '(无)' }}
                  </Badge>
                </td>
                <td class="p-2">
                  <ArrowRight class="w-3 h-3 text-muted-foreground" />
                </td>
                <td class="p-2 text-xs">
                  <Badge v-if="item.status === 'ok'" variant="default">
                    {{ newOwner || '?' }}
                  </Badge>
                  <span v-else class="text-muted-foreground">-</span>
                </td>
                <td class="p-2 text-xs truncate max-w-xs" :title="item.url">
                  {{ item.url || '-' }}
                </td>
                <td class="p-2 text-xs" :class="statusLabel(item).color">
                  {{ statusLabel(item).text }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex justify-end">
          <Button
            variant="default"
            :disabled="!canTransfer"
            @click="confirmDialogOpen = true"
          >
            <UserCog class="w-4 h-4 mr-2" />
            执行转移 ({{ previewStats.ok }} 条)
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 结果区 -->
    <Card v-if="result">
      <CardHeader>
        <CardTitle>执行结果</CardTitle>
      </CardHeader>
      <CardContent class="space-y-2 text-sm">
        <p>请求: {{ result.requested }} 条</p>
        <p class="text-green-600">
          ✅ 成功转移: {{ result.success }} 条
        </p>
        <p v-if="result.alreadyOwner > 0" class="text-muted-foreground">
          ✓ 已是目标: {{ result.alreadyOwner }} 条
        </p>
        <p v-if="result.notFound > 0" class="text-muted-foreground">
          ⚠️ 不存在: {{ result.notFound }} 条
        </p>
        <p v-if="result.failed > 0" class="text-destructive">
          ❌ 失败: {{ result.failed }} 条
        </p>
        <div v-if="result.failedItems?.length" class="text-xs text-destructive mt-2">
          <div v-for="f in result.failedItems" :key="f.slug">
            - {{ f.slug }}: {{ f.reason }}
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 确认对话框 -->
    <Dialog v-model:open="confirmDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <UserCog class="w-5 h-5" />
            确认转移
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-3 py-2 text-sm">
          <p>
            将 <strong class="text-primary">{{ previewStats.ok }}</strong> 条链接的 owner 转移到 <Badge>{{ newOwner }}</Badge>
          </p>
          <p class="text-muted-foreground text-xs">
            此操作会同时更新 KV 和 D1,会写一条操作日志。可重复执行(幂等)。
          </p>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="secondary">
              取消
            </Button>
          </DialogClose>
          <Button :disabled="transferring" @click="executeTransfer">
            <Loader2 v-if="transferring" class="w-4 h-4 mr-2 animate-spin" />
            确认转移
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>