export default defineNuxtPlugin((nuxtApp) => {
  if (process.server) {
    return
  }

  const docEl = document.documentElement
  const propertyName = '--app-viewport-height'

  const setViewportHeight = () => {
    const height = window.innerHeight
    docEl.style.setProperty(propertyName, `${height}px`)
  }

  let pendingRaf: number | null = null
  const requestViewportRefresh = () => {
    if (pendingRaf !== null) return
    pendingRaf = window.requestAnimationFrame(() => {
      pendingRaf = null
      setViewportHeight()
    })
  }

  setViewportHeight()

  const listeners: Array<[
    EventTarget,
    string,
    EventListenerOrEventListenerObject,
    AddEventListenerOptions | boolean | undefined,
  ]> = [
    [window, 'resize', requestViewportRefresh, { passive: true }],
    [window, 'orientationchange', requestViewportRefresh, undefined],
    [window, 'focus', requestViewportRefresh, undefined],
  ]

  const visualViewport = window.visualViewport
  if (visualViewport) {
    const handler: EventListener = () => requestViewportRefresh()
    listeners.push([visualViewport, 'resize', handler, undefined])
    listeners.push([visualViewport, 'scroll', handler, undefined])
  }

  listeners.forEach(([target, event, handler, options]) => {
    target.addEventListener(event, handler, options)
  })

  const cleanup = () => {
    listeners.forEach(([target, event, handler, options]) => {
      target.removeEventListener(event, handler, options)
    })
    if (pendingRaf !== null) {
      window.cancelAnimationFrame(pendingRaf)
      pendingRaf = null
    }
  }

  nuxtApp.hook('page:finish', setViewportHeight)
  nuxtApp.hook('app:beforeUnmount', cleanup)
})
