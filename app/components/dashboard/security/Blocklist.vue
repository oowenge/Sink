<script setup>
import { Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const items = ref([])
const loading = ref(false)
const adding = ref(false)
const removing = ref({})
const dialogOpen = ref(false)
const newValue = ref('')
const newNote = ref('')

async function fetchList() {
  loading.value = true
  try {
    const data = await useAPI('/api/admin/security/blocklist')
    items.value = data.items || []
  }
  catch (e) {
    console.error(e)
    toast.error('获取失败')
  }
  finally {
    loading.value = false
  }
}

async function addItem() {
  if (!newValue.value.trim()) {
    toast.error('请输入 IP 或 CIDR')
    return
  }
  adding.value = true
  try {
    const result = await useAPI('/api/admin/security/blocklist', {
      method: 'POST',
      body: {
        value: newValue.value.trim(),
        note: newNote.value.trim() || undefined,
      },
    })
    toast.success(result.message)
    dialogOpen.value = false
    newValue.value = ''
    newNote.value = ''
    await fetchList()
  }
  catch (e) {
    toast.error(e?.data?.message || '添加失败')
  }
  finally {
    adding.value = false
  }
}

async function removeItem(item) {
  const itemKey = `${item.type}:${item.value}`
  removing.value[itemKey] = true
  try {
    await useAPI('/api/admin/security/blocklist-remove', {
      method: 'POST',
      body: { type: item.type, value: item.value },
    })
    toast.success(`已移除 ${item.value}`)
    await fetchList()
  }
  catch (e) {
    toast.error(e?.data?.message || '移除失败')
  }
  finally {
    removing.value[itemKey] = false
  }
}

function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN')
}

onMounted(fetchList)
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <div>
        <CardTitle>黑名单</CardTitle>
        <CardDescription>禁止访问 dashboard(短链跳转不受影响)</CardDescription>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="loading" @click="fetchList">
          <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
          刷新
        </Button>
        <Dialog v-model:open="dialogOpen">
          <DialogTrigger as-child>
            <Button size="sm">
              <Plus class="w-4 h-4 mr-2" />
              添加
            </Button>
          </DialogTrigger>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>添加到黑名单</DialogTitle>
            </DialogHeader>
            <div class="space-y-4 py-2">
              <div class="space-y-2">
                <label class="text-sm font-medium">IP 或 CIDR</label>
                <Input v-model="newValue" placeholder="1.2.3.4 或 1.2.3.0/24" />
                <p class="text-xs text-muted-foreground">
                  自动识别格式: IP (1.2.3.4) 或 CIDR (1.2.3.0/24)
                </p>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">备注 (可选)</label>
                <Input v-model="newNote" placeholder="例如: 恶意爬虫" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose as-child>
                <Button type="button" variant="secondary">
                  取消
                </Button>
              </DialogClose>
              <Button :disabled="adding" @click="addItem">
                <Loader2 v-if="adding" class="w-4 h-4 mr-2 animate-spin" />
                确认添加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="!loading && items.length === 0" class="text-sm text-muted-foreground py-4 text-center">
        暂无黑名单
      </div>
      <div v-else class="space-y-2 max-h-96 overflow-y-auto">
        <div
          v-for="item in items"
          :key="`${item.type}:${item.value}`"
          class="flex items-center justify-between p-3 rounded border"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <Badge :variant="item.type === 'cidr' ? 'default' : 'secondary'">
                {{ item.type.toUpperCase() }}
              </Badge>
              <span class="font-mono text-sm">{{ item.value }}</span>
            </div>
            <div class="text-xs text-muted-foreground mt-1 truncate">
              {{ item.reason === 'auto_50_fails' ? '自动封禁(失败次数过多)' : '手动添加' }}
              · 由 {{ item.blockedBy }} 于 {{ formatTime(item.blockedAt) }}
              <span v-if="item.note">· {{ item.note }}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            :disabled="removing[`${item.type}:${item.value}`]"
            @click="removeItem(item)"
          >
            <Loader2 v-if="removing[`${item.type}:${item.value}`]" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>