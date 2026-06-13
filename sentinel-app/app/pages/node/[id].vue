<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useColorMode } from '@vueuse/core'
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Droplet, 
  Thermometer, 
  TrendingUp, 
  AlertTriangle,
  Compass,
  Map,
  Navigation
} from '@lucide/vue'
import { 
  getTdsClass as getTdsClassUtil, 
  getTempClass as getTempClassUtil, 
  getTdsGaugeColor, 
  getTempGaugeColor 
} from '~/utils/telemetry'
import { formatTelemetryDate } from '~/utils/date'
import { useTelemetryChart } from '~/composables/useTelemetryChart'

const route = useRoute()
const router = useRouter()
const nodeId = route.params.id as string

const { lang, t } = useI18n()
const colorMode = useColorMode()

const node = ref<any>(null)
const history = ref<any[]>([])
const loading = ref(true)
const fetchError = ref('')
let refreshInterval: any = null

// SVG Chart integration
const {
  showTdsSeries,
  showTempSeries,
  hoveredIndex,
  chartData,
  stats,
  hoveredTdsPoint,
  hoveredTempPoint,
  handleMouseMove,
  handleMouseLeave
} = useTelemetryChart(history)

// Load Leaflet dynamically via CDN & Set Dynamic Title
useHead({
  title: () => node.value ? `${node.value.name} - Sentinel` : 'Sentinel',
  link: [
    {
      rel: 'stylesheet',
      href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      crossorigin: ''
    }
  ],
  script: [
    {
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      crossorigin: '',
      tagPosition: 'bodyClose'
    }
  ]
})

let leafletMap: any = null
let marker: any = null

