<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { 
  Search, 
  Compass, 
  MapPin, 
  Activity, 
  Droplet, 
  Thermometer, 
  ChevronRight, 
  ChevronLeft,
  AlertCircle,
  Clock
} from '@lucide/vue'
import { getTdsValColor, getTempValColor } from '~/utils/telemetry'
import { formatTelemetryDate } from '~/utils/date'
import { useGeolocation } from '~/composables/useGeolocation'

const router = useRouter()
const { lang, t } = useI18n()

// Geolocation integration
const { scanningLocation, locationStatus, detectAndRedirectNearestNode } = useGeolocation(t, lang, router)

// UI and state management
const nodes = ref<any[]>([])
const totalNodes = ref(0)
const page = ref(1)
const limit = ref(6)
const search = ref('')
const loading = ref(true)
const fetchError = ref('')
const hasFetched = ref(false)
const onlineOnly = ref(false)
let refreshInterval: any = null

// Calculate total pages
const totalPages = computed(() => Math.ceil(totalNodes.value / limit.value))

// Fetch nodes from local API
const fetchNodes = async (silent = false) => {
  if (!silent) loading.value = true
  fetchError.value = ''
  try {
    const data = await $fetch('/api/nodes', {
      query: {
        search: search.value,
        page: page.value,
        limit: limit.value,
        status: onlineOnly.value ? 'online' : ''
      }
    })
    if (data && typeof data === 'object' && 'nodes' in data) {
      nodes.value = (data as any).nodes
      totalNodes.value = (data as any).total
      hasFetched.value = true
    }
  } catch (err: any) {
    console.error('Error fetching nodes:', err)
    fetchError.value = t('failedLoadNodes')
  } finally {
    if (!silent) loading.value = false
  }
}

// Watchers for reactive search and pagination
watch(page, () => {
  fetchNodes()
})

watch(onlineOnly, (newVal) => {
  if (process.client) {
    localStorage.setItem('onlineOnly', String(newVal))
  }
  page.value = 1
  fetchNodes()
})

watchDebounced(search, () => {
  page.value = 1
  fetchNodes()
}, { debounce: 400 })

