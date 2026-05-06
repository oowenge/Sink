<script setup>
import { NuxtLink } from '#components'
import { Shield } from 'lucide-vue-next'
defineProps({
  title: {
    type: String,
    required: true,
  },
})
const { title } = useAppConfig()

const isAdmin = ref(false)
onMounted(() => {
  isAdmin.value = localStorage.getItem('SinkUserRole') === 'admin'
})
</script>

<template>
  <Breadcrumb class="flex justify-between">
    <BreadcrumbList>
      <BreadcrumbItem>
        <BreadcrumbLink href="/">
          {{ title }}
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbLink
          :as="NuxtLink"
          to="/dashboard"
        >
          {{ $t('dashboard.title') }}
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbPage>{{ title }}</BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
    <div class="flex items-center gap-3">
      <NuxtLink v-if="isAdmin" to="/dashboard/security" class="cursor-pointer" title="安全中心">
        <Shield class="w-4 h-4 hover:text-primary" />
      </NuxtLink>
      <DashboardChangePassword />
      <DashboardLogout />
    </div>
  </Breadcrumb>
</template>