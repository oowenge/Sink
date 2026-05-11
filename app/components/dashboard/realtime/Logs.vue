<script setup>
import AnimatedList from '@/components/spark-ui/AnimatedList.vue'
import Notification from '@/components/spark-ui/Notification.vue'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'

const time = inject('time')
const filters = inject('filters')

const logs = ref([])
const logskey = ref(0)
const lastFetchedAt = ref(0) // 上次成功拉取的时间(秒)
const isPolling = ref(true) // 是否正在轮询(标签页可见时 true)
const fetchInFlight = ref(false) // 防并发

// 轮询间隔(毫秒)
const POLL_INTERVAL = 10000

async function getEvents(isPoll = false) {
  if (fetchInFlight.value) return
  fetchInFlight.value = true
  try {
    const data = await useAPI('/api/logs/events', {
      query: {
        startAt: time.value.startAt,
        endAt: time.value.endAt,
        ...filters.value,
      },
    })
    const next = (data || []).slice().reverse()

    if (isPoll && logs.value.length > 0) {
      // 增量合并:用现有 id 集合做去重,只追加新事件
      const existingIds = new Set(logs.value.map(x => x.id))
      const newEvents = next.filter(x => !existingIds.has(x.id))
      if (newEvents.length > 0) {
        // 新事件加到列表(reverse 之后新的在末尾,所以 logs = [...logs, ...newEvents])
        // 但是 AnimatedList 通常是新的在前,我们改为新的在前以保持视觉一致性
        logs.value = [...newEvents, ...logs.value].slice(0, 200) // 最多保留 200 条避免内存爆掉
        // logskey 不变,让 AnimatedList 知道是增量(避免整体重新动画)
      }
    }
    else {
      // 首次加载 / time/filters 变化时全量替换
      logs.value = next
      logskey.value = Date.now()
    }
    lastFetchedAt.value = Math.floor(Date.now() / 1000)
  }
  catch (err) {
    console.error('[realtime] getEvents 失败:', err)
  }
  finally {
    fetchInFlight.value = false
  }
}

// 全量刷新:time/filters 变化时触发
watch([time, filters], () => getEvents(false), {
  deep: true,
})

onMounted(async () => {
  getEvents(false)
})

// ===== 自动轮询(可见时 10 秒一次) =====
const visibility = useDocumentVisibility()
const { pause, resume } = useIntervalFn(() => {
  if (visibility.value === 'visible' && isPolling.value) {
    getEvents(true)
  }
}, POLL_INTERVAL, { immediate: false })

onMounted(() => {
  resume()
})
onUnmounted(() => {
  pause()
})

// 手动暂停/恢复
function togglePolling() {
  isPolling.value = !isPolling.value
}

// 显示"几秒前更新"
const secondsAgo = ref(0)
useIntervalFn(() => {
  if (lastFetchedAt.value > 0) {
    secondsAgo.value = Math.floor(Date.now() / 1000) - lastFetchedAt.value
  }
}, 1000)

const statusLabel = computed(() => {
  if (visibility.value !== 'visible') return '已暂停(切回标签页恢复)'
  if (!isPolling.value) return '已暂停'
  if (lastFetchedAt.value === 0) return '加载中...'
  if (secondsAgo.value < 2) return '刚刚更新'
  return `${secondsAgo.value} 秒前更新`
})

const statusDot = computed(() => {
  if (visibility.value !== 'visible' || !isPolling.value) return 'bg-slate-400'
  return 'bg-green-500 animate-pulse'
})

function onUpdateItems(...args) {
  globalTrafficEvent.emit(...args)
}
</script>

<template>
  <div class="space-y-2">
    <!-- 状态条 -->
    <div
      class="flex items-center justify-between text-xs text-muted-foreground rounded-md border px-3 py-1.5 bg-background/80 backdrop-blur"
    >
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full" :class="statusDot" />
        <span>{{ statusLabel }}</span>
      </div>
      <button
        type="button"
        class="text-xs hover:text-primary transition-colors"
        @click="togglePolling"
      >
        {{ isPolling ? '⏸ 暂停' : '▶ 恢复' }}
      </button>
    </div>

    <!-- 事件流 -->
    <AnimatedList
      v-if="logs.length"
      :key="logskey"
      class="md:w-72"
      @update:items="onUpdateItems"
    >
      <template #default>
        <Notification
          v-for="item in logs"
          :key="item.id"
          :name="item.slug"
          :description="[item.os, item.browser].filter(Boolean).join(' ')"
          :icon="getFlag(item.country)"
          :time="item.timestamp"
          :item="item"
          class="w-full"
        />
      </template>
    </AnimatedList>
    <div v-else class="md:w-72 text-center text-xs text-muted-foreground py-8">
      暂无活动 — 选定时间段内没有访问记录
    </div>
  </div>
</template>