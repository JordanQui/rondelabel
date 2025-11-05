export default defineNuxtPlugin((nuxtApp) => {
  if (process.server) {
    return
  }

  const ua = window.navigator.userAgent
  const platform = window.navigator.platform
  const isIOSDevice =
    /iPad|iPhone|iPod/.test(platform) ||
    (ua.includes('Mac') && 'ontouchend' in document)

  if (!isIOSDevice) {
    return
  }

  let startY = 0
  let atTop = window.scrollY <= 0

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      return
    }

    startY = event.touches[0].clientY
    atTop = window.scrollY <= 0
  }

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      return
    }

    const currentY = event.touches[0].clientY
    const isPullingDown = currentY > startY

    if (atTop && isPullingDown && event.cancelable) {
      event.preventDefault()
    }

    startY = currentY
    atTop = window.scrollY <= 0
  }

  const onScroll = () => {
    atTop = window.scrollY <= 0
  }

  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('scroll', onScroll, { passive: true })

  nuxtApp.hook('app:beforeUnmount', () => {
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('scroll', onScroll)
  })
})
