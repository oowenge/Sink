<script setup>
import UsersIndex from '../../components/dashboard/users/Index.vue'

definePageMeta({
  middleware: 'admin-only',
})
</script>

<template>
  <main class="space-y-6">
    <DashboardBreadcrumb title="用户管理" />
    <UsersIndex />
  </main>
</template>
