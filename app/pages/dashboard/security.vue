<script setup>
definePageMeta({
  middleware: 'admin-only',
})
</script>

<template>
  <main class="space-y-6">
    <DashboardBreadcrumb title="安全中心" />

    <h1 class="text-2xl font-bold">
      安全中心
    </h1>

    <DashboardSecurityStatus />

    <div class="grid gap-6 lg:grid-cols-2">
      <DashboardSecurityLockedUsers />
      <DashboardSecurityBlocklist />
      <DashboardSecurityAllowlist class="lg:col-span-2" />
    </div>
  </main>
</template>