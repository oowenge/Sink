<script setup>
import { Plus, X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

// 完整 IANA 时区列表(按地区分组)
const TIMEZONES = [
  // ===== UTC =====
  { value: 'UTC', label: 'UTC (协调世界时)', region: 'UTC' },

  // ===== 亚洲 =====
  { value: 'Asia/Shanghai', label: '北京/上海 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Hong_Kong', label: '香港 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Macau', label: '澳门 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Taipei', label: '台北 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Singapore', label: '新加坡 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Kuala_Lumpur', label: '吉隆坡 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Tokyo', label: '东京 (UTC+9)', region: '亚洲' },
  { value: 'Asia/Seoul', label: '首尔 (UTC+9)', region: '亚洲' },
  { value: 'Asia/Pyongyang', label: '平壤 (UTC+9)', region: '亚洲' },
  { value: 'Asia/Bangkok', label: '曼谷 (UTC+7)', region: '亚洲' },
  { value: 'Asia/Jakarta', label: '雅加达 (UTC+7)', region: '亚洲' },
  { value: 'Asia/Ho_Chi_Minh', label: '胡志明市 (UTC+7)', region: '亚洲' },
  { value: 'Asia/Manila', label: '马尼拉 (UTC+8)', region: '亚洲' },
  { value: 'Asia/Yangon', label: '仰光 (UTC+6:30)', region: '亚洲' },
  { value: 'Asia/Dhaka', label: '达卡 (UTC+6)', region: '亚洲' },
  { value: 'Asia/Kathmandu', label: '加德满都 (UTC+5:45)', region: '亚洲' },
  { value: 'Asia/Kolkata', label: '加尔各答/新德里 (UTC+5:30)', region: '亚洲' },
  { value: 'Asia/Colombo', label: '科伦坡 (UTC+5:30)', region: '亚洲' },
  { value: 'Asia/Karachi', label: '卡拉奇 (UTC+5)', region: '亚洲' },
  { value: 'Asia/Tashkent', label: '塔什干 (UTC+5)', region: '亚洲' },
  { value: 'Asia/Kabul', label: '喀布尔 (UTC+4:30)', region: '亚洲' },
  { value: 'Asia/Dubai', label: '迪拜 (UTC+4)', region: '亚洲' },
  { value: 'Asia/Tehran', label: '德黑兰 (UTC+3:30)', region: '亚洲' },
  { value: 'Asia/Baghdad', label: '巴格达 (UTC+3)', region: '亚洲' },
  { value: 'Asia/Riyadh', label: '利雅得 (UTC+3)', region: '亚洲' },
  { value: 'Asia/Jerusalem', label: '耶路撒冷 (UTC+2)', region: '亚洲' },
  { value: 'Asia/Beirut', label: '贝鲁特 (UTC+2)', region: '亚洲' },
  { value: 'Asia/Almaty', label: '阿拉木图 (UTC+6)', region: '亚洲' },
  { value: 'Asia/Novosibirsk', label: '新西伯利亚 (UTC+7)', region: '亚洲' },
  { value: 'Asia/Vladivostok', label: '符拉迪沃斯托克 (UTC+10)', region: '亚洲' },
  { value: 'Asia/Magadan', label: '马加丹 (UTC+11)', region: '亚洲' },
  { value: 'Asia/Kamchatka', label: '堪察加 (UTC+12)', region: '亚洲' },

  // ===== 欧洲 =====
  { value: 'Europe/London', label: '伦敦 (UTC+0)', region: '欧洲' },
  { value: 'Europe/Dublin', label: '都柏林 (UTC+0)', region: '欧洲' },
  { value: 'Europe/Lisbon', label: '里斯本 (UTC+0)', region: '欧洲' },
  { value: 'Europe/Paris', label: '巴黎 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Berlin', label: '柏林 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Madrid', label: '马德里 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Rome', label: '罗马 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Amsterdam', label: '阿姆斯特丹 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Brussels', label: '布鲁塞尔 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Vienna', label: '维也纳 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Zurich', label: '苏黎世 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Stockholm', label: '斯德哥尔摩 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Oslo', label: '奥斯陆 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Copenhagen', label: '哥本哈根 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Warsaw', label: '华沙 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Prague', label: '布拉格 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Budapest', label: '布达佩斯 (UTC+1)', region: '欧洲' },
  { value: 'Europe/Athens', label: '雅典 (UTC+2)', region: '欧洲' },
  { value: 'Europe/Helsinki', label: '赫尔辛基 (UTC+2)', region: '欧洲' },
  { value: 'Europe/Bucharest', label: '布加勒斯特 (UTC+2)', region: '欧洲' },
  { value: 'Europe/Kiev', label: '基辅 (UTC+2)', region: '欧洲' },
  { value: 'Europe/Istanbul', label: '伊斯坦布尔 (UTC+3)', region: '欧洲' },
  { value: 'Europe/Moscow', label: '莫斯科 (UTC+3)', region: '欧洲' },

  // ===== 美洲 =====
  { value: 'America/New_York', label: '纽约 (UTC-5)', region: '美洲' },
  { value: 'America/Detroit', label: '底特律 (UTC-5)', region: '美洲' },
  { value: 'America/Toronto', label: '多伦多 (UTC-5)', region: '美洲' },
  { value: 'America/Montreal', label: '蒙特利尔 (UTC-5)', region: '美洲' },
  { value: 'America/Chicago', label: '芝加哥 (UTC-6)', region: '美洲' },
  { value: 'America/Mexico_City', label: '墨西哥城 (UTC-6)', region: '美洲' },
  { value: 'America/Winnipeg', label: '温尼伯 (UTC-6)', region: '美洲' },
  { value: 'America/Denver', label: '丹佛 (UTC-7)', region: '美洲' },
  { value: 'America/Phoenix', label: '凤凰城 (UTC-7)', region: '美洲' },
  { value: 'America/Edmonton', label: '埃德蒙顿 (UTC-7)', region: '美洲' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (UTC-8)', region: '美洲' },
  { value: 'America/San_Francisco', label: '旧金山 (UTC-8)', region: '美洲' },
  { value: 'America/Vancouver', label: '温哥华 (UTC-8)', region: '美洲' },
  { value: 'America/Tijuana', label: '蒂华纳 (UTC-8)', region: '美洲' },
  { value: 'America/Anchorage', label: '安克雷奇 (UTC-9)', region: '美洲' },
  { value: 'Pacific/Honolulu', label: '檀香山 (UTC-10)', region: '美洲' },
  { value: 'America/Sao_Paulo', label: '圣保罗 (UTC-3)', region: '美洲' },
  { value: 'America/Rio_Branco', label: '里约布兰科 (UTC-5)', region: '美洲' },
  { value: 'America/Manaus', label: '马瑙斯 (UTC-4)', region: '美洲' },
  { value: 'America/Argentina/Buenos_Aires', label: '布宜诺斯艾利斯 (UTC-3)', region: '美洲' },
  { value: 'America/Santiago', label: '圣地亚哥 (UTC-4)', region: '美洲' },
  { value: 'America/Lima', label: '利马 (UTC-5)', region: '美洲' },
  { value: 'America/Bogota', label: '波哥大 (UTC-5)', region: '美洲' },
  { value: 'America/Caracas', label: '加拉加斯 (UTC-4)', region: '美洲' },
  { value: 'America/La_Paz', label: '拉巴斯 (UTC-4)', region: '美洲' },
  { value: 'America/Asuncion', label: '亚松森 (UTC-4)', region: '美洲' },
  { value: 'America/Montevideo', label: '蒙得维的亚 (UTC-3)', region: '美洲' },
  { value: 'America/Havana', label: '哈瓦那 (UTC-5)', region: '美洲' },
  { value: 'America/Panama', label: '巴拿马 (UTC-5)', region: '美洲' },
  { value: 'America/Costa_Rica', label: '哥斯达黎加 (UTC-6)', region: '美洲' },
  { value: 'America/Guatemala', label: '危地马拉 (UTC-6)', region: '美洲' },
  { value: 'America/Halifax', label: '哈利法克斯 (UTC-4)', region: '美洲' },

  // ===== 非洲 =====
  { value: 'Africa/Cairo', label: '开罗 (UTC+2)', region: '非洲' },
  { value: 'Africa/Johannesburg', label: '约翰内斯堡 (UTC+2)', region: '非洲' },
  { value: 'Africa/Lagos', label: '拉各斯 (UTC+1)', region: '非洲' },
  { value: 'Africa/Casablanca', label: '卡萨布兰卡 (UTC+1)', region: '非洲' },
  { value: 'Africa/Algiers', label: '阿尔及尔 (UTC+1)', region: '非洲' },
  { value: 'Africa/Tunis', label: '突尼斯 (UTC+1)', region: '非洲' },
  { value: 'Africa/Tripoli', label: '的黎波里 (UTC+2)', region: '非洲' },
  { value: 'Africa/Nairobi', label: '内罗毕 (UTC+3)', region: '非洲' },
  { value: 'Africa/Addis_Ababa', label: '亚的斯亚贝巴 (UTC+3)', region: '非洲' },
  { value: 'Africa/Khartoum', label: '喀土穆 (UTC+2)', region: '非洲' },
  { value: 'Africa/Accra', label: '阿克拉 (UTC+0)', region: '非洲' },
  { value: 'Africa/Dakar', label: '达喀尔 (UTC+0)', region: '非洲' },

  // ===== 大洋洲 =====
  { value: 'Australia/Sydney', label: '悉尼 (UTC+11)', region: '大洋洲' },
  { value: 'Australia/Melbourne', label: '墨尔本 (UTC+11)', region: '大洋洲' },
  { value: 'Australia/Brisbane', label: '布里斯班 (UTC+10)', region: '大洋洲' },
  { value: 'Australia/Perth', label: '珀斯 (UTC+8)', region: '大洋洲' },
  { value: 'Australia/Adelaide', label: '阿德莱德 (UTC+10:30)', region: '大洋洲' },
  { value: 'Australia/Darwin', label: '达尔文 (UTC+9:30)', region: '大洋洲' },
  { value: 'Australia/Hobart', label: '霍巴特 (UTC+11)', region: '大洋洲' },
  { value: 'Pacific/Auckland', label: '奥克兰 (UTC+13)', region: '大洋洲' },
  { value: 'Pacific/Fiji', label: '斐济 (UTC+12)', region: '大洋洲' },
  { value: 'Pacific/Guam', label: '关岛 (UTC+10)', region: '大洋洲' },
  { value: 'Pacific/Port_Moresby', label: '莫尔兹比港 (UTC+10)', region: '大洋洲' },
  { value: 'Pacific/Tahiti', label: '塔希提 (UTC-10)', region: '大洋洲' },
  { value: 'Pacific/Midway', label: '中途岛 (UTC-11)', region: '大洋洲' },
]

const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

function updateTz(value) {
  emit('update:modelValue', { ...props.modelValue, tz: value })
}

function updateUrl(e) {
  emit('update:modelValue', { ...props.modelValue, url: e.target.value })
}

function addWindow() {
  const windows = [...(props.modelValue.windows || []), { start: '09:00', end: '18:00' }]
  emit('update:modelValue', { ...props.modelValue, windows })
}

function removeWindow(idx) {
  const windows = [...(props.modelValue.windows || [])]
  windows.splice(idx, 1)
  emit('update:modelValue', { ...props.modelValue, windows })
}

function updateWindow(idx, key, value) {
  const windows = [...(props.modelValue.windows || [])]
  windows[idx] = { ...windows[idx], [key]: value }
  emit('update:modelValue', { ...props.modelValue, windows })
}

function toggleWeekday(idx, day) {
  const windows = [...(props.modelValue.windows || [])]
  const current = windows[idx].weekdays || []
  const exists = current.includes(day)
  windows[idx] = {
    ...windows[idx],
    weekdays: exists ? current.filter(d => d !== day) : [...current, day].sort(),
  }
  emit('update:modelValue', { ...props.modelValue, windows })
}

function isWeekdaySelected(idx, day) {
  const w = props.modelValue.windows?.[idx]
  if (!w?.weekdays || w.weekdays.length === 0) return true // 不选 = 每天都生效
  return w.weekdays.includes(day)
}

function isAllWeekdays(idx) {
  const w = props.modelValue.windows?.[idx]
  return !w?.weekdays || w.weekdays.length === 0
}
</script>

<template>
  <div class="space-y-3">
    <!-- 时区选择 -->
    <div class="space-y-2">
      <Label class="text-xs">时区</Label>
      <Select :model-value="modelValue.tz" @update:model-value="updateTz">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent class="max-h-96">
          <template v-for="region in ['UTC', '亚洲', '欧洲', '美洲', '非洲', '大洋洲']" :key="region">
            <div class="px-2 py-1 text-xs font-semibold text-muted-foreground sticky top-0 bg-popover">
              {{ region }}
            </div>
            <SelectItem
              v-for="tz in TIMEZONES.filter(t => t.region === region)"
              :key="tz.value"
              :value="tz.value"
            >
              {{ tz.label }}
            </SelectItem>
          </template>
        </SelectContent>
      </Select>
    </div>

    <!-- 时间窗口列表 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-xs">生效时间段</Label>
        <Button type="button" variant="ghost" size="sm" @click="addWindow">
          <Plus class="w-3 h-3 mr-1" />
          添加时段
        </Button>
      </div>

      <div
        v-for="(w, idx) in (modelValue.windows || [])"
        :key="idx"
        class="rounded border p-2 space-y-2 bg-background"
      >
        <div class="flex items-center gap-2">
          <Input
            type="time"
            :value="w.start"
            class="w-28"
            @input="updateWindow(idx, 'start', $event.target.value)"
          />
          <span class="text-sm">至</span>
          <Input
            type="time"
            :value="w.end"
            class="w-28"
            @input="updateWindow(idx, 'end', $event.target.value)"
          />
          <span class="text-xs text-muted-foreground flex-1">
            {{ w.start > w.end ? '(跨午夜)' : '' }}
          </span>
          <button
            type="button"
            class="p-1 hover:bg-destructive/20 rounded text-destructive"
            @click="removeWindow(idx)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- 星期选择 -->
        <div class="flex items-center gap-1 flex-wrap">
          <span class="text-xs text-muted-foreground mr-1">星期:</span>
          <span v-if="isAllWeekdays(idx)" class="text-xs text-muted-foreground">每天</span>
          <button
            v-for="d in WEEKDAYS"
            :key="d.value"
            type="button"
            class="w-7 h-7 text-xs rounded border"
            :class="isWeekdaySelected(idx, d.value) && !isAllWeekdays(idx)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-muted'"
            @click="toggleWeekday(idx, d.value)"
          >
            {{ d.label }}
          </button>
          <span class="text-xs text-muted-foreground ml-1">
            (留空=每天)
          </span>
        </div>
      </div>
    </div>

    <!-- 跳转 URL -->
    <div class="space-y-2">
      <Label class="text-xs">命中后跳转到</Label>
      <Input
        :value="modelValue.url"
        placeholder="https://target.com"
        @input="updateUrl"
      />
    </div>
  </div>
</template>