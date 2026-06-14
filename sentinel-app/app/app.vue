<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useColorMode } from '@vueuse/core'
import { 
  Sun, 
  Moon, 
  Laptop, 
  Activity,
  ChevronDown,
  Globe
} from '@lucide/vue'
import { Button } from './components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './components/ui/dropdown-menu'
import pkg from '../package.json'

// Configure VueUse theme color mode
const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  modes: {
    dark: 'dark',
    light: '',
  }
})
const { lang, setLang, t } = useI18n()

const currentYear = new Date().getFullYear()
const version = `v${pkg.version || '0.0.0'}`

const router = useRouter()
const pageLoading = ref(false)

router.beforeEach((to, from, next) => {
  pageLoading.value = true
  next()
})

router.afterEach(() => {
  setTimeout(() => {
    pageLoading.value = false
  }, 250)
})

// Load Google Fonts and favicon globally
useHead({
  title: () => t('heroTitle'),
  link: [
    {
      rel: 'icon',
      type: 'image/svg+xml',
      href: '/favicon.svg'
    },
    {
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com'
    },
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossorigin: ''
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap'
    }
  ]
})
</script>

<template>
  <div class="min-h-screen w-full relative futuristic-grid bg-background transition-colors duration-300 flex flex-col font-sans selection:bg-primary/30 overflow-x-hidden">
    <!-- Sci-fi background glow effects -->
    <div class="absolute inset-0 radial-glow pointer-events-none z-0"></div>

    <!-- Liquid Glass slowly morphing colorful blobs -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <!-- Blue blob top left -->
      <div class="absolute -top-[15%] -left-[15%] w-[60vw] h-[60vw] sm:w-[45vw] sm:h-[45vw] rounded-full bg-gradient-to-tr from-blue-500/15 to-indigo-500/5 blur-[120px] animate-blob"></div>
      <!-- Cyan blob bottom right -->
      <div class="absolute -bottom-[20%] -right-[15%] w-[70vw] h-[70vw] sm:w-[50vw] sm:h-[50vw] rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-500/5 blur-[130px] animate-blob animation-delay-2000"></div>
      <!-- Indigo/Violet center blob -->
      <div class="absolute top-[30%] left-[20%] w-[50vw] h-[50vw] sm:w-[35vw] sm:h-[35vw] rounded-full bg-gradient-to-tr from-indigo-500/10 to-purple-500/5 blur-[110px] animate-blob animation-delay-4000"></div>
    </div>

    <!-- Full-page route loader overlay -->
    <Transition name="fade-overlay">
      <div v-if="pageLoading" class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md select-none pointer-events-auto">
        <div class="relative flex items-center justify-center w-24 h-24">
          <!-- Outer spinning tech ring -->
          <div class="absolute w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin"></div>
          <!-- Inner breathing pulse glow -->
          <div class="absolute w-14 h-14 rounded-full bg-primary/5 border border-primary/30 animate-pulse"></div>
          <!-- Center logo/droplet SVG -->
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            class="w-8 h-8 text-primary relative z-10 animate-pulse"
          >
            <path d="M12 2C8.5 6.5 5 10.2 5 14c0 3.86 3.14 7 7 7s7-3.14 7-7c0-3.8-5-7.5-7-12z" stroke-width="1.8" />
            <circle cx="12" cy="9.5" r="1.2" fill="currentColor" />
            <circle cx="9" cy="14.5" r="1.2" fill="currentColor" />
            <circle cx="15" cy="14.5" r="1.2" fill="currentColor" />
            <path d="M12 9.5L9 14.5M12 9.5l3 5M9 14.5h6" stroke-width="1.2" class="opacity-80" />
            <path d="M7 17.5c1.5-1 2.5 1 4 0s2.5-1 4 0" stroke-width="1" class="opacity-75" />
          </svg>
        </div>
        <div class="mt-4 text-xs font-bold tracking-widest text-primary/80 uppercase font-mono animate-pulse">
          Loading System...
        </div>
      </div>
    </Transition>

    <!-- Global Header -->
    <header class="sticky top-0 z-40 w-full border-b border-border/40 glass-panel backdrop-blur-lg">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        
        <!-- Logo and Brand -->
        <NuxtLink to="/" class="flex items-center gap-2.5 group focus:outline-none">
          <div class="relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 group-hover:border-primary/50 transition-colors duration-300">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round" 
              class="w-5 h-5 text-blue-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300 relative z-10"
            >
              <!-- Droplet Outer Shell -->
              <path d="M12 2C8.5 6.5 5 10.2 5 14c0 3.86 3.14 7 7 7s7-3.14 7-7c0-3.8-5-7.5-7-12z" stroke-width="1.8" />
              <!-- Data/Network Nodes -->
              <circle cx="12" cy="9.5" r="1.2" fill="currentColor" />
              <circle cx="9" cy="14.5" r="1.2" fill="currentColor" />
              <circle cx="15" cy="14.5" r="1.2" fill="currentColor" />
              <!-- Connection Traces -->
              <path d="M12 9.5L9 14.5M12 9.5l3 5M9 14.5h6" stroke-width="1.2" class="opacity-80" />
              <!-- Telemetry Pulse Wave -->
              <path d="M7 17.5c1.5-1 2.5 1 4 0s2.5-1 4 0" stroke-width="1" class="opacity-75" />
            </svg>
            <div class="absolute inset-0 rounded-lg bg-blue-500/10 blur-sm group-hover:bg-blue-500/20 transition-all"></div>
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-bold tracking-widest bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent uppercase font-heading leading-tight">
              Sentinel
            </span>
            <span class="text-[9px] text-muted-foreground font-sans tracking-widest uppercase opacity-85 leading-none mt-0.5">Telemetry Fleet</span>
          </div>
        </NuxtLink>
 
        <!-- Controls (ClientOnly to prevent hydration mismatch for theme/i18n state) -->
        <div class="flex items-center gap-3">
          <ClientOnly>
            <!-- Language Selector Dropdown (Shadcn Vue) -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="h-8 w-8 rounded-lg border border-border/40 bg-background/50 hover:bg-background/85 hover:text-foreground text-muted-foreground glass-panel flex items-center justify-center focus:outline-none cursor-pointer p-0">
                  <Globe class="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span class="sr-only">Language Selector</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="glass-panel border-border/40 min-w-[140px] z-50">
                <DropdownMenuItem @click="setLang('id')" class="text-xs cursor-pointer font-bold focus:bg-muted focus:text-foreground flex items-center justify-between gap-4">
                  <span>Bahasa Indonesia</span>
                  <span v-if="lang === 'id'" class="text-[10px] text-blue-500 dark:text-blue-400 font-sans font-bold">✓</span>
                </DropdownMenuItem>
                <DropdownMenuItem @click="setLang('en')" class="text-xs cursor-pointer font-bold focus:bg-muted focus:text-foreground flex items-center justify-between gap-4">
                  <span>English (US)</span>
                  <span v-if="lang === 'en'" class="text-[10px] text-blue-500 dark:text-blue-400 font-sans font-bold">✓</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <!-- Theme Selector Dropdown (Shadcn Vue) -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="h-8 w-8 rounded-lg border border-border/40 bg-background/50 hover:bg-background/85 hover:text-foreground text-muted-foreground glass-panel flex items-center justify-center focus:outline-none cursor-pointer p-0">
                  <Sun v-if="mode === 'light'" class="w-4 h-4 text-amber-500" />
                  <Moon v-else-if="mode === 'dark'" class="w-4 h-4 text-blue-400" />
                  <Laptop v-else class="w-4 h-4 text-indigo-400" />
                  <span class="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="glass-panel border-border/40 min-w-[125px] z-50">
                <DropdownMenuItem @click="mode = 'light'" class="text-xs cursor-pointer font-bold focus:bg-muted focus:text-foreground flex items-center gap-2">
                  <Sun class="w-3.5 h-3.5 text-amber-500" />
                  <span>{{ t('themeLight') }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem @click="mode = 'dark'" class="text-xs cursor-pointer font-bold focus:bg-muted focus:text-foreground flex items-center gap-2">
                  <Moon class="w-3.5 h-3.5 text-blue-400" />
                  <span>{{ t('themeDark') }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem @click="mode = 'auto'" class="text-xs cursor-pointer font-bold focus:bg-muted focus:text-foreground flex items-center gap-2">
                  <Laptop class="w-3.5 h-3.5 text-indigo-400" />
                  <span>{{ t('themeSystem') }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ClientOnly>
        </div>
 
      </div>
    </header>
 
    <!-- Main Content Area -->
    <main class="flex-grow z-10 flex flex-col">
      <NuxtPage />
    </main>
 
    <!-- Global Footer -->
    <footer class="w-full border-t border-border/40 py-6 z-10 glass-panel mt-auto">
      <div class="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-muted-foreground font-sans">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>Sentinel &copy; {{ currentYear }}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-mono">{{ version }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
/* Global page transition styles */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Full screen loading transition overlay styles */
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}
</style>
