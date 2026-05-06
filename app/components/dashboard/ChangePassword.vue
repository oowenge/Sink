<script setup lang="ts">
import { KeyRound, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const dialogOpen = ref(false)
const loading = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

function reset() {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

async function submit() {
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    toast.error('请填写完整')
    return
  }
  if (newPassword.value.length < 8) {
    toast.error('新密码至少 8 位')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.error('两次输入的新密码不一致')
    return
  }
  if (oldPassword.value === newPassword.value) {
    toast.error('新密码不能与旧密码相同')
    return
  }

  loading.value = true
  try {
    await useAPI('/api/auth/change-password', {
      method: 'POST',
      body: {
        oldPassword: oldPassword.value,
        newPassword: newPassword.value,
      },
    })
    toast.success('密码修改成功')
    dialogOpen.value = false
    reset()
  }
  catch (err: any) {
    toast.error(err?.data?.message || err?.message || '修改失败')
  }
  finally {
    loading.value = false
  }
}

watch(dialogOpen, (open) => {
  if (!open) reset()
})
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogTrigger as-child>
      <Button variant="outline" size="sm">
        <KeyRound class="w-4 h-4 mr-2" />
        修改密码
      </Button>
    </DialogTrigger>
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>修改密码</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <label class="text-sm font-medium">旧密码</label>
          <Input v-model="oldPassword" type="password" placeholder="请输入当前密码" autocomplete="current-password" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">新密码</label>
          <Input v-model="newPassword" type="password" placeholder="至少 8 位" autocomplete="new-password" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">确认新密码</label>
          <Input v-model="confirmPassword" type="password" placeholder="再次输入新密码" autocomplete="new-password" />
        </div>
      </div>
      <DialogFooter>
        <DialogClose as-child>
          <Button type="button" variant="secondary">
            取消
          </Button>
        </DialogClose>
        <Button :disabled="loading" @click="submit">
          <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
          确认修改
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>