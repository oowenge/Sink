<script setup>
import { AlertCircle, KeyRound, User as UserIcon } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const username = ref('')
const password = ref('')
const submitting = ref(false)

// 限流提示状态
const lockoutMessage = ref('') // 锁定提示文字
const remainingAttempts = ref(null) // 剩余尝试次数
const lockoutCountdown = ref(0) // 倒计时秒数
let countdownTimer = null

function startCountdown(seconds) {
  lockoutCountdown.value = seconds
  if (countdownTimer)
    clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    lockoutCountdown.value--
    if (lockoutCountdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
      lockoutMessage.value = ''
    }
  }, 1000)
}

function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0)
    return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

async function loginByUser() {
  if (!username.value.trim() || !password.value) {
    toast.error('请输入用户名和密码')
    return
  }
  submitting.value = true
  try {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value,
      },
    })
    // 把 session token 存到 localStorage,沿用现有 key 名
    localStorage.setItem('SinkSiteToken', data.token)
    localStorage.setItem('SinkUsername', data.username)
    localStorage.setItem('SinkUserRole', data.role)
    // 登录成功清除限流提示
    lockoutMessage.value = ''
    remainingAttempts.value = null
    toast.success(`欢迎回来,${data.username}`)
    await navigateTo('/dashboard')
  }
  catch (e) {
    console.error(e)
    const errMessage = e?.data?.message || e?.message || '请检查用户名和密码'

    // 解析消息前缀来判断错误类型
    const lockedMatch = errMessage.match(/^\[LOCKED:(\d+)\]\s?(.*)$/)
    const remainingMatch = errMessage.match(/^\[REMAINING:(\d+)\]\s?(.*)$/)
    const ipBlockedMatch = errMessage.match(/^\[IP_BLOCKED\]\s?(.*)$/)

    if (lockedMatch) {
      // 账号锁定
      const seconds = Number.parseInt(lockedMatch[1], 10)
      const cleanMessage = lockedMatch[2]
      lockoutMessage.value = cleanMessage
      remainingAttempts.value = null
      startCountdown(seconds)
      toast.error('账号已锁定', { description: cleanMessage })
    }
    else if (remainingMatch) {
      // 普通失败带剩余次数
      const remaining = Number.parseInt(remainingMatch[1], 10)
      const cleanMessage = remainingMatch[2]
      remainingAttempts.value = remaining
      lockoutMessage.value = ''
      toast.error('登录失败', { description: cleanMessage })
    }
    else if (ipBlockedMatch) {
      // IP 封禁
      const cleanMessage = ipBlockedMatch[1]
      lockoutMessage.value = cleanMessage
      remainingAttempts.value = null
      toast.error('IP 已被封禁', { description: cleanMessage })
    }
    else {
      // 其他错误
      remainingAttempts.value = null
      lockoutMessage.value = ''
      toast.error('登录失败', { description: errMessage })
    }
  }
  finally {
    submitting.value = false
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    loginByUser()
  }
}

onUnmounted(() => {
  if (countdownTimer)
    clearInterval(countdownTimer)
})
</script>

<template>
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle class="text-2xl">
        登录
      </CardTitle>
      <CardDescription>
        使用用户名和密码登录
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <!-- 锁定/封禁警告 -->
      <Alert v-if="lockoutMessage" variant="destructive">
        <AlertCircle class="w-4 h-4" />
        <AlertTitle>登录受限</AlertTitle>
        <AlertDescription>
          <div>{{ lockoutMessage }}</div>
          <div v-if="lockoutCountdown > 0" class="mt-1 font-mono">
            剩余: {{ formatCountdown(lockoutCountdown) }}
          </div>
        </AlertDescription>
      </Alert>

      <!-- 剩余尝试次数提示 -->
      <Alert v-if="remainingAttempts !== null && remainingAttempts > 0 && !lockoutMessage">
        <AlertCircle class="w-4 h-4" />
        <AlertDescription>
          密码错误,还可尝试 <strong>{{ remainingAttempts }}</strong> 次,失败后账号将锁定 5 分钟
        </AlertDescription>
      </Alert>

      <!-- 用户名密码登录 -->
      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="username">用户名</Label>
          <div class="relative">
            <UserIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="username"
              v-model="username"
              placeholder="例如 owen"
              class="pl-9"
              :disabled="submitting || lockoutCountdown > 0"
              @keydown="handleKeydown"
            />
          </div>
        </div>
        <div class="space-y-2">
          <Label for="password">密码</Label>
          <div class="relative">
            <KeyRound class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="********"
              class="pl-9"
              :disabled="submitting || lockoutCountdown > 0"
              @keydown="handleKeydown"
            />
          </div>
        </div>
        <Button class="w-full" :disabled="submitting || lockoutCountdown > 0" @click="loginByUser">
          {{ submitting ? '登录中...' : (lockoutCountdown > 0 ? '已锁定' : '登录') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
