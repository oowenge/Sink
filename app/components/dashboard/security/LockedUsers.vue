<script setup>
import { Loader2, Unlock } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const items = ref([])
const loading = ref(false)
const unlocking = ref({})

async function fetchList() {
  loading.value = true
  try {
    const data = await useAPI('/api/admin/security/locked-users')
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

async function unlock(username) {
  unlocking.value[username] = true
  try {
    await useAPI('/api/admin/security/unlock-user', {
      method: 'POST',
      body: { username },
    })
    toast.success(`已解锁 ${username}`)
    await fetchList()
  }
  catch (e) {
    toast.error(e?.data?.message || '解锁失败')
  }
  finally {
    unlocking.value[username] = false
  }
}

function formatRemaining(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}分${s}秒`
}

onMounted(fetchList)
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <div>
        <CardTitle>当前锁定用户</CardTitle>
        <CardDescription>失败 3 次以上被自动锁定 5 分钟</CardDescription>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="fetchList">
        <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
        刷新
      </Button>
    </CardHeader>
    <CardContent>
      <div v-if="!loading && items.length === 0" class="text-sm text-muted-foreground py-4 text-center">
        无锁定用户
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="item in items"
          :key="item.username"
          class="flex items-center justify-between p-3 rounded border"
        >
          <div>
            <div class="font-medium">
              {{ item.username }}
            </div>
            <div class="text-xs text-muted-foreground">
              失败 {{ item.count }} 次,剩余 {{ formatRemaining(item.remainingSeconds) }}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="unlocking[item.username]"
            @click="unlock(item.username)"
          >
            <Loader2 v-if="unlocking[item.username]" class="w-4 h-4 mr-2 animate-spin" />
            <Unlock v-else class="w-4 h-4 mr-2" />
            解锁
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>