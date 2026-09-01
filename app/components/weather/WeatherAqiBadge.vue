<script setup lang="ts">
import type { AqiCategoryInfo } from '~/types/weather'

const props = defineProps<{
  aqi: number
  category?: AqiCategoryInfo
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
}>()

const categoryInfo = computed(() => {
  if (props.category) return props.category
  return getAqiCategoryInfo(props.aqi)
})

function getAqiCategoryInfo(aqi: number): AqiCategoryInfo {
  if (aqi <= 50) {
    return {
      level: 'good',
      label: 'Good',
      color: 'success',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-500',
      description: 'Satisfactory',
      healthAdvisory: 'Air is fresh and clean.'
    }
  }
  if (aqi <= 100) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: 'warning',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-500',
      description: 'Acceptable',
      healthAdvisory: 'Air is acceptable.'
    }
  }
  if (aqi <= 150) {
    return {
      level: 'unhealthy-sensitive',
      label: 'Sensitive',
      color: 'warning',
      badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
      textClass: 'text-orange-600 dark:text-orange-400',
      bgClass: 'bg-orange-500',
      description: 'Unhealthy for Sensitive Groups',
      healthAdvisory: 'Sensitive groups limit outdoor activity.'
    }
  }
  if (aqi <= 200) {
    return {
      level: 'unhealthy',
      label: 'Unhealthy',
      color: 'error',
      badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      textClass: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-500',
      description: 'Unhealthy',
      healthAdvisory: 'Wear masks and reduce exertion.'
    }
  }
  if (aqi <= 300) {
    return {
      level: 'very-unhealthy',
      label: 'Very Poor',
      color: 'error',
      badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      textClass: 'text-purple-600 dark:text-purple-400',
      bgClass: 'bg-purple-500',
      description: 'Very Unhealthy',
      healthAdvisory: 'Stay indoors with air filtration.'
    }
  }
  return {
    level: 'hazardous',
    label: 'Hazardous',
    color: 'error',
    badgeClass: 'bg-rose-950/40 text-rose-500 dark:text-rose-400 border-rose-600/40',
    textClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-700',
    description: 'Hazardous',
    healthAdvisory: 'Emergency health hazard.'
  }
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 font-mono font-bold rounded-md border transition-all"
    :class="[
      categoryInfo.badgeClass,
      props.size === 'sm' ? 'px-2 py-0.5 text-xs' : props.size === 'md' ? 'px-3 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'
    ]"
    :title="categoryInfo.healthAdvisory"
  >
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="categoryInfo.bgClass"
    />
    <span>{{ Math.round(props.aqi) }}</span>
    <span
      v-if="props.showLabel !== false"
      class="font-sans font-semibold opacity-90 text-[10px] tracking-tight"
    >
      {{ categoryInfo.label }}
    </span>
  </span>
</template>
