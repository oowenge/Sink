<script setup>
import { Snowflake } from 'lucide-vue-next'

definePageMeta({
  middleware: 'admin-only',
})
</script>

<template>
  <main class="space-y-6">
    <DashboardBreadcrumb title="安全中心" />

    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        安全中心
      </h1>
      <NuxtLink to="/dashboard/cold-links">
        <Button variant="outline" size="sm">
          <Snowflake class="w-4 h-4 mr-2" />
          冷链接清理
        </Button>
      </NuxtLink>
    </div>

    <DashboardSecurityStatus />

    <div class="grid gap-6 lg:grid-cols-2">
      <DashboardSecurityLockedUsers />
      <DashboardSecurityBlocklist />
      <DashboardSecurityAllowlist class="lg:col-span-2" />
      <DashboardSecurityAuditLogs />
    </div>
  </main>
</template>