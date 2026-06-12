import { ref, computed } from 'vue'

export function useTelemetryChart(history: any) {
  // Series visibility state
  const showTdsSeries = ref(true)
  const showTempSeries = ref(true)

  // Interactive chart index state
  const hoveredIndex = ref<number | null>(null)

  // Custom SVG Chart Calculation logic
  const chartData = computed(() => {
    const historyValue = history.value || []
    if (historyValue.length < 2) return null
    
    // Chronological order left-to-right
    const data = [...historyValue].reverse()
    
    const minX = 40
    const maxX = 485
    const minY = 25
    const maxY = 175
    
    // Calculate bounds for TDS
    const tdsValues = data.map(d => d.tds || 0)
    const minTds = Math.min(...tdsValues, 0)
    const maxTds = Math.max(...tdsValues, 100) * 1.1 
    
    // Calculate bounds for Temp
    const tempValues = data.map(d => d.temperature || 0)
    const minTemp = Math.max(0, Math.min(...tempValues) - 2)
    const maxTemp = Math.max(...tempValues) + 2
    
    // Map points to SVG coordinates
    const pointsTds = data.map((d, index) => {
      const x = minX + (index / (data.length - 1)) * (maxX - minX)
      const y = maxY - (((d.tds || 0) - minTds) / (maxTds - minTds || 1)) * (maxY - minY)
      return { x, y, raw: d }
    })
    
    const pointsTemp = data.map((d, index) => {
      const x = minX + (index / (data.length - 1)) * (maxX - minX)
      const y = maxY - (((d.temperature || 0) - minTemp) / (maxTemp - minTemp || 1)) * (maxY - minY)
      return { x, y, raw: d }
    })
    
    const dPathTds = pointsTds.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')
    const dPathTemp = pointsTemp.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')
    
    const lastTdsPoint = pointsTds[pointsTds.length - 1]
    const firstTdsPoint = pointsTds[0]
    const lastTempPoint = pointsTemp[pointsTemp.length - 1]
    const firstTempPoint = pointsTemp[0]
    
    if (!lastTdsPoint || !firstTdsPoint || !lastTempPoint || !firstTempPoint) return null
    
    const dAreaTds = `${dPathTds} L ${lastTdsPoint.x} ${maxY} L ${firstTdsPoint.x} ${maxY} Z`
    const dAreaTemp = `${dPathTemp} L ${lastTempPoint.x} ${maxY} L ${firstTempPoint.x} ${maxY} Z`
    
    return {
      pointsTds,
      pointsTemp,
      dPathTds,
      dPathTemp,
      dAreaTds,
      dAreaTemp,
      minTds,
      maxTds,
      minTemp,
      maxTemp,
      maxY
    }
  })

  // Compute statistics for TDS and Temperature from history
  const stats = computed(() => {
    const historyValue = history.value || []
    if (historyValue.length === 0) return null
    
    const tdsVals = historyValue.map((h: any) => h.tds).filter((v: any): v is number => v !== null)
    const tempVals = historyValue.map((h: any) => h.temperature).filter((v: any): v is number => v !== null)
    
    const calculateStats = (vals: number[]) => {
      if (vals.length === 0) return { min: 0, max: 0, mean: 0, stdDev: 0 }
      
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      
      const sum = vals.reduce((a, b) => a + b, 0)
      const mean = sum / vals.length
      
      const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length
      const stdDev = Math.sqrt(variance)
      
      return { min, max, mean, stdDev }
    }
    
    return {
      tds: calculateStats(tdsVals),
      temp: calculateStats(tempVals)
    }
  })

  // Hovered points for type safety in template
  const hoveredTdsPoint = computed(() => {
    if (hoveredIndex.value === null || !chartData.value) return null
    return chartData.value.pointsTds[hoveredIndex.value] || null
  })

  const hoveredTempPoint = computed(() => {
    if (hoveredIndex.value === null || !chartData.value) return null
    return chartData.value.pointsTemp[hoveredIndex.value] || null
  })

  // Handle mouse and touch events
  const handleMouseMove = (event: any) => {
    if (!chartData.value) return
    const svg = event.currentTarget || event.target.closest('svg')
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    
    let clientX = event.clientX
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
    }
    
    if (clientX === undefined) return
    const mouseX = clientX - rect.left
    
    // Calculate relative X coordinate inside viewBox (0 to 500)
    const viewBoxWidth = 500
    const scaleX = viewBoxWidth / rect.width
    const xInViewBox = mouseX * scaleX
    
    const points = chartData.value.pointsTds
    if (!points || points.length === 0) return
    
    let closestIndex = 0
    let minDiff = Infinity
    
    points.forEach((p, index) => {
      const diff = Math.abs(p.x - xInViewBox)
      if (diff < minDiff) {
        minDiff = diff
        closestIndex = index
      }
    })
    
    hoveredIndex.value = closestIndex
  }

  const handleMouseLeave = () => {
    hoveredIndex.value = null
  }

  return {
    showTdsSeries,
    showTempSeries,
    hoveredIndex,
    chartData,
    stats,
    hoveredTdsPoint,
    hoveredTempPoint,
    handleMouseMove,
    handleMouseLeave
  }
}
