import type { RouteLocationNormalizedLoaded } from 'vue-router'

export default defineNuxtPlugin((nuxtApp) => {
  const {
    public: { gtagId },
  } = useRuntimeConfig()

  if (!gtagId) {
    return
  }

  useHead({
    script: [
      {
        src: `https://www.googletagmanager.com/gtag/js?id=${gtagId}`,
        async: true,
      },
      {
        children: [
          'window.dataLayer = window.dataLayer || [];',
          "function gtag(){dataLayer.push(arguments);}",
          "gtag('js', new Date());",
          `gtag('config', '${gtagId}', { send_page_view: false });`,
        ].join('\n'),
      },
    ],
  })

  if (import.meta.client) {
    const globalWindow = window as typeof window & {
      dataLayer?: Array<unknown>
      gtag?: (...args: unknown[]) => void
    }

    globalWindow.dataLayer = globalWindow.dataLayer || []

    if (!globalWindow.gtag) {
      globalWindow.gtag = (...args: unknown[]) => {
        globalWindow.dataLayer?.push(args)
      }
    }
  }

  let lastTrackedPath: string | null = null

  const sendPageView = (route?: RouteLocationNormalizedLoaded) => {
    if (typeof window === 'undefined') {
      return
    }

    const globalWindow = window as typeof window & {
      dataLayer?: Array<unknown>
      gtag?: (...args: unknown[]) => void
    }

    const pagePath = route?.fullPath ?? `${window.location.pathname}${window.location.search}`

    if (lastTrackedPath === pagePath) {
      return
    }

    lastTrackedPath = pagePath

    const pageLocation = route
      ? new URL(route.fullPath, window.location.origin).href
      : window.location.href

    const payload = {
      page_path: pagePath,
      page_title: document.title,
      page_location: pageLocation,
    }

    if (typeof globalWindow.gtag === 'function') {
      globalWindow.gtag('event', 'page_view', payload)
      globalWindow.gtag('config', gtagId, payload)
      return
    }

    if (Array.isArray(globalWindow.dataLayer)) {
      globalWindow.dataLayer.push(['event', 'page_view', payload])
      globalWindow.dataLayer.push(['config', gtagId, payload])
    }
  }

  const router = useRouter()

  nuxtApp.hook('app:mounted', () => {
    sendPageView(router.currentRoute.value)
  })

  nuxtApp.hook('page:finish', (context) => {
    sendPageView(context?.route as RouteLocationNormalizedLoaded | undefined)
  })

  router.afterEach((to) => {
    requestAnimationFrame(() => {
      sendPageView(to as RouteLocationNormalizedLoaded)
    })
  })
})
