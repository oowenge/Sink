<script setup lang="ts">
import { BarChart3, Copy, Download, ExternalLink, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

interface CompareRow {
  slug: string
  url: string
  totalClicks: number
  countryClicks: number
  countryUV: number
  ratio: number
}

interface CompareResult {
  country: string | null
  total: number
  data: CompareRow[]
}

// 时间范围预设(秒)
const TIME_PRESETS = [
  { label: '过去 24 小时', value: '24h', seconds: 24 * 3600 },
  { label: '过去 7 天', value: '7d', seconds: 7 * 24 * 3600 },
  { label: '过去 30 天', value: '30d', seconds: 30 * 24 * 3600 },
  { label: '过去 90 天', value: '90d', seconds: 90 * 24 * 3600 },
  { label: '全部时间', value: 'all', seconds: 0 },
]

// 常用国家(可继续加)
const COMMON_COUNTRIES = [
  { code: 'BR', name: '巴西 🇧🇷' },
  { code: 'US', name: '美国 🇺🇸' },
  { code: 'CN', name: '中国 🇨🇳' },
  { code: 'JP', name: '日本 🇯🇵' },
  { code: 'IN', name: '印度 🇮🇳' },
  { code: 'MX', name: '墨西哥 🇲🇽' },
  { code: 'ID', name: '印尼 🇮🇩' },
  { code: 'PH', name: '菲律宾 🇵🇭' },
  { code: 'VN', name: '越南 🇻🇳' },
  { code: 'TH', name: '泰国 🇹🇭' },
  { code: 'AR', name: '阿根廷 🇦🇷' },
  { code: 'CO', name: '哥伦比亚 🇨🇴' },
  { code: 'PE', name: '秘鲁 🇵🇪' },
  { code: 'CL', name: '智利 🇨🇱' },
]

const timeRange = ref('7d')
const country = ref('BR') // 默认巴西
const slugContains = ref('')
const displayLimit = ref('100')

const loading = ref(false)
const result = ref<CompareResult | null>(null)

function buildQuery() {
  const preset = TIME_PRESETS.find(p => p.value === timeRange.value)
  const now = Math.floor(Date.now() / 1000)
  const params: Record<string, any> = { limit: displayLimit.value }

  if (preset && preset.seconds > 0) {
    params.startAt = now - preset.seconds
    params.endAt = now
  }
  if (country.value)
    params.country = country.value
  if (slugContains.value.trim())
    params.slugContains = slugContains.value.trim()

  return params
}

async function search() {
  loading.value = true
  try {
    const data = await useAPI('/api/stats/compare', {
      query: buildQuery(),
    }) as CompareResult
    result.value = data
    if (data.total === 0) {
      toast.info('没有找到符合条件的数据')
    }
  }
  catch (err: any) {
    toast.error(err?.data?.message || err?.message || '查询失败')
  }
  finally {
    loading.value = false
  }
}

// 打开页面就自动加载默认视图
onMounted(() => {
  search()
})

// 当筛选条件变化时,不自动查询(避免每次拉数据),用户点"查询"按钮明确触发
// 但回车也触发
function onEnter(e: KeyboardEvent) {
  if (e.key === 'Enter')
    search()
}



function fmtPct(r: number) {
  return `${(r * 100).toFixed(1)}%`
}

// 短链显示
function shortLink(slug: string) {
  return `${window.location.origin}/${slug}`
}

// 复制全部短链
function copyAllShortLinks() {
  if (!result.value?.data.length)
    return
  const text = result.value.data.map(r => shortLink(r.slug)).join('\n')
  navigator.clipboard.writeText(text)
  toast.success(`已复制 ${result.value.data.length} 条短链`)
}

// 导出 CSV(包含全部数据)
function downloadCSV() {
  if (!result.value?.data.length)
    return
  const cc = result.value.country || 'ALL'
  const header = `rank,slug,short_link,original_url,${cc}_clicks,${cc}_uv,total_clicks,${cc}_ratio`
  const rows = result.value.data.map((r, i) =>
    `${i + 1},${r.slug},${shortLink(r.slug)},"${r.url}",${r.countryClicks},${r.countryUV},${r.totalClicks},${(r.ratio * 100).toFixed(2)}%`,
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }) // BOM 让 Excel 识别中文
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sink-compare-${cc}-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <!-- 筛选区 -->
    <Card>
      <CardHeader>
        <CardTitle>数据对比</CardTitle>
        <CardDescription>
          按国家、时间筛选,看哪些短链在该地区表现最好。数据来自 Cloudflare Analytics Engine,可能有约 5 分钟延迟。
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <!-- 时间范围 -->
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">时间范围</label>
            <Select v-model="timeRange">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in TIME_PRESETS" :key="p.value" :value="p.value">
                  {{ p.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 国家 -->
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">国家(留空=全球)</label>
            <Select v-model="country">
              <SelectTrigger>
                <SelectValue placeholder="选择国家" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  全球(不筛选)
                </SelectItem>
                <SelectItem v-for="c in COMMON_COUNTRIES" :key="c.code" :value="c.code">
                  {{ c.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- slug 模糊匹配 -->
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">slug 包含(可空)</label>
            <Input v-model="slugContains" placeholder="例如 pubg" @keydown="onEnter" />
          </div>

          <!-- 显示前 N 条 -->
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">显示前</label>
            <Select v-model="displayLimit">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">
                  50 条
                </SelectItem>
                <SelectItem value="100">
                  100 条
                </SelectItem>
                <SelectItem value="200">
                  200 条
                </SelectItem>
                <SelectItem value="500">
                  500 条
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button :disabled="loading" @click="search">
          <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
          查询
        </Button>
      </CardContent>
    </Card>

    <!-- 结果区 -->
    <Card v-if="result">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <BarChart3 class="w-5 h-5" />
          排行榜:{{ result.country || '全球' }} · 共 {{ result.total }} 条
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" :disabled="!result.total" @click="copyAllShortLinks">
            <Copy class="w-4 h-4 mr-2" /> 复制全部短链
          </Button>
          <Button size="sm" variant="outline" :disabled="!result.total" @click="downloadCSV">
            <Download class="w-4 h-4 mr-2" /> 导出 CSV
          </Button>
        </div>

        <!-- 表格 -->
        <div v-if="result.total" class="border rounded-md overflow-auto max-h-[600px]">
          <table class="w-full text-sm">
            <thead class="bg-muted sticky top-0 z-10">
              <tr>
                <th class="text-left p-2 w-12">
                  排名
                </th>
                <th class="text-left p-2">
                  短链 / 原始 URL
                </th>
                <th class="text-right p-2 whitespace-nowrap">
                  {{ result.country || '全球' }} 点击
                </th>
                <th class="text-right p-2 whitespace-nowrap">
                  {{ result.country || '全球' }} UV
                </th>
                <th class="text-right p-2 whitespace-nowrap">
                  总点击
                </th>
                <th class="text-right p-2 whitespace-nowrap">
                  占比
                </th>
                <th class="text-center p-2 w-20">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in result.data" :key="row.slug" class="border-t hover:bg-muted/30">
                <td class="p-2 text-muted-foreground font-mono">
                  {{ idx + 1 }}
                </td>
                <td class="p-2 max-w-md">
                  <a
                    :href="shortLink(row.slug)"
                    target="_blank"
                    class="font-mono text-xs text-primary hover:underline block truncate"
                    :title="shortLink(row.slug)"
                  >
                    /{{ row.slug }}
                  </a>
                  <div class="text-xs text-muted-foreground truncate" :title="row.url">
                    {{ row.url }}
                  </div>
                </td>
                <td class="p-2 text-right font-mono font-medium">
                  {{ row.countryClicks.toLocaleString() }}
                </td>
                <td class="p-2 text-right font-mono text-muted-foreground">
                  {{ row.countryUV.toLocaleString() }}
                </td>
                <td class="p-2 text-right font-mono text-muted-foreground">
                  {{ row.totalClicks.toLocaleString() }}
                </td>
                <td class="p-2 text-right font-mono">
                  <span :class="row.ratio > 0.5 ? 'text-green-600 font-medium' : 'text-muted-foreground'">
                    {{ fmtPct(row.ratio) }}
                  </span>
                </td>
                <td class="p-2 text-center">
                  <NuxtLink
                    :to="`/dashboard/link?slug=${encodeURIComponent(row.slug)}`"
                    class="inline-flex items-center justify-center text-muted-foreground hover:text-primary"
                    title="查看详细分析"
                  >
                    <ExternalLink class="w-4 h-4" />
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 空状态 -->
        <div v-else class="py-12 text-center text-muted-foreground">
          没有数据。试试改变筛选条件或时间范围。
        </div>
      </CardContent>
    </Card>
  </div>
</template>
