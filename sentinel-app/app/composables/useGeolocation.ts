import { ref } from 'vue'

export function useGeolocation(
  t: (key: string, params?: any) => string, 
  lang: { value: string }, 
  router: any
) {
  const scanningLocation = ref(false)
  const locationStatus = ref('')

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371 // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const detectAndRedirectNearestNode = () => {
    if (!process.client || !navigator.geolocation) return

    scanningLocation.value = true
    locationStatus.value = t('detectingCoords')
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        locationStatus.value = t('coordsAcquired')
        
        try {
          const res = await $fetch('/api/nodes', { query: { limit: 100 } })
          if (res && typeof res === 'object' && 'nodes' in res) {
            const allNodes = (res as any).nodes
            if (allNodes.length === 0) {
              scanningLocation.value = false
              return
            }

            let nearestNode = null
            let minDistance = Infinity

            for (const node of allNodes) {
              const dist = calculateDistance(latitude, longitude, node.latitude, node.longitude)
              if (dist < minDistance) {
                minDistance = dist
                nearestNode = node
              }
            }

            if (nearestNode) {
              locationStatus.value = t('nearestNodeFound', { name: `${nearestNode.name} - ${nearestNode.location}` })
              setTimeout(() => {
                router.push(`/node/${nearestNode.id}`)
              }, 1000)
            } else {
              scanningLocation.value = false
            }
          }
        } catch (err) {
          console.error('Error determining nearest node:', err)
          scanningLocation.value = false
        }
      },
      (error) => {
        console.warn('Geolocation access failed or denied:', error.message)
        scanningLocation.value = false
        alert(lang.value === 'id' ? 'Gagal mendeteksi lokasi. Pastikan izin akses lokasi telah diberikan.' : 'Failed to detect location. Ensure location access permission is granted.')
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }

  return {
    scanningLocation,
    locationStatus,
    detectAndRedirectNearestNode
  }
}