const initMap = () => {
  if (!process.client) return
  if (!node.value) return

  const L = (window as any).L
  if (!L) {
    setTimeout(initMap, 100)
    return
  }

  const container = document.getElementById('leaflet-map')
  if (!container) return

  const lat = node.value.latitude
  const lon = node.value.longitude

  const isOnline = node.value?.telemetry?.status === 'online'
  const ringColor = isOnline ? 'border-emerald-500/60' : 'border-rose-500/60'
  const glowColor = isOnline ? 'bg-emerald-500' : 'bg-rose-500'
  const coreColor = isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'

  const customHtml = `
    <div class="relative flex items-center justify-center w-10 h-10">
      <!-- Outer tech-ring outline with slow breathing pulse -->
      <div class="absolute w-8 h-8 rounded-full border border-dashed ${ringColor} marker-pulse"></div>
      
      <!-- Glowing active aura -->
      <div class="absolute w-6 h-6 rounded-full blur-[4px] opacity-40 ${glowColor}"></div>
      
      <!-- Outer solid ring casing -->
      <div class="absolute w-4.5 h-4.5 rounded-full border border-white/80 dark:border-background/80 bg-background/95 dark:bg-card/95 flex items-center justify-center shadow-lg">
        <!-- Glowing neon core dot -->
        <div class="w-2.5 h-2.5 rounded-full ${coreColor}"></div>
      </div>
    </div>
  `

  if (leafletMap) {
    if (marker) {
      marker.setLatLng([lat, lon])
      const customIcon = L.divIcon({
        className: 'futuristic-marker',
        html: customHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      })
      marker.setIcon(customIcon)
    }
    return
  }

  leafletMap = L.map(container, {
    zoomControl: false
  }).setView([lat, lon], 15)

  L.control.zoom({
    position: 'topright'
  }).addTo(leafletMap)

  const isDark = colorMode.value === 'dark'
  const tileUrl = isDark 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

  L.tileLayer(tileUrl, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(leafletMap)

  const customIcon = L.divIcon({
    className: 'futuristic-marker',
    html: customHtml,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  })

  marker = L.marker([lat, lon], { icon: customIcon }).addTo(leafletMap)

  // Invalidate size after map has rendered
  nextTick(() => {
    setTimeout(() => {
      if (leafletMap) {
        leafletMap.invalidateSize()
      }
    }, 200)
  })
}

// Watch theme change to update tile layer
watch(() => colorMode.value, () => {
  if (leafletMap) {
    leafletMap.remove()
    leafletMap = null
    nextTick(() => {
      initMap()
    })
  }
})

// Watch node to trigger map init
watch(() => node.value, (newNode) => {
  if (newNode) {
    nextTick(() => {
      initMap()
    })
  }
}, { deep: true })

// Fetch node details and telemetry history
const fetchNodeDetails = async (silent = false) => {
  if (!silent) loading.value = true
  fetchError.value = ''
  try {
    const data = await $fetch(`/api/nodes/${nodeId}`)
    if (data && typeof data === 'object') {
      node.value = (data as any).node
      history.value = (data as any).history
    }
  } catch (err: any) {
    console.error('Error fetching node details:', err)
    fetchError.value = t('failedLoadNodeDetails')
  } finally {
    if (!silent) loading.value = false
  }
}

onMounted(() => {
  fetchNodeDetails()
  
  // Refresh data silently every 10 seconds
  refreshInterval = setInterval(() => {
    fetchNodeDetails(true)
  }, 10000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  if (leafletMap) {
    leafletMap.remove()
    leafletMap = null
  }
})

// Local helpers delegates
const formatDate = (dateString: string | null) => {
  return formatTelemetryDate(dateString, t, t('tempUnknown'))
}

const getTdsClass = (tds: number | null) => {
  return getTdsClassUtil(tds, t)
}

const getTempClass = (temp: number | null) => {
  return getTempClassUtil(temp, t)
}

// Circular gauge percent helpers
const tdsGaugePercent = computed(() => {
  if (!node.value?.telemetry?.tds) return 0
  return Math.min(100, (node.value.telemetry.tds / 750) * 100)
})

const tempGaugePercent = computed(() => {
  if (!node.value?.telemetry?.temperature) return 0
  return Math.min(100, (node.value.telemetry.temperature / 50) * 100)
})
</script>

<template>
  <div class="container mx-auto px-4 py-8 flex flex-col gap-8 max-w-5xl">
    
    <!-- Top Nav Action Bar (Only Back Link remains) -->
    <div class="flex items-center justify-between">
      <button 
        @click="router.push('/')" 
        class="flex items-center gap-2 px-3.5 py-1.5 rounded-md border border-border/60 hover:bg-muted text-xs font-bold uppercase tracking-wider transition-all glass-panel cursor-pointer shadow-sm active:scale-95"
      >
        <ArrowLeft class="w-4 h-4 text-blue-500" />
        <span>{{ t('backToDashboard') }}</span>
      </button>
    </div>

    <!-- Error State -->
    <div v-if="fetchError" class="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex gap-3 items-start">
      <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p class="font-bold">{{ t('failedFetch') }}</p>
        <p class="text-xs mt-1 text-rose-500/80">{{ fetchError }}</p>
        <button 
          @click="router.push('/')" 
          class="mt-4 px-4 py-1.5 rounded-md bg-rose-500/20 border border-rose-500/30 font-bold hover:bg-rose-500/30 transition-all text-xs cursor-pointer uppercase tracking-wider active:scale-95"
        >
          {{ t('backToDashboard') }}
        </button>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-else-if="loading" class="flex flex-col gap-8 animate-pulse">
      <div class="h-28 bg-muted/40 rounded-xl border border-border/40 p-6"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="h-80 bg-muted/40 rounded-xl border border-border/40"></div>
        <div class="h-80 bg-muted/40 rounded-xl border border-border/40"></div>
      </div>
      <div class="h-72 bg-muted/40 rounded-xl border border-border/40"></div>
    </div>

    <!-- Main Detail Content -->
    <div v-else-if="node" class="flex flex-col gap-8">
      
      <!-- Node Header Panel -->
      <div 
        :class="[
          'glass-panel border rounded-xl p-6 relative overflow-hidden',
          node.telemetry.status === 'online'
            ? 'border-border/60'
            : 'border-rose-500/30 bg-rose-500/[0.02]'
        ]"
      >
        <div 
          :class="[
            'absolute right-0 top-0 h-full w-1/3 pointer-events-none',
            node.telemetry.status === 'online'
              ? 'bg-gradient-to-l from-blue-500/5 to-transparent'
              : 'bg-gradient-to-l from-rose-500/5 to-transparent'
          ]"
        ></div>
        
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 z-10 relative">
          <div class="space-y-2 min-w-0 flex-1">
            <div class="flex items-center gap-3">
              <span 
                :class="[
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-sans border tracking-wider',
                  node.telemetry.status === 'online'
                    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
                ]"
              >
                <span v-if="node.telemetry.status === 'online'" class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-glow-dot"></span>
                <span v-else class="w-1.5 h-1.5 rounded-full bg-rose-500/60"></span>
                {{ node.telemetry.status === 'online' ? 'Online' : 'Offline' }}
              </span>
            </div>
            <h2 class="text-2xl font-bold tracking-tight text-foreground font-heading truncate" :title="node.name">{{ node.name }}</h2>
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground font-sans">
              <MapPin 
                :class="[
                  'w-4 h-4 shrink-0',
                  node.telemetry.status === 'online' ? 'text-blue-500' : 'text-rose-500'
                ]"
              />
              <span class="truncate" :title="node.location">{{ node.location }}</span>
            </div>
          </div>

          <div class="text-xs text-muted-foreground font-sans">
            {{ t('updated') }} <span class="font-mono">{{ formatDate(node.telemetry.time) }}</span>
          </div>
        </div>
      </div>

      <!-- Gauges & Telemetry Panels Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <!-- TDS Sensor Gauge Card -->
        <div class="glass-panel border border-border/60 rounded-xl p-6 flex flex-col gap-6 transition-colors">
          <div class="flex justify-between items-center border-b border-border/40 pb-3">
            <h3 class="font-bold text-sm font-sans tracking-wider text-indigo-500 flex items-center gap-2.5">
              <div class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Droplet class="w-4 h-4" />
              </div>
              <span>{{ t('tdsTitle') }}</span>
            </h3>
            <span 
              :class="[
                'text-xs font-sans font-bold px-2 py-0.5 rounded border',
                (node.telemetry.status === 'online' && (node.telemetry.sensorStatus?.tds ?? (node.telemetry.tds !== null)))
                  ? 'text-emerald-500 bg-emerald-500/5 border-emerald-500/10'
                  : 'text-rose-500 bg-rose-500/5 border-rose-500/10'
              ]"
            >
              {{ (node.telemetry.status === 'online' && (node.telemetry.sensorStatus?.tds ?? (node.telemetry.tds !== null))) ? t('connected') : t('disconnected') }}
            </span>
          </div>

          <!-- Circular gauge render -->
          <div class="flex flex-col items-center justify-center py-4 relative">
            <svg class="w-36 h-36" viewBox="0 0 100 100">
              <circle class="text-muted/30 stroke-current" stroke-width="8" fill="transparent" r="40" cx="50" cy="50" />
              <circle 
                class="stroke-current transition-all duration-1000 ease-out" 
                :class="getTdsGaugeColor(node.telemetry.tds)"
                stroke-width="8" 
                stroke-linecap="round" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
                stroke-dasharray="251.2"
                :stroke-dashoffset="251.2 - (251.2 * tdsGaugePercent) / 100"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div class="absolute flex flex-col items-center justify-center">
              <span class="text-3xl font-bold font-mono tracking-tighter">
                {{ node.telemetry.tds !== null ? node.telemetry.tds : '---' }}
              </span>
              <span class="text-[10px] text-muted-foreground font-sans -mt-1">ppm</span>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div :class="['border rounded-xl p-3.5 flex flex-col gap-1', getTdsClass(node.telemetry.tds).color]">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold font-sans tracking-wider">{{ t('waterSuitability') }} {{ getTdsClass(node.telemetry.tds).label }}</span>
              </div>
              <p class="text-xs opacity-80">{{ getTdsClass(node.telemetry.tds).desc }}</p>
            </div>
            <span class="text-[10px] text-muted-foreground/80 font-sans px-1">
              {{ t('referencePermenkes') }}
            </span>
          </div>
        </div>

        <!-- Temperature Sensor Card -->
        <div class="glass-panel border border-border/60 rounded-xl p-6 flex flex-col gap-6 transition-colors">
          <div class="flex justify-between items-center border-b border-border/40 pb-3">
            <h3 class="font-bold text-sm font-sans tracking-wider text-cyan-500 flex items-center gap-2.5">
              <div class="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
                <Thermometer class="w-4 h-4" />
              </div>
              <span>{{ t('tempTitle') }}</span>
            </h3>
            <span 
              :class="[
                'text-xs font-sans font-bold px-2 py-0.5 rounded border',
                (node.telemetry.status === 'online' && (node.telemetry.sensorStatus?.temp ?? (node.telemetry.temperature !== null)))
                  ? 'text-emerald-500 bg-emerald-500/5 border-emerald-500/10'
                  : 'text-rose-500 bg-rose-500/5 border-rose-500/10'
              ]"
            >
              {{ (node.telemetry.status === 'online' && (node.telemetry.sensorStatus?.temp ?? (node.telemetry.temperature !== null))) ? t('connected') : t('disconnected') }}
            </span>
          </div>

          <!-- Circular gauge render -->
          <div class="flex flex-col items-center justify-center py-4 relative">
            <svg class="w-36 h-36" viewBox="0 0 100 100">
              <circle class="text-muted/30 stroke-current" stroke-width="8" fill="transparent" r="40" cx="50" cy="50" />
              <circle 
                class="stroke-current transition-all duration-1000 ease-out" 
                :class="getTempGaugeColor(node.telemetry.temperature)"
                stroke-width="8" 
                stroke-linecap="round" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
                stroke-dasharray="251.2"
                :stroke-dashoffset="251.2 - (251.2 * tempGaugePercent) / 100"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div class="absolute flex flex-col items-center justify-center">
              <span class="text-3xl font-bold font-mono tracking-tighter">
                {{ node.telemetry.temperature !== null ? node.telemetry.temperature : '---' }}
              </span>
              <span class="text-[10px] text-muted-foreground font-sans -mt-1">&deg;C</span>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div :class="['border rounded-xl p-3.5 flex flex-col gap-1', getTempClass(node.telemetry.temperature).color]">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold font-sans tracking-wider">{{ t('tempCondition') }} {{ getTempClass(node.telemetry.temperature).label }}</span>
              </div>
              <p class="text-xs opacity-80">{{ getTempClass(node.telemetry.temperature).desc }}</p>
            </div>
            <span class="text-[10px] text-muted-foreground/80 font-sans px-1">
              {{ t('referencePermenkesPp') }}
            </span>
          </div>
        </div>

      </div>

      <!-- Trend Chart Section (Historical Telemetry Log) -->
      <div class="glass-panel border border-border/60 rounded-xl p-5 flex flex-col gap-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
              <TrendingUp class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-extrabold text-base text-foreground font-heading">{{ t('telemetryTrends') }}</h3>
              <p class="text-xs text-muted-foreground font-sans">{{ t('last60Mins') }}</p>
            </div>
          </div>
          
          <!-- Chart legend (Interactive Toggles) -->
          <div class="flex flex-wrap items-center gap-4 text-xs font-sans">
            <button 
              @click="showTdsSeries = !showTdsSeries"
              :class="[
                'flex items-center gap-2 px-2.5 py-1 rounded-lg border cursor-pointer select-none transition-all duration-200',
                showTdsSeries 
                  ? 'bg-indigo-500/5 border-indigo-500/20 text-foreground font-semibold shadow-sm hover:bg-indigo-500/10' 
                  : 'bg-muted/30 border-transparent text-muted-foreground line-through opacity-50 hover:opacity-75'
              ]"
            >
              <span :class="['w-2.5 h-2.5 rounded transition-all duration-200', showTdsSeries ? 'bg-indigo-500' : 'bg-muted-foreground/40']"></span>
              <span>TDS (ppm)</span>
            </button>
            <button 
              @click="showTempSeries = !showTempSeries"
              :class="[
                'flex items-center gap-2 px-2.5 py-1 rounded-lg border cursor-pointer select-none transition-all duration-200',
                showTempSeries 
                  ? 'bg-cyan-500/5 border-cyan-500/20 text-foreground font-semibold shadow-sm hover:bg-cyan-500/10' 
                  : 'bg-muted/30 border-transparent text-muted-foreground line-through opacity-50 hover:opacity-75'
              ]"
            >
              <span :class="['w-2.5 h-2.5 rounded transition-all duration-200', showTempSeries ? 'bg-cyan-500' : 'bg-muted-foreground/40']"></span>
              <span>{{ t('tempLabel') }} (&deg;C)</span>
            </button>
          </div>
        </div>

        <!-- Line Chart using raw SVG -->
        <div v-if="chartData" class="w-full flex flex-col gap-4">
          <div class="relative w-full h-56 bg-muted/10 dark:bg-muted/5 border border-border/10 rounded-xl p-2.5">
            
            <!-- Grid Lines and Y-Axis Labels -->
            <div class="absolute inset-0 pointer-events-none z-0 px-2.5 py-2.5">
              <div class="relative w-full h-full">
                <!-- Top Grid Line & Labels -->
                <div class="absolute w-full border-t border-border/25 flex justify-between text-[9px] font-mono font-bold" style="top: 12.5%;">
                  <span :class="['transition-opacity duration-200', showTdsSeries ? 'text-indigo-500/90' : 'opacity-0']">{{ chartData.maxTds.toFixed(0) }} ppm</span>
                  <span :class="['transition-opacity duration-200', showTempSeries ? 'text-cyan-500/90' : 'opacity-0']">{{ chartData.maxTemp.toFixed(1) }}&deg;C</span>
                </div>

                <!-- Mid Grid Lines -->
                <div class="absolute w-full border-t border-border/10" style="top: 37.5%;"></div>
                <div class="absolute w-full border-t border-border/10" style="top: 62.5%;"></div>

                <!-- Bottom Grid Line & Labels -->
                <div class="absolute w-full border-t border-border/25 flex justify-between text-[9px] font-mono font-bold" style="top: 87.5%;">
                  <span :class="['transition-opacity duration-200', showTdsSeries ? 'text-indigo-500/90' : 'opacity-0']">{{ chartData.minTds.toFixed(0) }} ppm</span>
                  <span :class="['transition-opacity duration-200', showTempSeries ? 'text-cyan-500/90' : 'opacity-0']">{{ chartData.minTemp.toFixed(1) }}&deg;C</span>
                </div>
              </div>
            </div>

            <!-- SVG Render -->
            <svg 
              class="w-full h-full relative z-10 cursor-crosshair select-none" 
              viewBox="0 0 500 200" 
              preserveAspectRatio="none"
              @mousemove="handleMouseMove"
              @mouseleave="handleMouseLeave"
              @touchstart="handleMouseMove"
              @touchmove.prevent="handleMouseMove"
            >
              <defs>
                <linearGradient id="areaGradientTds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#6366f1" stop-opacity="0.2"/>
                  <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0"/>
                </linearGradient>
                <linearGradient id="areaGradientTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.15"/>
                  <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.0"/>
                </linearGradient>
              </defs>

              <line x1="40" y1="25" x2="40" y2="175" stroke="currentColor" class="text-border/30" stroke-width="1" />
              <line x1="40" y1="175" x2="485" y2="175" stroke="currentColor" class="text-border/30" stroke-width="1" />

              <!-- TDS Area and Line -->
              <path v-if="showTdsSeries" :d="chartData.dAreaTds" fill="url(#areaGradientTds)" />
              <path v-if="showTdsSeries" :d="chartData.dPathTds" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" />

              <!-- Temp Area and Line -->
              <path v-if="showTempSeries" :d="chartData.dAreaTemp" fill="url(#areaGradientTemp)" />
              <path v-if="showTempSeries" :d="chartData.dPathTemp" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="3,3" stroke-linecap="round" />

              <!-- Interactive Crosshair (Lines only inside SVG, dots rendered as HTML overlays to prevent ovals) -->
              <g v-if="hoveredIndex !== null && hoveredTdsPoint && hoveredTempPoint && (showTdsSeries || showTempSeries)">
                <!-- Vertical dashed line -->
                <line 
                  :x1="hoveredTdsPoint.x" 
                  y1="25" 
                  :x2="hoveredTdsPoint.x" 
                  y2="175" 
                  stroke="currentColor" 
                  class="text-muted-foreground/30" 
                  stroke-width="1" 
                  stroke-dasharray="3,3" 
                />

                <!-- TDS Horizontal dashed line -->
                <line 
                  v-if="showTdsSeries"
                  x1="40" 
                  :y1="hoveredTdsPoint.y" 
                  :x2="hoveredTdsPoint.x" 
                  :y2="hoveredTdsPoint.y" 
                  stroke="#6366f1" 
                  stroke-opacity="0.4"
                  stroke-width="1" 
                  stroke-dasharray="2,2" 
                />

                <!-- Temp Horizontal dashed line -->
                <line 
                  v-if="showTempSeries"
                  :x1="hoveredTempPoint.x" 
                  :y1="hoveredTempPoint.y" 
                  x2="485" 
                  :y2="hoveredTempPoint.y" 
                  stroke="#06b6d4" 
                  stroke-opacity="0.4"
                  stroke-width="1" 
                  stroke-dasharray="2,2" 
                />
              </g>

              <!-- Data Dots for TDS (rendered only when crosshair is inactive and series is active) -->
              <g v-else-if="showTdsSeries">
                <circle 
                  v-for="p in chartData.pointsTds" 
                  :key="p.x" 
                  :cx="p.x" 
                  :cy="p.y" 
                  r="2" 
                  fill="#6366f1" 
                  class="hover:fill-indigo-400 cursor-pointer transition-all"
                >
                  <title>TDS: {{ p.raw.tds }} ppm pada {{ formatDate(p.raw.time) }}</title>
                </circle>
              </g>
            </svg>

            <!-- HTML Highlight Dots (layered on top of SVG inside the padded area to prevent stretched ovals) -->
            <div v-if="hoveredIndex !== null && hoveredTdsPoint && hoveredTempPoint && (showTdsSeries || showTempSeries)" class="absolute inset-0 pointer-events-none z-20 px-2.5 py-2.5">
              <div class="relative w-full h-full">
                <!-- TDS Highlight Dot -->
                <div 
                  v-if="showTdsSeries"
                  class="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                  :style="{
                    left: `${(hoveredTdsPoint.x / 500) * 100}%`,
                    top: `${(hoveredTdsPoint.y / 200) * 100}%`
                  }"
                >
                  <div class="w-6 h-6 rounded-full bg-indigo-500/25 absolute -left-1.5 -top-1.5 animate-pulse"></div>
                  <div class="w-3.5 h-3.5 rounded-full bg-indigo-500 border border-background shadow-md"></div>
                </div>

                <!-- Temperature Highlight Dot -->
                <div 
                  v-if="showTempSeries"
                  class="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                  :style="{
                    left: `${(hoveredTempPoint.x / 500) * 100}%`,
                    top: `${(hoveredTempPoint.y / 200) * 100}%`
                  }"
                >
                  <div class="w-6 h-6 rounded-full bg-cyan-500/25 absolute -left-1.5 -top-1.5 animate-pulse"></div>
                  <div class="w-3.5 h-3.5 rounded-full bg-cyan-500 border border-background shadow-md"></div>
                </div>
              </div>
            </div>

            <!-- Dynamic Floating Tooltip inside container -->
            <div 
              v-if="hoveredIndex !== null && hoveredTdsPoint && hoveredTempPoint && (showTdsSeries || showTempSeries)" 
              class="absolute top-3 z-50 pointer-events-none transition-all duration-150 ease-out"
              :style="{
                left: `${(hoveredTdsPoint.x / 500) * 100}%`,
                transform: hoveredTdsPoint.x > 250 ? 'translateX(-105%)' : 'translateX(5%)'
              }"
            >
              <div class="bg-background/95 dark:bg-card/95 backdrop-blur-md border border-border/80 rounded-xl p-3 shadow-xl flex flex-col gap-1.5 font-sans text-[11px] w-48 transition-all">
                <div class="text-[9px] text-muted-foreground flex items-center gap-1 font-bold">
                  <Clock class="w-3 h-3 text-indigo-500" />
                  <span class="font-mono">{{ formatDate(hoveredTdsPoint.raw.time) }}</span>
                </div>
                <div class="h-px bg-border/40 my-0.5"></div>
                <div v-if="showTdsSeries" class="flex items-center justify-between">
                  <span class="text-muted-foreground text-[10px]">{{ t('tdsTooltipLabel') }}</span>
                  <span class="font-extrabold font-mono text-indigo-500 text-sm">
                    {{ hoveredTdsPoint.raw.tds !== null ? hoveredTdsPoint.raw.tds : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">ppm</span>
                  </span>
                </div>
                <div v-if="showTempSeries" class="flex items-center justify-between">
                  <span class="text-muted-foreground text-[10px]">{{ t('tempTooltipLabel') }}</span>
                  <span class="font-extrabold font-mono text-cyan-500 text-sm">
                    {{ hoveredTempPoint.raw.temperature !== null ? hoveredTempPoint.raw.temperature : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">&deg;C</span>
                  </span>
                </div>
              </div>
            </div>
          </div>


          <!-- Statistics Grid -->
          <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2 pt-6 border-t border-border/40">
            <!-- TDS Stats Card -->
            <div class="glass-panel border border-border/40 rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:border-indigo-500/30">
              <!-- Background accent glow -->
              <div class="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-indigo-500/5 blur-xl pointer-events-none"></div>
              
              <div class="flex items-center gap-2 border-b border-border/40 pb-2.5">
                <div class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Droplet class="w-4 h-4" />
                </div>
                <span class="text-xs font-bold font-sans text-indigo-500 tracking-wider">
                  {{ t('tdsStats') }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-3 text-xs font-sans">
                <!-- Min -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('min') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.tds?.min !== undefined ? stats.tds.min.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">ppm</span>
                  </span>
                </div>
                <!-- Max -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('max') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.tds?.max !== undefined ? stats.tds.max.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">ppm</span>
                  </span>
                </div>
                <!-- Mean -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('mean') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.tds?.mean !== undefined ? stats.tds.mean.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">ppm</span>
                  </span>
                </div>
                <!-- Std Dev -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('stdDev') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    &plusmn;{{ stats?.tds?.stdDev !== undefined ? stats.tds.stdDev.toFixed(2) : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">ppm</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Temperature Stats Card -->
            <div class="glass-panel border border-border/40 rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:border-cyan-500/30">
              <!-- Background accent glow -->
              <div class="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-cyan-500/5 blur-xl pointer-events-none"></div>
              
              <div class="flex items-center gap-2 border-b border-border/40 pb-2.5">
                <div class="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Thermometer class="w-4 h-4" />
                </div>
                <span class="text-xs font-bold font-sans text-cyan-500 tracking-wider">
                  {{ t('tempStats') }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-3 text-xs font-sans">
                <!-- Min -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('min') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.temp?.min !== undefined ? stats.temp.min.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground">&deg;C</span>
                  </span>
                </div>
                <!-- Max -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('max') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.temp?.max !== undefined ? stats.temp.max.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground">&deg;C</span>
                  </span>
                </div>
                <!-- Mean -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('mean') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    {{ stats?.temp?.mean !== undefined ? stats.temp.mean.toFixed(1) : '---' }} <span class="text-[9px] font-normal text-muted-foreground">&deg;C</span>
                  </span>
                </div>
                <!-- Std Dev -->
                <div class="p-2.5 rounded-xl bg-muted/30 dark:bg-muted/10 border border-border/10 hover:bg-muted/40 transition-colors">
                  <span class="text-muted-foreground text-[9px] tracking-wider block mb-1">{{ t('stdDev') }}</span>
                  <span class="font-extrabold font-mono text-foreground text-sm tracking-tight">
                    &plusmn;{{ stats?.temp?.stdDev !== undefined ? stats.temp.stdDev.toFixed(2) : '---' }} <span class="text-[9px] font-normal text-muted-foreground font-sans">&deg;C</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-xs font-sans text-muted-foreground border border-dashed border-border/60 rounded-xl">
          {{ t('noHistoryData') }}
        </div>
      </div>

      <!-- Geographic Location Map Card (Free Leaflet Map) -->
      <div class="glass-panel border border-border/60 rounded-xl p-6 flex flex-col gap-6 transition-colors">
        <div class="flex justify-between items-center border-b border-border/40 pb-3">
          <h3 class="font-bold text-sm font-sans tracking-wider text-blue-500 flex items-center gap-2.5">
            <div class="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Map class="w-4 h-4" />
            </div>
            <span>{{ t('geoLocTitle') }}</span>
          </h3>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <!-- Leaflet Map Container -->
          <div class="relative w-full h-64 rounded-xl overflow-hidden border border-border/40 bg-muted/10 lg:col-span-2">
            <ClientOnly>
              <div id="leaflet-map" class="w-full h-full z-10"></div>
            </ClientOnly>
          </div>

          <!-- Metadata & Location info on the side -->
          <div class="flex flex-col justify-between gap-4 lg:col-span-1">
            <div class="flex flex-col gap-3">
              <!-- Location (formerly Physical Address) -->
              <div class="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 border border-border/40 p-3.5 rounded-lg font-sans text-xs text-muted-foreground">
                <MapPin class="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="font-bold text-foreground">{{ t('location') }}</span>
                  <span class="truncate" :title="node.location">{{ node.location }}</span>
                </div>
              </div>

              <!-- Coordinates -->
              <div class="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 border border-border/40 p-3.5 rounded-lg font-sans text-xs text-muted-foreground">
                <Navigation class="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                <div class="flex flex-col gap-1 w-full">
                  <span class="font-bold text-foreground">{{ t('coordinates') }}</span>
                  <span class="font-mono text-foreground font-semibold">{{ node.latitude.toFixed(6) }}&deg;, {{ node.longitude.toFixed(6) }}&deg;</span>
                  <div class="h-px bg-border/40 my-1"></div>
                  <a 
                    :href="`https://www.google.com/maps/dir/?api=1&destination=${node.latitude},${node.longitude}&travelmode=walking`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors uppercase tracking-wider group focus:outline-none"
                  >
                    <span>{{ t('navigate') }}</span>
                    <svg class="w-3 h-3 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>
              
              <!-- Reference System -->
              <div class="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 border border-border/40 p-3.5 rounded-lg font-sans text-xs text-muted-foreground">
                <Compass class="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                <div class="flex flex-col gap-1">
                  <span class="font-bold text-foreground">{{ t('refSystem') }}</span>
                  <span>WGS 84 / Web Mercator EPSG:3857</span>
                </div>
              </div>
            </div>

            <span class="text-[10px] text-muted-foreground/80 font-sans px-1 leading-normal">
              {{ t('mapDataSourced') }}
            </span>
          </div>
        </div>
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

:deep(.futuristic-marker) {
  background: transparent !important;
  border: none !important;
}

@keyframes pulse-slow {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.8;
  }
}

:deep(.marker-pulse) {
  animation: pulse-slow 3s infinite ease-in-out;
}
</style>
