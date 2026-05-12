<script setup>
import { NuxtLink } from '#components'
import { Shield, Users } from 'lucide-vue-next'

defineProps({
  title: {
    type: String,
    required: true,
  },
})

const isAdmin = ref(false)
onMounted(() => {
  isAdmin.value = localStorage.getItem('SinkUserRole') === 'admin'
})
</script>

<template>
  <div class="flex justify-end">
    <div class="flex items-center gap-2">
      <NuxtLink
        v-if="isAdmin"
        to="/dashboard/security"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        title="安全中心"
      >
        <Shield class="w-4 h-4" />
        <span>安全中心</span>
      </NuxtLink>
      <NuxtLink
        v-if="isAdmin"
        to="/dashboard/users"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        title="用户管理"
      >
        <Users class="w-4 h-4" />
        <span>用户管理</span>
      </NuxtLink>
      <DashboardChangePassword />
      <DashboardLogout />
    </div>
  </div>
</template>
