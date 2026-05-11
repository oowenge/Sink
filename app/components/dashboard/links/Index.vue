<script setup>
import { useInfiniteScroll } from '@vueuse/core'
import { Loader, X } from 'lucide-vue-next'

const links = ref([])
const limit = 100
let cursor = ''
let listComplete = false
let listError = false
const sortBy = ref('newest')
const activeTags = ref([]) // 当前筛选的标签数组(AND 关系)

const displayedLinks = computed(() => {
  const sorted = [...links.value]
  switch (sortBy.value) {
    case 'newest':
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt - b.createdAt)
    case 'az':
      return sorted.sort((a, b) => a.slug.localeCompare(b.slug))
    case 'za':
      return sorted.sort((a, b) => b.slug.localeCompare(a.slug))
    default:
      return sorted
  }
})

async function getLinks() {
  try {
    const query = { limit, cursor }
    // 有筛选标签时,传给后端 AND 过滤
    if (activeTags.value.length > 0) {
      query.tags = activeTags.value.join(',')
    }
    const data = await useAPI('/api/link/list', { query })
    links.value = links.value.concat(data.links).filter(Boolean)
    cursor = data.cursor
    listComplete = data.list_complete
    listError = false
  }
  catch (error) {
    console.error(error)
    listError = true
  }
}

const { isLoading } = useInfiniteScroll(
  document,
  getLinks,
  {
    distance: 150,
    interval: 1000,
    canLoadMore: () => {
      return !listError && !listComplete
    },
  },
)

function updateLinkList(link, type) {
  if (type === 'edit') {
    const index = links.value.findIndex(l => l.id === link.id)
    links.value[index] = link
  }
  else if (type === 'delete') {
    const index = links.value.findIndex(l => l.id === link.id)
    links.value.splice(index, 1)
  }
  else {
    links.value.unshift(link)
    sortBy.value = 'newest'
  }
}

// 标签筛选切换
function toggleTagFilter(tag) {
  if (!tag) return
  const t = tag.toLowerCase()
  const idx = activeTags.value.indexOf(t)
  if (idx >= 0) {
    activeTags.value.splice(idx, 1)
  }
  else {
    activeTags.value.push(t)
  }
  resetAndReload()
}

function clearAllTagFilters() {
  activeTags.value = []
  resetAndReload()
}

// 标签筛选变了,清空当前数据重新拉
function resetAndReload() {
  links.value = []
  cursor = ''
  listComplete = false
  listError = false
  getLinks()
}
</script>

<template>
  <main class="space-y-6">
    <div class="flex flex-col gap-6 sm:gap-2 sm:flex-row sm:justify-between">
      <DashboardNav class="flex-1">
        <div class="flex items-center gap-2">
          <NuxtLink to="/dashboard/links-batch">
            <Button variant="outline">
              批量创建
            </Button>
          </NuxtLink>
          <NuxtLink to="/dashboard/links-compare">
            <Button variant="outline">
              数据对比
            </Button>
          </NuxtLink>
          <DashboardLinksEditor @update:link="updateLinkList" />
          <DashboardLinksSort v-model:sort-by="sortBy" />
        </div>
      </DashboardNav>
      <LazyDashboardLinksSearch />
    </div>

    <!-- 标签筛选条 -->
    <div
      v-if="activeTags.length > 0"
      class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
    >
      <span class="text-sm text-muted-foreground">筛选标签 (AND):</span>
      <Badge
        v-for="tag in activeTags"
        :key="tag"
        variant="default"
        class="gap-1 pl-2 pr-1 cursor-pointer"
        @click="toggleTagFilter(tag)"
      >
        #{{ tag }}
        <X class="w-3 h-3" />
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        class="ml-auto h-7 text-xs"
        @click="clearAllTagFilters"
      >
        清除筛选
      </Button>
    </div>

    <section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <DashboardLinksLink
        v-for="link in displayedLinks"
        :key="link.id"
        :link="link"
        @update:link="updateLinkList"
        @filter-tag="toggleTagFilter"
      />
    </section>

    <div
      v-if="isLoading"
      class="flex items-center justify-center"
    >
      <Loader class="animate-spin" />
    </div>
    <div
      v-if="!isLoading && listComplete && displayedLinks.length > 0"
      class="flex items-center justify-center text-sm"
    >
      {{ $t('links.no_more') }}
    </div>
    <div
      v-if="!isLoading && listComplete && displayedLinks.length === 0 && activeTags.length > 0"
      class="flex flex-col items-center justify-center text-sm py-12 gap-2"
    >
      <p class="text-muted-foreground">没有匹配标签的链接</p>
      <Button variant="link" size="sm" @click="clearAllTagFilters">
        清除筛选
      </Button>
    </div>
    <div
      v-if="listError"
      class="flex items-center justify-center text-sm"
    >
      {{ $t('links.load_failed') }}
      <Button variant="link" @click="getLinks">
        {{ $t('common.try_again') }}
      </Button>
    </div>
  </main>
</template>