<script setup>
import { LogOut } from 'lucide-vue-next'

function logOut() {
  localStorage.removeItem('SinkSiteToken')
  navigateTo('/dashboard/login')
}
</script>

<template>
  <AlertDialog>
    <AlertDialogTrigger as-child>
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        title="退出登录"
      >
        <LogOut class="w-4 h-4" />
        <span>退出登录</span>
      </button>
    </AlertDialogTrigger>
    <AlertDialogContent class="max-w-[95svw] max-h-[95svh] md:max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('logout.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('logout.confirm') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="logOut">
          {{ $t('logout.action') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
