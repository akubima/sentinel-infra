export function getTdsValColor(tds: number | null): string {
  if (tds === null) return 'text-foreground'
  if (tds < 150) return 'text-emerald-500'
  if (tds < 300) return 'text-amber-500'
  if (tds < 500) return 'text-rose-500'
  return 'text-purple-500'
}

export function getTempValColor(temp: number | null): string {
  if (temp === null) return 'text-foreground'
  if (temp < 10) return 'text-blue-500'
  if (temp < 25) return 'text-emerald-500'
  if (temp < 40) return 'text-amber-500'
  return 'text-rose-500'
}

export function getTdsClass(tds: number | null, t: (key: string) => string) {
  if (tds === null) {
    return {
      label: t('tdsUnknown'),
      color: 'text-muted-foreground border-border/40 bg-muted/20 backdrop-blur-sm',
      desc: t('tdsUnknownDesc')
    }
  }
  if (tds < 150) {
    return {
      label: t('tdsExcellent'),
      color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm',
      desc: t('tdsExcellentDesc')
    }
  }
  if (tds < 300) {
    return {
      label: t('tdsGood'),
      color: 'text-amber-500 border-amber-500/20 bg-amber-500/5 backdrop-blur-sm',
      desc: t('tdsGoodDesc')
    }
  }
  if (tds < 500) {
    return {
      label: t('tdsPoor'),
      color: 'text-rose-500 border-rose-500/20 bg-rose-500/5 backdrop-blur-sm',
      desc: t('tdsPoorDesc')
    }
  }
  return {
    label: t('tdsContaminated'),
    color: 'text-purple-500 border-purple-500/20 bg-purple-500/5 backdrop-blur-sm',
    desc: t('tdsContaminatedDesc')
  }
}

export function getTempClass(temp: number | null, t: (key: string) => string) {
  if (temp === null) {
    return {
      label: t('tempUnknown'),
      color: 'text-muted-foreground border-border/40 bg-muted/20 backdrop-blur-sm',
      desc: t('tempUnknownDesc')
    }
  }
  if (temp < 10) {
    return {
      label: t('tempCold'),
      color: 'text-blue-500 border-blue-500/20 bg-blue-500/5 backdrop-blur-sm',
      desc: t('tempColdDesc')
    }
  }
  if (temp < 25) {
    return {
      label: t('tempNormal'),
      color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm',
      desc: t('tempNormalDesc')
    }
  }
  if (temp < 40) {
    return {
      label: t('tempWarm'),
      color: 'text-amber-500 border-amber-500/20 bg-amber-500/5 backdrop-blur-sm',
      desc: t('tempWarmDesc')
    }
  }
  return {
    label: t('tempHot'),
    color: 'text-rose-500 border-rose-500/20 bg-rose-500/5 backdrop-blur-sm',
    desc: t('tempHotDesc')
  }
}

export function getTdsGaugeColor(tds: number | null): string {
  if (tds === null) return 'text-muted/40'
  if (tds < 150) return 'text-emerald-500'
  if (tds < 300) return 'text-amber-500'
  if (tds < 500) return 'text-rose-500'
  return 'text-purple-500'
}

export function getTempGaugeColor(temp: number | null): string {
  if (temp === null) return 'text-muted/40'
  if (temp < 10) return 'text-blue-500'
  if (temp < 25) return 'text-emerald-500'
  if (temp < 40) return 'text-amber-500'
  return 'text-rose-500'
}
