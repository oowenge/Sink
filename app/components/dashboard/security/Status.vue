<script setup>
import { Lock, Shield, ShieldCheck } from 'lucide-vue-next'

const status = ref(null)
const loading = ref(false)

async function fetchStatus() {
  loading.value = true
  try {
    status.value = await useAPI('/api/admin/security/status')
  }
  catch (e) {
    console.error(e)
  }
  finally {
    loading.value = false
  }
}

onMounted(fetchStatus)

defineExpose({ refresh: fetchStatus })
</script>

<template>
  <div class="grid gap-4 md:grid-cols-3">
    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">
          当前锁定用户
        </CardTitle>
        <Lock class="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">
          {{ status?.lockedUsers ?? '-' }}
        </div>
        <p class="text-xs text-muted-foreground">
          5 分钟内连续失败 3 次的账号
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">
          黑名单
        </CardTitle>
        <Shield class="w-4 h-4 text-destructive" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">
          {{ (status?.blocklist?.ips ?? 0) + (status?.blocklist?.cidrs ?? 0) }}
        </div>
        <p class="text-xs text-muted-foreground">
          IP {{ status?.blocklist?.ips ?? 0 }} / CIDR {{ status?.blocklist?.cidrs ?? 0 }}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">
          白名单
        </CardTitle>
        <ShieldCheck class="w-4 h-4 text-green-600" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold">
          {{ (status?.allowlist?.ips ?? 0) + (status?.allowlist?.cidrs ?? 0) }}
        </div>
        <p class="text-xs text-muted-foreground">
          IP {{ status?.allowlist?.ips ?? 0 }} / CIDR {{ status?.allowlist?.cidrs ?? 0 }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>