// Setup and auto-refresh intervals
onMounted(() => {
  const saved = localStorage.getItem('onlineOnly')
  if (saved !== null) {
    onlineOnly.value = saved === 'true'
  }
  
  // Only trigger initial fetch here if it didn't trigger via the watcher (which only fires if onlineOnly changes from false to true)
  if (!onlineOnly.value) {
    fetchNodes()
  }
  
  // Refresh data silently every 10 seconds
  refreshInterval = setInterval(() => {
    if (!scanningLocation.value) {
      fetchNodes(true)
    }
  }, 10000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// Format date wrapper for index
const formatDashboardDate = (dateString: string | null) => {
  return formatTelemetryDate(dateString, t, 'N/A')
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 flex flex-col gap-8 max-w-6xl">
    
    <!-- Geolocation Scanning Overlay UI -->
    <Transition name="fade">
      <div v-if="scanningLocation" class="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-6">
        <div class="relative flex items-center justify-center w-24 h-24">
          <div class="absolute inset-0 rounded-full border border-blue-500/30 animate-ping opacity-60"></div>
          <div class="absolute -inset-4 rounded-full border border-blue-500/10 animate-pulse"></div>
          <div class="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/50 flex items-center justify-center">
            <Compass class="w-8 h-8 text-blue-500 animate-spin" style="animation-duration: 4s;" />
          </div>
        </div>
        <div class="text-center flex flex-col gap-2">
          <h3 class="text-lg font-bold tracking-widest text-foreground font-heading">{{ t('radarActive') }}</h3>
          <p class="text-xs text-muted-foreground font-sans max-w-xs mx-auto animate-pulse">{{ locationStatus }}</p>
        </div>
        <button 
          @click="scanningLocation = false" 
          class="mt-4 px-4 py-1.5 text-xs font-sans border border-border/60 rounded-md hover:bg-muted/80 hover:text-foreground transition-all"
        >
          {{ t('cancelScan') }}
        </button>
      </div>
    </Transition>
 
    <!-- Welcome & Hero Section + Integrated Search Bar -->
    <div class="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-b from-blue-500/5 to-transparent p-6 md:p-8 glass-panel flex flex-col gap-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div class="space-y-2">
          <h1 class="text-2xl md:text-3xl font-black tracking-tight font-heading text-foreground flex flex-wrap items-center gap-x-2">
            <span class="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent uppercase tracking-wider font-extrabold">Sentinel</span>
            <span class="text-foreground/90 font-light tracking-wide">{{ t('heroTitle').replace('Sentinel ', '') }}</span>
          </h1>
          <p class="text-sm text-muted-foreground max-w-xl">
            {{ t('heroDesc') }}
          </p>
        </div>
 
        <div class="shrink-0 w-full sm:w-auto">
          <button 
            @click="detectAndRedirectNearestNode"
            class="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold text-xs transition-all duration-300 active:scale-95 tracking-wider uppercase group cursor-pointer"
          >
            <Compass class="w-4 h-4 transition-transform duration-500 group-hover:rotate-[360deg]" />
            <span>{{ t('nearestNode') }}</span>
          </button>
        </div>
      </div>

      <!-- Cybernetic Connector Line -->
      <div class="h-px w-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>

      <!-- Integrated Command Center Search Command Input + Online Filter -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
        <div class="relative flex-grow flex items-center">
          <input 
            v-model="search"
            type="text" 
            :placeholder="t('searchPlaceholder')" 
            class="w-full pl-11 pr-4 py-3 rounded-md border border-border/50 bg-background/50 focus:bg-background focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all placeholder:text-muted-foreground/60 font-sans"
          />
          <Search class="absolute left-3.5 w-5 h-5 text-muted-foreground pointer-events-none z-10" />
        </div>
        
        <button 
          @click="onlineOnly = !onlineOnly"
          :class="[
            'px-4 py-2.5 rounded-md border text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 select-none cursor-pointer h-[46px] min-w-[140px] sm:w-auto focus:outline-none',
            onlineOnly 
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]' 
              : 'border-border/60 bg-background/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          ]"
        >
          <span :class="['w-2 h-2 rounded-full transition-all duration-300', onlineOnly ? 'bg-emerald-500 pulse-glow-dot' : 'bg-muted-foreground/45']"></span>
          <span>{{ t('filterOnlineOnly') }}</span>
        </button>
      </div>
    </div>
    <!-- Error state -->
    <div v-if="fetchError" class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex gap-3 items-start">
      <AlertCircle class="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-bold">{{ t('failedFetch') }}</p>
        <p class="text-xs mt-1 text-rose-500/80">{{ fetchError }}</p>
      </div>
    </div>

    <!-- Telemetry Cards Grid -->
    <div v-else-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="i in 6" :key="i" class="h-64 rounded-xl border border-border/40 glass-panel p-6 flex flex-col gap-4 animate-pulse">
        <div class="flex justify-between items-center">
          <div class="h-4 w-1/2 bg-muted rounded"></div>
          <div class="h-4 w-16 bg-muted rounded-full"></div>
        </div>
        <div class="h-3 w-1/3 bg-muted rounded"></div>
        <div class="grid grid-cols-2 gap-4 my-2">
          <div class="h-16 bg-muted/50 rounded-lg"></div>
          <div class="h-16 bg-muted/50 rounded-lg"></div>
        </div>
        <div class="h-8 bg-muted rounded-lg mt-auto"></div>
      </div>
    </div>

    <div v-else-if="hasFetched && nodes.length === 0" class="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-border/60 rounded-xl bg-muted/5">
      <Activity class="w-12 h-12 text-muted-foreground/40 mb-4 animate-pulse" />
      <p class="text-base font-bold text-foreground">{{ t('noNodesFound') }}</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-xs text-center font-sans">
        {{ t('searchNoMatch', { search: search }) }}
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- The entire card is wrapped in a NuxtLink to make it completely clickable and intuitive -->
      <NuxtLink 
        v-for="node in nodes" 
        :key="node.id" 
        :to="`/node/${node.id}`"
        :class="[
          'group relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden cursor-pointer glass-panel',
          node.telemetry.status === 'online'
            ? 'border-border/60 hover:border-blue-500/40 dark:hover:border-indigo-500/40 bg-muted/20 hover:bg-muted/30'
            : 'border-rose-500/30 hover:border-rose-500/50 bg-rose-500/[0.02] hover:bg-rose-500/[0.04]'
        ]"
      >
        <!-- Card Body -->
        <div class="p-5 flex-grow flex flex-col gap-4">
          <div class="flex justify-between items-start gap-3">
            <div>
              <h3 
                :class="[
                  'font-bold text-base text-foreground mt-0.5 line-clamp-1 transition-colors',
                  node.telemetry.status === 'online'
                    ? 'group-hover:text-blue-500 dark:group-hover:text-indigo-400'
                    : 'group-hover:text-rose-500'
                ]"
              >
                {{ node.name }}
              </h3>
            </div>
            
            <!-- Pulse dot & Status badge -->
            <span 
              :class="[
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-sans border tracking-wider',
                node.telemetry.status === 'online'
                  ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
              ]"
            >
              <span 
                v-if="node.telemetry.status === 'online'" 
                class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-glow-dot text-emerald-400"
              ></span>
              <span v-else class="w-1.5 h-1.5 rounded-full bg-rose-500/60"></span>
              {{ node.telemetry.status === 'online' ? 'Online' : 'Offline' }}
            </span>
          </div>

          <!-- Location coords -->
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
            <MapPin class="w-3.5 h-3.5 shrink-0" />
            <span class="line-clamp-1">{{ node.location }}</span>
          </div>

          <!-- Dual Telemetry Gauges -->
          <div class="grid grid-cols-2 gap-4 mt-2">
            <!-- TDS Box -->
            <div class="bg-muted/30 dark:bg-muted/10 border border-border/10 rounded-lg p-3 flex flex-col justify-between">
              <span class="text-[9px] font-bold font-sans text-muted-foreground tracking-wider flex items-center gap-1 uppercase">
                <Droplet class="w-3 h-3 text-indigo-500" /> {{ t('tdsTitle') }}
              </span>
              <div class="my-1.5 flex items-baseline gap-1">
                <span 
                  :class="[
                    'text-xl font-black tracking-tight font-mono transition-colors duration-300',
                    getTdsValColor(node.telemetry.tds)
                  ]"
                >
                  {{ node.telemetry.tds !== null ? node.telemetry.tds : '---' }}
                </span>
                <span class="text-[10px] text-muted-foreground font-sans">ppm</span>
              </div>
            </div>

            <!-- Temperature Box -->
            <div class="bg-muted/30 dark:bg-muted/10 border border-border/10 rounded-lg p-3 flex flex-col justify-between">
              <span class="text-[9px] font-bold font-sans text-muted-foreground tracking-wider flex items-center gap-1 uppercase">
                <Thermometer class="w-3 h-3 text-cyan-500" /> {{ t('tempTitle') }}
              </span>
              <div class="my-1.5 flex items-baseline gap-1">
                <span 
                  :class="[
                    'text-xl font-black tracking-tight font-mono transition-colors duration-300',
                    getTempValColor(node.telemetry.temperature)
                  ]"
                >
                  {{ node.telemetry.temperature !== null ? node.telemetry.temperature : '---' }}
                </span>
                <span class="text-[10px] text-muted-foreground font-sans">&deg;C</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Card detail trigger -->
        <div class="border-t border-border/40 py-3 px-5 flex items-center justify-between text-xs font-sans bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all">
          <div class="flex items-center gap-1.5">
            <Clock class="w-3.5 h-3.5 text-muted-foreground/80" />
            <span>{{ t('updated') }} <span class="font-mono">{{ formatDashboardDate(node.telemetry.time) }}</span></span>
          </div>
          <div 
            :class="[
              'flex items-center gap-0.5 group-hover:translate-x-1 transition-transform',
              node.telemetry.status === 'online'
                ? 'text-blue-500'
                : 'text-rose-500'
            ]"
          >
            <span>{{ t('detail') }}</span>
            <ChevronRight class="w-4 h-4" />
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Pagination Controls -->
    <div v-if="totalPages > 1" class="flex flex-col sm:flex-row items-center justify-between border-t border-border/40 pt-6 mt-4 gap-4">
      <p class="text-xs text-muted-foreground font-sans text-center sm:text-left">
        <span v-html="t('showingNodes', {
          start: `<span class='text-foreground font-bold font-mono'>${(page - 1) * limit + 1}</span>`,
          end: `<span class='text-foreground font-bold font-mono'>${Math.min(page * limit, totalNodes)}</span>`,
          total: `<span class='text-foreground font-bold font-mono'>${totalNodes}</span>`
        })"></span>
      </p>

      <div class="flex items-center gap-2 w-full sm:w-auto justify-center">
        <button 
          @click="page = Math.max(1, page - 1)" 
          :disabled="page === 1"
          class="flex items-center justify-center w-8 h-8 rounded-md border border-border/60 hover:bg-muted/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <span class="text-xs font-mono px-3 whitespace-nowrap">{{ page }}/{{ totalPages }}</span>
        <button 
          @click="page = Math.min(totalPages, page + 1)" 
          :disabled="page === totalPages"
          class="flex items-center justify-center w-8 h-8 rounded-md border border-border/60 hover:bg-muted/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
