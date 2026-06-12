import { ref, onMounted } from 'vue'

const translations = {
  id: {
    radarActive: "Mencari Node Terdekat",
    detectingCoords: "Mendeteksi posisi koordinat Anda...",
    coordsAcquired: "Posisi diperoleh. Menganalisis node terdekat...",
    nearestNodeFound: "Menemukan node terdekat: {name}. Mengalihkan...",
    cancelScan: "Batalkan pemindaian",
    heroTitle: "Sentinel Telemetry Fleet",
    heroDesc: "Sistem pemantauan kualitas dan deteksi dini kualitas air minum secara real-time untuk menjamin keamanan konsumsi publik.",
    nearestNode: "Node terdekat",
    searchPlaceholder: "Cari node berdasarkan nama atau lokasi...",
    failedFetch: "Gagal Mengambil Data",
    failedLoadNodes: "Gagal memuat node telemetri.",
    noNodesFound: "Tidak ada node yang ditemukan",
    searchNoMatch: "Pencarian Anda \"{search}\" tidak cocok dengan perangkat mana pun.",
    tdsTitle: "Zat Terlarut (TDS)",
    tempTitle: "Suhu Air",
    updated: "Diperbarui:",
    detail: "Detail",
    showingNodes: "Menampilkan {start} sampai {end} dari {total} node",
    themeSystem: "Perangkat",
    themeDark: "Gelap",
    themeLight: "Terang",
    home: "Beranda",
    failedLoadNodeDetails: "Gagal memuat data telemetri node ini.",
    backToDashboard: "Kembali ke Dashboard",
    connected: "Terhubung",
    disconnected: "Terputus",
    waterSuitability: "Kelayakan Air:",
    referencePermenkes: "Acuan: Permenkes No. 2 Tahun 2023 & US EPA",
    tempCondition: "Kondisi Suhu:",
    referencePermenkesPp: "Acuan: Permenkes No. 2 Tahun 2023 & PP No. 22 Tahun 2021",
    telemetryTrends: "Tren Telemetri",
    last60Mins: "60 menit terakhir",
    tdsStats: "Statistik Zat Terlarut (TDS)",
    tempStats: "Statistik Suhu Air",
    min: "Minimum",
    max: "Maksimum",
    mean: "Rata-rata",
    stdDev: "Standar deviasi",
    noHistoryData: "Data riwayat tidak cukup untuk dikontribusikan ke grafik",
    // TDS Class descriptions
    tdsUnknown: "Tidak Diketahui",
    tdsUnknownDesc: "Tidak ada pembacaan aktif.",
    tdsExcellent: "Sangat Baik",
    tdsExcellentDesc: "Air sangat murni, sangat aman untuk dikonsumsi.",
    tdsGood: "Baik",
    tdsGoodDesc: "Air bersih standar, aman untuk diminum.",
    tdsPoor: "Buruk",
    tdsPoorDesc: "Kadar zat terlarut tinggi. Air tidak layak diminum.",
    tdsContaminated: "Tercemar",
    tdsContaminatedDesc: "Kadar zat terlarut berbahaya. Air tercemar dan sangat tidak layak minum.",
    // Temp Class descriptions
    tempUnknown: "Tidak Diketahui",
    tempUnknownDesc: "Tidak ada pembacaan aktif.",
    tempCold: "Dingin",
    tempColdDesc: "Suhu air dingin (di bawah 10°C). Sangat menyegarkan dan membatasi pertumbuhan bakteri secara alami.",
    tempNormal: "Normal / Sejuk",
    tempNormalDesc: "Suhu normal dan sejuk, ideal untuk kesegaran dan menjaga kualitas higienis air minum.",
    tempWarm: "Hangat",
    tempWarmDesc: "Suhu air hangat (25°C - 39.9°C). Masih dalam batas wajar, namun suhu yang lebih rendah lebih disukai untuk meminimalkan pertumbuhan mikroba.",
    tempHot: "Panas / Ekstrem",
    tempHotDesc: "Suhu air sangat tinggi (>= 40°C). Kurang layak konsumsi langsung dan berisiko meningkatkan pelarutan zat kimia berbahaya dari pipa.",
    // Months
    jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", mei: "Mei", jun: "Jun", jul: "Jul", agu: "Agu", sep: "Sep", okt: "Okt", nov: "Nov", des: "Des",
    tdsTooltipLabel: "TDS",
    tempTooltipLabel: "SUHU",
    geoLocTitle: "LOKASI GEOGRAFIS",
    location: "Lokasi",
    coordinates: "Koordinat",
    refSystem: "Sistem Referensi",
    mapDataSourced: "Peta bersumber dari OpenStreetMap (OSM) kontributor.",
    navigate: "Navigasi",
    filterOnlineOnly: "Node Online"
  },
  en: {
    radarActive: "Finding Nearest Node",
    detectingCoords: "Detecting your coordinate position...",
    coordsAcquired: "Position acquired. Analyzing nearest node...",
    nearestNodeFound: "Found nearest node: {name}. Redirecting...",
    cancelScan: "Cancel scan",
    heroTitle: "Sentinel Telemetry Fleet",
    heroDesc: "Real-time drinking water quality monitoring and early detection system to ensure public consumption safety.",
    nearestNode: "Nearest node",
    searchPlaceholder: "Search nodes by name or location...",
    failedFetch: "Failed to Fetch Data",
    failedLoadNodes: "Failed to load telemetry nodes.",
    noNodesFound: "No nodes found",
    searchNoMatch: "Your search \"{search}\" did not match any devices.",
    tdsTitle: "Total Dissolved Solids (TDS)",
    tempTitle: "Water Temperature",
    updated: "Updated:",
    detail: "Details",
    showingNodes: "Showing {start} to {end} of {total} nodes",
    themeSystem: "Device",
    themeDark: "Dark",
    themeLight: "Light",
    home: "Home",
    failedLoadNodeDetails: "Failed to load telemetry data for this node.",
    backToDashboard: "Back to Dashboard",
    connected: "Connected",
    disconnected: "Disconnected",
    waterSuitability: "Water Suitability:",
    referencePermenkes: "Reference: Permenkes No. 2 Tahun 2023 & US EPA",
    tempCondition: "Temperature Condition:",
    referencePermenkesPp: "Reference: Permenkes No. 2 Tahun 2023 & PP No. 22 Tahun 2021",
    telemetryTrends: "Telemetry Trends",
    last60Mins: "Last 60 minutes",
    tdsStats: "TDS Statistics",
    tempStats: "Water Temperature Statistics",
    min: "Minimum",
    max: "Maximum",
    mean: "Average",
    stdDev: "Standard deviation",
    noHistoryData: "Insufficient historical data for the chart",
    // TDS Class descriptions
    tdsUnknown: "Unknown",
    tdsUnknownDesc: "No active reading.",
    tdsExcellent: "Excellent",
    tdsExcellentDesc: "Water is highly pure, extremely safe to consume.",
    tdsGood: "Good",
    tdsGoodDesc: "Standard clean water, safe to drink.",
    tdsPoor: "Poor",
    tdsPoorDesc: "High dissolved solids level. Water is not suitable for drinking.",
    tdsContaminated: "Contaminated",
    tdsContaminatedDesc: "Dangerous dissolved solids level. Water is contaminated and unfit for drinking.",
    // Temp Class descriptions
    tempUnknown: "Unknown",
    tempUnknownDesc: "No active reading.",
    tempCold: "Cold",
    tempColdDesc: "Cold water temperature (below 10°C). Highly refreshing and naturally inhibits bacterial growth.",
    tempNormal: "Normal / Cool",
    tempNormalDesc: "Normal and cool temperature, ideal for freshness and maintaining hygienic drinking water quality.",
    tempWarm: "Warm",
    tempWarmDesc: "Warm water temperature (25°C - 39.9°C). Within acceptable limits, though cooler temperature is preferred to minimize microbial growth.",
    tempHot: "Hot / Extreme",
    tempHotDesc: "Very high water temperature (>= 40°C). Not suitable for direct consumption and increases risk of leaching pipe chemicals.",
    // Months
    jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", mei: "May", jun: "Jun", jul: "Jul", agu: "Aug", sep: "Sep", okt: "Oct", nov: "Nov", des: "Dec",
    tdsTooltipLabel: "TDS:",
    tempTooltipLabel: "TEMP:",
    geoLocTitle: "GEOGRAPHIC LOCATION",
    location: "Location",
    coordinates: "Coordinates",
    refSystem: "Reference System",
    mapDataSourced: "Map data sourced from OpenStreetMap (OSM) contributors.",
    navigate: "Navigate",
    filterOnlineOnly: "Online Nodes"
  }
}

export function useI18n() {
  const lang = useState<string>('lang', () => 'en')

  // Initialize lang on client side from browser or localStorage
  if (process.client) {
    onMounted(() => {
      const saved = localStorage.getItem('lang')
      if (saved === 'id' || saved === 'en') {
        lang.value = saved
      } else {
        const browserLang = navigator.language || (navigator.languages && navigator.languages[0]) || 'en'
        lang.value = browserLang.toLowerCase().startsWith('id') ? 'id' : 'en'
      }
    })
  }

  const setLang = (newLang: 'en' | 'id') => {
    lang.value = newLang
    if (process.client) {
      localStorage.setItem('lang', newLang)
    }
  }

  const t = (key: keyof typeof translations['en'], params?: Record<string, string | number>) => {
    const localeTranslations = translations[lang.value as 'en' | 'id'] || translations['en']
    let text = localeTranslations[key] || translations['en'][key] || String(key)
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }

  return {
    lang,
    setLang,
    t
  }
}
