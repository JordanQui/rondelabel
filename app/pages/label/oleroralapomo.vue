<template>
  <div class="label-page">
    <!-- Canvas Hydra           -->
    <canvas
      :id="canvasId"
      ref="canvasRef"
      class="label-hydra"
      role="img"
      aria-label="Visualisation générative du label"
    />

    <!-- Mentions   -->
    <div class="label-legal">
      <p>
        © 2025 Jordan Olivier —
        <a
          href="https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr"
          target="_blank"
          class="legal-linker"
          rel="noopener noreferrer"
        >
          CC BY-NC-ND 4.0
        </a>
        <a href="/mentions-legales" class="legal-linker"> Mentions légales</a>
      </p>
    </div>

    <!-- Lecteurs audio -->
    <div class="slider-pagination-overlay" role="status" aria-live="polite">
      {{ activeSlidePagination }}
    </div>
    <div
      ref="sliderContainerRef"
      :class="['slider-container', { 'is-dragging': isSliderDragging }]"
      aria-label="Pistes audio du label"
      tabindex="0"
      @pointerdown.passive="handlePointerDown"
      @pointermove.passive="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="handlePointerLeave"
      @wheel.prevent="handleWheel"
      @keydown="handleSliderKeydown"
    >
      <div ref="sliderTrackRef" class="slider-track">
        <div
          v-for="(track, index) in tracks"
          :key="track.src"
          :class="['slider-slide', { 'is-active': index === activeSlideIndex }]"
        >
          <div class="slide-information">
            <p class="artist-name">Jordan Olivier</p>
            <p class="track-name">{{ track.title }}</p>
          </div>

          <transition name="tap-to-play">
            <div
              v-if="
                isSlideLoading(index) ||
                (tapToPlayVisible &&
                  tapToPlaySlideIndex === index &&
                  shouldAllowTapToPlayPrompt(index))
              "
              class="tap-to-play-message"
              role="status"
              aria-live="polite"
            >
              {{ isSlideLoading(index) ? 'player is loading' : 'tap to play' }}
            </div>
          </transition>

          <button
            v-if="shouldShowPlayButtonForSlide(index)"
            class="slide-play-button"
            type="button"
            :aria-label="`Lire ${track.title}`"
            :title="`Lire ${track.title}`"
            @click="handlePlayButtonClick(index)"
          >
            <img
              src="/images/playbutton.svg"
              alt=""
              aria-hidden="true"
            />
          </button>

          <!-- Audio caché -->
          <audio
            :ref="(el) => setAudioRef(el, index)"
            :src="track.src"
            preload="metadata"
            loop
            playsinline
            :aria-label="`Lecteur pour ${track.title}`"
            class="slide-audio"
            @play="() => handleAudioPlay(index)"
            @loadstart="() => handleAudioLoadingStatus(index, true, 'loadstart')"
            @waiting="() => handleAudioLoadingStatus(index, true, 'waiting')"
            @stalled="() => handleAudioLoadingStatus(index, true, 'stalled')"
            @canplay="() => handleAudioLoadingStatus(index, false, 'canplay')"
            @canplaythrough="() => handleAudioLoadingStatus(index, false, 'canplaythrough')"
            @playing="() => handleAudioLoadingStatus(index, false, 'playing')"
            @loadeddata="() => handleAudioLoadingStatus(index, false, 'loadeddata')"
            @loadedmetadata="() => handleAudioLoadingStatus(index, false, 'loadedmetadata')"
            @error="() => handleAudioError(index)"
          ></audio>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useHead } from '#imports'
import { gsap } from 'gsap'
import { enableMixWithOthers } from '~/utils/iosAudioSession'

declare const osc: any
declare const noise: any
declare const o0: any

const canvasId = 'label-hydra-canvas'

const tracks = [
  { src: '/tracks/oleroralapomo/Noratolopomu.mp3', title: 'Noratolopomu' },
  { src: '/tracks/oleroralapomo/Oleroralapomo.mp3', title: 'Oleroralapomo' },
  { src: '/tracks/oleroralapomo/Ralotorapomi.mp3', title: 'Ralotorapomi' },
  { src: '/tracks/oleroralapomo/Relatarapobo.mp3', title: 'Relatarapobo' },
]

const HEAD_PRELOAD_COUNT = 1
const INITIAL_SLIDE_INDEX = 0
const SLIDER_SCROLL_COMPLETE_EVENT = 'label-slider:scroll-complete'
const SLIDE_NUMBER_PAD_LENGTH = tracks.length >= 10 ? 2 : 1

useHead({
  link: tracks.slice(0, HEAD_PRELOAD_COUNT).map((t) => ({
    rel: 'preload',
    as: 'audio',
    href: t.src,
    type: 'audio/mpeg',
    crossorigin: 'anonymous',
  })),
  meta: [{ name: 'autoplay', content: 'allowed' }],
})

const audioRefs = ref<(HTMLAudioElement | null)[]>(Array(tracks.length).fill(null))
const sourceNodes = ref<(MediaElementAudioSourceNode | null)[]>(Array(tracks.length).fill(null))
const audioContext = ref<AudioContext | null>(null)
const masterGainNode = ref<GainNode | null>(null)
const analyserNode = ref<AnalyserNode | null>(null)
let analyserDataArray: Uint8Array | null = null
let analyserBandIndices: { start: number; end: number }[] = []

const hydraAudioBands = {
  low: 0,
  lowMid: 0,
  highMid: 0,
  high: 0,
}
const hydraAudioTargets = { ...hydraAudioBands }
const HYDRA_AUDIO_TAU = 0.12

const canvasRef = ref<HTMLCanvasElement | null>(null)
const sliderContainerRef = ref<HTMLDivElement | null>(null)
const sliderTrackRef = ref<HTMLDivElement | null>(null)
const activeSlideIndex = ref(0)
const isSliderDragging = ref(false)
const sliderWidth = ref(0)
const pendingPreloadIndices = new Set<number>()
const preloadedIndices = new Set<number>()
const tapToPlayVisible = ref(false)
const tapToPlaySlideIndex = ref<number | null>(null)
const hasUnlockedFirstSlideTapToPlay = ref(false)
const hasUserInteractedWithSlider = ref(false)
const hasNonScrollInteraction = ref(false)
const firstPlayedSlideIndex = ref<number | null>(null)
const hasInitialSlidePlayButtonBeenPressed = ref(false)
const slideHasEverPlayed = ref<boolean[]>(tracks.map(() => false))
const hasPlaybackStarted = computed(() => firstPlayedSlideIndex.value !== null)
const slideLoadingStates = ref<boolean[]>(tracks.map(() => false))
const activeSlidePagination = computed(() => formatSlidePagination(activeSlideIndex.value))
let sliderTween: gsap.core.Tween | null = null
let sliderGsap: typeof gsap | null = null
let wheelCooldownTimeout: number | null = null
let wheelLocked = false
let playRequestId = 0
let hydra: any | null = null
let rafId: number | null = null
let lastFrameTime = 0
let tapToPlayTimeoutId: number | null = null
let tapToPlayEvaluationTimeoutId: number | null = null
let tapToPlayAttemptToken = 0
let suppressNextTapToPlay = false
let isScrollCompleteListenerAttached = false
let canvasResizeObserver: ResizeObserver | null = null
let lastCanvasSize: { width: number; height: number } | null = null

const pointerState = {
  isPointerDown: false,
  startX: 0,
  lastX: 0,
  deltaX: 0,
  pointerId: null as number | null,
  lastTime: 0,
  velocityX: 0,
}

const MAX_SLIDE_JUMP = 3
const MIN_DISTANCE_RATIO_FOR_SLIDE = 0.18
const MIN_VELOCITY_SLIDES_PER_SEC = 0.9
const VELOCITY_INFLUENCE = 0.35

const LOG_PREFIX = '[LabelSlider]'

function logSliderEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  console.info(`${LOG_PREFIX} ${event}`, {
    timestamp: new Date().toISOString(),
    activeSlide: activeSlideIndex.value,
    ...payload,
  })
}

function clearTapToPlayTimeout() {
  if (typeof window === 'undefined') return
  if (tapToPlayTimeoutId !== null) {
    window.clearTimeout(tapToPlayTimeoutId)
    tapToPlayTimeoutId = null
  }
}

function clearTapToPlayEvaluation() {
  if (typeof window === 'undefined') return
  if (tapToPlayEvaluationTimeoutId !== null) {
    window.clearTimeout(tapToPlayEvaluationTimeoutId)
    tapToPlayEvaluationTimeoutId = null
  }
  tapToPlayAttemptToken++
}

function hideTapToPlayMessage() {
  clearTapToPlayTimeout()
  clearTapToPlayEvaluation()
  tapToPlayVisible.value = false
  tapToPlaySlideIndex.value = null
}

function showTapToPlayMessage(index: number) {
  if (typeof window === 'undefined') return
  if (!shouldAllowTapToPlayPrompt(index)) return
  if (isSlideLoading(index)) return
  tapToPlaySlideIndex.value = index
  tapToPlayVisible.value = true
  clearTapToPlayTimeout()
  tapToPlayTimeoutId = window.setTimeout(() => {
    tapToPlayVisible.value = false
    tapToPlaySlideIndex.value = null
    tapToPlayTimeoutId = null
  }, 4000)
}

function unlockFirstSlideTapToPlayPrompt() {
  if (!hasUnlockedFirstSlideTapToPlay.value) {
    hasUnlockedFirstSlideTapToPlay.value = true
  }
}

function shouldAllowTapToPlayPrompt(index: number) {
  if (isSlideLoading(index)) {
    return false
  }
  if (index !== INITIAL_SLIDE_INDEX) {
    return true
  }

  return hasUnlockedFirstSlideTapToPlay.value && !isTrackPlaying(index)
}

type UserInteractionType = 'non-scroll' | 'scroll'

function markUserInteraction(type: UserInteractionType = 'non-scroll') {
  if (!hasUserInteractedWithSlider.value) {
    hasUserInteractedWithSlider.value = true
  }
  if (type !== 'scroll' && !hasNonScrollInteraction.value) {
    hasNonScrollInteraction.value = true
  }
}

function isSlideLoading(index: number) {
  return slideLoadingStates.value[index] === true
}

function setSlideLoadingState(index: number, value: boolean) {
  if (value && slideHasEverPlayed.value[index]) {
    const el = audioRefs.value[index]
    if (el && !el.paused) {
      logSliderEvent('slideLoadingStateIgnored', {
        index,
        value,
        reason: 'playing',
      })
      return
    }
  }
  if (slideLoadingStates.value[index] === value) return
  slideLoadingStates.value[index] = value
  logSliderEvent('slideLoadingState', { index, value })
  if (value) {
    if (tapToPlaySlideIndex.value === index) {
      hideTapToPlayMessage()
    }
  } else if (activeSlideIndex.value === index) {
    evaluateSlidePlaybackState(index)
  }
}

function shouldShowPlayButtonForSlide(index: number) {
  if (isSlideLoading(index)) {
    return false
  }

  if (index === INITIAL_SLIDE_INDEX) {
    return !hasInitialSlidePlayButtonBeenPressed.value
  }

  return !hasPlaybackStarted.value
}

function scheduleTapToPlayPrompt(index: number) {
  if (typeof window === 'undefined') return
  if (suppressNextTapToPlay) {
    suppressNextTapToPlay = false
    return
  }
  if (isSlideLoading(index)) {
    return
  }
  clearTapToPlayEvaluation()
  clearTapToPlayTimeout()
  tapToPlayVisible.value = false
  tapToPlaySlideIndex.value = null
  const attemptToken = ++tapToPlayAttemptToken
  tapToPlayEvaluationTimeoutId = window.setTimeout(() => {
    tapToPlayEvaluationTimeoutId = null
    void evaluateTapToPlayPrompt(index, attemptToken)
  }, 140)
}

function clampSlideIndex(index: number) {
  return Math.max(0, Math.min(tracks.length - 1, index))
}

function formatSlidePagination(index: number) {
  const total = String(tracks.length).padStart(SLIDE_NUMBER_PAD_LENGTH, '0')
  const current = String(index + 1).padStart(SLIDE_NUMBER_PAD_LENGTH, '0')
  return `${current} / ${total}`
}

function dispatchPlayEventForSlide(index: number) {
  const el = audioRefs.value[index]
  if (!el) return
  try {
    el.dispatchEvent(new Event('play'))
  } catch {}
}

function evaluateSlidePlaybackState(index: number) {
  if (isSlideLoading(index)) {
    return
  }
  if (isTrackPlaying(index)) {
    hideTapToPlayMessage()
    dispatchPlayEventForSlide(index)
    return
  }

  scheduleTapToPlayPrompt(index)
}

async function evaluateTapToPlayPrompt(index: number, attemptToken: number) {
  if (attemptToken !== tapToPlayAttemptToken) {
    return
  }
  if (activeSlideIndex.value !== index) return
  if (!shouldAllowTapToPlayPrompt(index)) return
  if (isTrackPlaying(index)) return
  if (isSlideLoading(index)) return

  const wasResumed = await attemptAutoResumePlayback(index, attemptToken)
  if (attemptToken !== tapToPlayAttemptToken) {
    return
  }
  if (wasResumed || isTrackPlaying(index) || isSlideLoading(index)) {
    if (wasResumed) {
      logSliderEvent('autoResumePlaybackSuccess', { index })
    }
    hideTapToPlayMessage()
    return
  }

  logSliderEvent('tapToPlayPromptShown', { index })
  showTapToPlayMessage(index)
}

async function attemptAutoResumePlayback(index: number, attemptToken: number): Promise<boolean> {
  if (attemptToken !== tapToPlayAttemptToken) {
    return false
  }

  const el = audioRefs.value[index]
  if (!el) {
    return false
  }

  logSliderEvent('autoResumePlaybackAttempt', { index, attemptToken })
  await ensurePlaybackReady(index)

  if (attemptToken !== tapToPlayAttemptToken) {
    return false
  }

  try {
    const playResult = el.play()
    if (playResult && typeof playResult.then === 'function') {
      await playResult
    }
  } catch (error: unknown) {
    logSliderEvent('autoResumePlaybackError', { index, error })
  }

  const resumed = !el.paused
  if (!resumed) {
    logSliderEvent('autoResumePlaybackFailed', { index })
  }

  return resumed
}

function handleSliderScrollComplete(event: Event) {
  const customEvent = event as CustomEvent<{ index?: number } | undefined>
  const detail = customEvent.detail
  const targetIndex = typeof detail?.index === 'number' ? detail.index : activeSlideIndex.value
  evaluateSlidePlaybackState(targetIndex)
}

function dispatchSliderScrollComplete(index: number) {
  const container = sliderContainerRef.value
  if (container && isScrollCompleteListenerAttached) {
    container.dispatchEvent(
      new CustomEvent(SLIDER_SCROLL_COMPLETE_EVENT, {
        detail: { index },
      })
    )
    return
  }

  evaluateSlidePlaybackState(index)
}

function measureSliderWidth() {
  const container = sliderContainerRef.value
  sliderWidth.value = container ? container.clientWidth : 0
}

function applySliderOffset(index: number, delta = 0) {
  const track = sliderTrackRef.value
  const width = sliderWidth.value
  const localGsap = sliderGsap
  if (!track || !localGsap) return
  const baseX = width > 0 ? -index * width : 0
  localGsap.set(track, { x: baseX + delta })
}

function requestPreload(index: number) {
  if (index < 0 || index >= tracks.length) return
  pendingPreloadIndices.add(index)
  const el = audioRefs.value[index]
  if (!el) return
  if (preloadedIndices.has(index)) {
    pendingPreloadIndices.delete(index)
    return
  }
  el.preload = 'auto'
  try {
    el.load()
  } catch {}
  preloadedIndices.add(index)
  pendingPreloadIndices.delete(index)
}

function requestPreloadAround(index: number) {
  ;[index - 1, index, index + 1].forEach((candidate) => {
    if (candidate >= 0 && candidate < tracks.length) {
      requestPreload(candidate)
    }
  })
}

async function handleSlideAutoPlay(index: number, previousIndex: number) {
  if (
    index === INITIAL_SLIDE_INDEX &&
    !hasInitialSlidePlayButtonBeenPressed.value &&
    !hasNonScrollInteraction.value
  ) {
    logSliderEvent('autoPlaySkipped', {
      index,
      reason: 'awaiting-non-scroll-interaction',
    })
    return
  }
  if (index === previousIndex && isTrackPlaying(index)) {
    return
  }
  pauseAllExcept(index)
  await playTrack(index)
}

function goToSlide(
  index: number,
  options: { animate?: boolean; autoPlay?: boolean } = {}
) {
  const track = sliderTrackRef.value
  const width = sliderWidth.value
  const localGsap = sliderGsap
  const targetIndex = clampSlideIndex(index)
  const previousIndex = activeSlideIndex.value
  activeSlideIndex.value = targetIndex

  logSliderEvent('goToSlide', {
    requestedIndex: index,
    targetIndex,
    animate: options.animate !== false,
    sliderWidth: width,
  })

  requestPreloadAround(targetIndex)

  const shouldAutoPlay = options.autoPlay === true
  const triggerAutoPlay = () =>
    shouldAutoPlay
      ? handleSlideAutoPlay(targetIndex, previousIndex)
      : Promise.resolve()

  const finalizeSlideActivation = () => {
    void triggerAutoPlay().finally(() => {
      dispatchSliderScrollComplete(targetIndex)
    })
  }

  if (!track || !localGsap) {
    finalizeSlideActivation()
    return Promise.resolve()
  }

  const destination = width > 0 ? -targetIndex * width : 0
  if (options.animate === false || !width) {
    if (sliderTween) {
      sliderTween.kill()
      sliderTween = null
    }
    localGsap.set(track, { x: destination })
    finalizeSlideActivation()
    return Promise.resolve()
  }

  if (sliderTween) {
    sliderTween.kill()
    sliderTween = null
  }

  return new Promise<void>((resolve) => {
    sliderTween = localGsap.to(track, {
      x: destination,
      duration: 0.7,
      ease: 'power3.inOut',
      onComplete: () => {
        sliderTween = null
        finalizeSlideActivation()
        resolve()
      },
    })
  })
}

function refreshSliderLayout() {
  measureSliderWidth()
  applySliderOffset(activeSlideIndex.value)
}

function getPointerTimestamp(event: PointerEvent) {
  if (typeof event.timeStamp === 'number' && !Number.isNaN(event.timeStamp)) {
    return event.timeStamp
  }
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function finalizePointerGesture() {
  const width = sliderWidth.value
  const delta = pointerState.deltaX
  const velocityPxPerMs = pointerState.velocityX
  pointerState.deltaX = 0
  pointerState.velocityX = 0
  let nextIndex = activeSlideIndex.value

  if (width > 0) {
    const distanceSlides = delta / width
    const velocitySlidesPerSec = (velocityPxPerMs * 1000) / width
    const absDistanceSlides = Math.abs(distanceSlides)
    const absVelocitySlides = Math.abs(velocitySlidesPerSec)
    const direction =
      distanceSlides !== 0 ? Math.sign(distanceSlides) : Math.sign(velocitySlidesPerSec)

    if (
      direction !== 0 &&
      (absDistanceSlides >= MIN_DISTANCE_RATIO_FOR_SLIDE ||
        absVelocitySlides >= MIN_VELOCITY_SLIDES_PER_SEC)
    ) {
      const projectedSlides = absDistanceSlides + absVelocitySlides * VELOCITY_INFLUENCE
      const slideJump = Math.max(
        1,
        Math.min(MAX_SLIDE_JUMP, Math.round(projectedSlides))
      )
      nextIndex = clampSlideIndex(activeSlideIndex.value - direction * slideJump)
    }
  }

  pointerState.deltaX = 0
  logSliderEvent('finalizePointerGesture', {
    resolvedIndex: nextIndex,
    delta,
    velocityPxPerMs,
  })
  void goToSlide(nextIndex, { animate: true, autoPlay: true })
}

function handlePointerDown(event: PointerEvent) {
  if (pointerState.isPointerDown) {
    logSliderEvent('pointerdown:ignored', {
      reason: 'already-down',
      pointerId: pointerState.pointerId,
    })
    return
  }
  if (!event.isPrimary) {
    logSliderEvent('pointerdown:ignored', { reason: 'not-primary', pointerId: event.pointerId })
    return
  }
  if (event.pointerType === 'mouse' && event.button !== 0) {
    logSliderEvent('pointerdown:ignored', {
      reason: 'non-left-click',
      pointerId: event.pointerId,
      button: event.button,
    })
    return
  }
  pointerState.isPointerDown = true
  pointerState.startX = event.clientX
  pointerState.lastX = event.clientX
  pointerState.deltaX = 0
  pointerState.pointerId = event.pointerId
  const timestamp = getPointerTimestamp(event)
  pointerState.lastTime = timestamp
  pointerState.velocityX = 0
  isSliderDragging.value = true
  markUserInteraction()
  logSliderEvent('pointerdown', {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
  })
  if (sliderTween) {
    sliderTween.kill()
    sliderTween = null
  }
  const container = sliderContainerRef.value
  if (container && typeof container.setPointerCapture === 'function') {
    try { container.setPointerCapture(event.pointerId) } catch {}
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerState.isPointerDown) return
  if (pointerState.pointerId !== null && event.pointerId !== pointerState.pointerId) return
  if (!event.isPrimary) return
  const previousX = pointerState.lastX
  let segmentDelta = 0
  if (typeof event.movementX === 'number' && !Number.isNaN(event.movementX) && event.movementX !== 0) {
    segmentDelta = event.movementX
  } else if (Number.isFinite(previousX)) {
    segmentDelta = event.clientX - previousX
  }
  if (!Number.isFinite(segmentDelta)) {
    segmentDelta = 0
  }

  pointerState.deltaX += segmentDelta
  pointerState.lastX = event.clientX

  const width = sliderWidth.value
  const constrainedDelta = width > 0 ? Math.max(-width, Math.min(width, pointerState.deltaX)) : pointerState.deltaX
  logSliderEvent('pointermove', {
    pointerId: event.pointerId,
    deltaX: pointerState.deltaX,
    segmentDelta,
    clientX: event.clientX,
  })
  const timestamp = getPointerTimestamp(event)
  const dt = timestamp - pointerState.lastTime
  if (dt > 0) {
    pointerState.velocityX = segmentDelta / dt
  }
  pointerState.lastTime = timestamp
  applySliderOffset(activeSlideIndex.value, constrainedDelta)
}

function handlePointerUp(event: PointerEvent) {
  if (!pointerState.isPointerDown) return
  if (pointerState.pointerId !== null && event.pointerId !== pointerState.pointerId) return
  if (!event.isPrimary) return
  pointerState.isPointerDown = false
  isSliderDragging.value = false
  logSliderEvent('pointerup', {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
  })
  finalizePointerGesture()
  const container = sliderContainerRef.value
  if (container && pointerState.pointerId !== null && typeof container.releasePointerCapture === 'function') {
    try { container.releasePointerCapture(pointerState.pointerId) } catch {}
  }
  pointerState.pointerId = null
  pointerState.lastX = pointerState.startX
  pointerState.velocityX = 0
}

function handlePointerLeave(event: PointerEvent) {
  if (!pointerState.isPointerDown) return
  logSliderEvent('pointerleave', {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
  })
  handlePointerUp(event)
}

function handleWheel(event: WheelEvent) {
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (Math.abs(delta) < 20) return
  if (wheelLocked) return
  markUserInteraction('scroll')
  wheelLocked = true
  const direction = delta > 0 ? 1 : -1
  logSliderEvent('wheel', {
    delta,
    direction,
    locked: wheelLocked,
  })
  void goToSlide(activeSlideIndex.value + direction, { animate: true, autoPlay: true })
  if (typeof window !== 'undefined') {
    if (wheelCooldownTimeout !== null) {
      window.clearTimeout(wheelCooldownTimeout)
    }
    wheelCooldownTimeout = window.setTimeout(() => {
      wheelLocked = false
      wheelCooldownTimeout = null
    }, 420)
  } else {
    wheelLocked = false
  }
}

function handleSliderKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    markUserInteraction()
    logSliderEvent('keydown', { key: event.key })
    void goToSlide(activeSlideIndex.value + 1, { animate: true, autoPlay: true })
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    markUserInteraction()
    logSliderEvent('keydown', { key: event.key })
    void goToSlide(activeSlideIndex.value - 1, { animate: true, autoPlay: true })
  } else if (event.key === 'Home') {
    event.preventDefault()
    markUserInteraction()
    logSliderEvent('keydown', { key: event.key })
    void goToSlide(0, { animate: true, autoPlay: true })
  } else if (event.key === 'End') {
    event.preventDefault()
    markUserInteraction()
    logSliderEvent('keydown', { key: event.key })
    void goToSlide(tracks.length - 1, { animate: true, autoPlay: true })
  }
}

function pauseTrack(index: number) {
  const el = audioRefs.value[index]
  if (!el) return
  try {
    el.pause()
  } catch {}
  logSliderEvent('pauseTrack', { index })
}

function pauseAllExcept(index: number) {
  logSliderEvent('pauseAllExcept', { index })
  audioRefs.value.forEach((_, currentIndex) => {
    if (currentIndex !== index) {
      pauseTrack(currentIndex)
    }
  })
}

function isTrackPlaying(index: number) {
  const el = audioRefs.value[index]
  return !!el && !el.paused
}

async function ensurePlaybackReady(index: number) {
  const ctx = ensureAudioContext()
  connectSource(index)
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {}
  }
  startHydraAudioLoop()
}

const MAX_PLAY_ATTEMPTS = 4

function waitMs(duration: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, duration)
  })
}

async function tryPlayUntilSuccess(el: HTMLAudioElement, requestId: number, attempt = 0): Promise<void> {
  if (requestId !== playRequestId) return
  try {
    const playPromise = el.play()
    if (playPromise && typeof playPromise.then === 'function') {
      await playPromise
    }
  } catch {}

  if (!el.paused || requestId !== playRequestId) {
    return
  }

  if (attempt >= MAX_PLAY_ATTEMPTS - 1) {
    return
  }

  await waitMs(250)
  await tryPlayUntilSuccess(el, requestId, attempt + 1)
}

async function playTrack(index: number, options: { userInitiated?: boolean } = {}) {
  const el = audioRefs.value[index]
  if (!el) return
  const requestId = ++playRequestId
  const userInitiated = options.userInitiated === true
  logSliderEvent('playTrack', { index, requestId, userInitiated })
  requestPreload(index)
  const ensurePromise = ensurePlaybackReady(index)

  let immediatePlaySuccess = false

  if (userInitiated) {
    try {
      const playResult = el.play()
      if (playResult && typeof playResult.then === 'function') {
        await playResult
      }
      immediatePlaySuccess = !el.paused
      if (immediatePlaySuccess) {
        logSliderEvent('immediatePlaySuccess', { index, requestId })
      }
    } catch (error: unknown) {
      logSliderEvent('immediatePlayError', { index, requestId, error })
    }
  }

  await ensurePromise
  if (requestId !== playRequestId) return

  if (userInitiated && immediatePlaySuccess && !el.paused) {
    return
  }

  await tryPlayUntilSuccess(el, requestId)
}

async function handlePlayButtonClick(index: number) {
  const el = audioRefs.value[index]
  if (!el) return
  markUserInteraction()
  logSliderEvent('playButtonClick', {
    index,
    isPlaying: isTrackPlaying(index),
  })
  if (index === INITIAL_SLIDE_INDEX) {
    hasInitialSlidePlayButtonBeenPressed.value = true
    unlockFirstSlideTapToPlayPrompt()
  }
  if (isTrackPlaying(index)) {
    pauseTrack(index)
    evaluateSlidePlaybackState(index)
    return
  }
  suppressNextTapToPlay = true
  hideTapToPlayMessage()
  if (firstPlayedSlideIndex.value === null) {
    firstPlayedSlideIndex.value = index
  }
  void goToSlide(index, { animate: true })
  pauseAllExcept(index)
  await playTrack(index, { userInitiated: true })
}

function setAudioRef(el: HTMLAudioElement | null, index: number) {
  audioRefs.value[index] = el
  if (!el) {
    setSlideLoadingState(index, false)
    disconnectSource(index)
    return
  }

  el.preload = 'metadata'
  el.loop = true
  ;(el as any).playsInline = true
  el.crossOrigin = 'anonymous'

  if (pendingPreloadIndices.has(index)) {
    requestPreload(index)
  }

  if (audioContext.value) {
    connectSource(index)
  }
}

function disconnectSource(index: number) {
  const source = sourceNodes.value[index]
  if (!source) return
  try { source.disconnect() } catch {}
  sourceNodes.value[index] = null
}

function connectSource(index: number) {
  const el = audioRefs.value[index]
  const ctx = ensureAudioContext()
  const master = masterGainNode.value
  if (!el || !ctx || !master) return
  if (sourceNodes.value[index]) return

  try {
    const source = ctx.createMediaElementSource(el)
    source.connect(master)
    sourceNodes.value[index] = source
  } catch {}
}

function configureAnalyser(ctx: AudioContext) {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.7
  analyserNode.value = analyser
  analyserDataArray = new Uint8Array(analyser.frequencyBinCount)

  const nyquist = ctx.sampleRate / 2
  const totalBins = analyser.frequencyBinCount
  const ranges: [number, number][] = [
    [20, 200],
    [200, 800],
    [800, 3200],
    [3200, nyquist],
  ]

  analyserBandIndices = ranges.map(([minFreq, maxFreq], index) => {
    const start = index === 0 ? 0 : Math.max(0, Math.floor((minFreq / nyquist) * totalBins))
    const endFreq = Math.max(minFreq, maxFreq)
    const end = index === ranges.length - 1
      ? totalBins
      : Math.min(totalBins, Math.ceil((endFreq / nyquist) * totalBins))
    return { start, end: Math.max(start + 1, end) }
  })
}

function connectMasterGain(ctx: AudioContext, master: GainNode) {
  const analyser = analyserNode.value
  try { master.disconnect() } catch {}
  if (analyser) {
    try { analyser.disconnect() } catch {}
    master.connect(analyser)
    analyser.connect(ctx.destination)
  } else {
    master.connect(ctx.destination)
  }
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (audioContext.value) {
    const ctx = audioContext.value
    if (!masterGainNode.value) {
      const master = ctx.createGain()
      master.gain.value = 1
      masterGainNode.value = master
      if (!analyserNode.value) {
        configureAnalyser(ctx)
      }
      connectMasterGain(ctx, master)
      sourceNodes.value.forEach((source) => {
        if (source) {
          try { source.connect(master) } catch {}
        }
      })
    } else if (!analyserNode.value) {
      configureAnalyser(ctx)
      connectMasterGain(ctx, masterGainNode.value)
    }
    return ctx
  }

  const AudioContextClass = (window.AudioContext ?? (window as any).webkitAudioContext) as
    | (new () => AudioContext)
    | undefined
  if (!AudioContextClass) return null

  const ctx = new AudioContextClass()
  audioContext.value = ctx

  const master = ctx.createGain()
  master.gain.value = 1
  masterGainNode.value = master
  configureAnalyser(ctx)
  connectMasterGain(ctx, master)
  startHydraAudioLoop()

  return ctx
}

async function handleAudioPlay(index: number) {
  logSliderEvent('audioPlay', { index })
  pauseAllExcept(index)
  await ensurePlaybackReady(index)
  hideTapToPlayMessage()
  if (!slideHasEverPlayed.value[index]) {
    slideHasEverPlayed.value[index] = true
  }
  if (firstPlayedSlideIndex.value === null) {
    firstPlayedSlideIndex.value = index
  }
  if (index === INITIAL_SLIDE_INDEX) {
    hasInitialSlidePlayButtonBeenPressed.value = true
    unlockFirstSlideTapToPlayPrompt()
  }
  if (activeSlideIndex.value !== index) {
    void goToSlide(index, { animate: true })
  }
}

function handleAudioLoadingStatus(index: number, isLoading: boolean, event: string) {
  logSliderEvent(isLoading ? 'audioLoading' : 'audioReady', { index, event })
  setSlideLoadingState(index, isLoading)
}

function handleAudioError(index: number) {
  logSliderEvent('audioError', { index })
  setSlideLoadingState(index, false)
}

function updateHydraBandTargets() {
  const analyser = analyserNode.value
  const data = analyserDataArray
  if (!analyser || !data) return

  analyser.getByteFrequencyData(data)
  analyserBandIndices.forEach((range, index) => {
    const { start, end } = range
    let sum = 0
    for (let i = start; i < end; i++) {
      sum += data[i]
    }
    const count = Math.max(1, end - start)
    const average = sum / (count * 255)
    const bandKey = (['low', 'lowMid', 'highMid', 'high'] as const)[index] ?? 'high'
    hydraAudioTargets[bandKey] = Math.min(1, Math.max(0, average))
  })
}

function smoothHydraBands(dtSec: number) {
  const alpha = 1 - Math.exp(-dtSec / HYDRA_AUDIO_TAU)
  ;(Object.keys(hydraAudioBands) as (keyof typeof hydraAudioBands)[]).forEach((band) => {
    const current = hydraAudioBands[band]
    const target = hydraAudioTargets[band]
    hydraAudioBands[band] = current + (target - current) * alpha
  })
}

function startHydraAudioLoop() {
  if (typeof window === 'undefined') return
  if (rafId !== null) return

  lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

  const step = (timestamp: number) => {
    const now = timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const dtSec = Math.min(0.25, Math.max(0, (now - lastFrameTime) / 1000))
    lastFrameTime = now

    updateHydraBandTargets()
    smoothHydraBands(dtSec)

    rafId = window.requestAnimationFrame(step)
  }

  rafId = window.requestAnimationFrame(step)
}

function stopHydraAudioLoop() {
  if (typeof window === 'undefined') return
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
}

function fitCanvas() {
  const el = canvasRef.value
  if (!el) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = el.getBoundingClientRect()
  const width = Math.max(1, Math.floor(rect.width * dpr))
  const height = Math.max(1, Math.floor(rect.height * dpr))

  if (lastCanvasSize && lastCanvasSize.width === width && lastCanvasSize.height === height) {
    return
  }

  el.width = width
  el.height = height
  lastCanvasSize = { width, height }

  if (hydra && typeof hydra.setResolution === 'function') {
    try {
      hydra.setResolution(width, height)
    } catch {}
  }
}

function handleWindowResize() {
  fitCanvas()
  refreshSliderLayout()
}

function setupCanvasResizeObserver(el: HTMLCanvasElement) {
  if (typeof window === 'undefined') return
  if (!('ResizeObserver' in window)) return

  const ResizeObserverConstructor = window.ResizeObserver as typeof ResizeObserver
  if (!canvasResizeObserver) {
    canvasResizeObserver = new ResizeObserverConstructor(() => {
      fitCanvas()
    })
  } else {
    canvasResizeObserver.disconnect()
  }

  canvasResizeObserver.observe(el)
}

async function initHydra() {
  if (hydra || typeof window === 'undefined') return
  const el = document.getElementById(canvasId) as HTMLCanvasElement | null
  if (!el) return
  canvasRef.value = el
  fitCanvas()
  setupCanvasResizeObserver(el)

  const mod: any = await import('hydra-synth')
  const Hydra = mod.default ?? mod.Hydra
  hydra = new Hydra({
    canvas: el,
    detectAudio: false,
    enableStreamCapture: false,
  })

  if (typeof hydra.setSmooth === 'function') {
    hydra.setSmooth(0.98)
  }

  const hydraBand = (band: keyof typeof hydraAudioBands, base: number, scale: number) =>
    () => base + hydraAudioBands[band] * scale

  const shimmerTones = () =>
    osc(
      () => 0.1 + hydraAudioBands.low * 1.4,
      () => 0.006 + hydraAudioBands.highMid * 0.04,
      () => 0.22 + hydraAudioBands.high * 0.45,
    )
      .color(
        hydraBand('low', 0.18, 1),
        hydraBand('lowMid', 0.24, 1),
        hydraBand('high', 0.32, 1),
      )
      .rotate(() => hydraAudioBands.lowMid * 0.45)
      .brightness(() => -0.08 + hydraAudioBands.high * 0.18)

  const auroraWash = () =>
    osc(
      () => hydraBand('low', 0.1, 1) + hydraBand('highMid',1,1000) + 1,
      0,
      () => 0.12 + hydraAudioBands.highMid * 0.4,
    )
      .color(
        hydraBand('high', 0.25, 1),
        hydraBand('highMid', 0.2, 1),
        hydraBand('low', 0.12, 1),
      )
      .rotate(() => hydraAudioBands.low * 0.35)
      .modulate(
        noise(
          () => 0.2 + hydraAudioBands.low,
          0,
        ),
        () => 0.12 + hydraAudioBands.high * 0.3,
      )

  const vaporField = () =>
    noise(1, 0)
      .color(
        hydraBand('low', 0.2, 2),
        hydraBand('lowMid', 0.28, 1),
        hydraBand('highMid', 0.34, 1.45),
      )
      .hue(() => hydraAudioBands.high * 0.18)
      .brightness(() => -0.22 + hydraAudioBands.high * 0.28)

  vaporField()
    .add(shimmerTones(), () => 0.25 + hydraAudioBands.highMid * 0.4)
    .blend(auroraWash(), () => 0.35 + hydraAudioBands.lowMid * 0.3)
    // .modulateRotate(
    //   noise(
    //     1,
    //     0,
    //   ),
    //   () => hydraAudioBands.high * 0.45,
    // )
    .contrast(() => 1.12 + hydraAudioBands.highMid * 0.8)
    .saturate(() => 1 + hydraAudioBands.high * 0.55)
    .modulate(o0, () => hydraBand('low',0,24) + hydraBand('highMid',0,240)) 
    .modulate(o0, () => hydraBand('low',0,24) + hydraBand('highMid',0,240)) 
    .modulate(o0, () => hydraBand('low',0,24) + hydraBand('highMid',0,240)) 
    .out(o0)
}

function scheduleHydraInit() {
  if (typeof window === 'undefined') return
  const idleCallback = (window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number }).requestIdleCallback
  if (typeof idleCallback === 'function') {
    idleCallback(() => {
      void initHydra()
    }, { timeout: 600 })
  } else {
    window.setTimeout(() => {
      void initHydra()
    }, 60)
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    try { enableMixWithOthers?.() } catch {}
    sliderGsap = gsap
    scheduleHydraInit()
    window.addEventListener('resize', handleWindowResize)
    startHydraAudioLoop()
    requestPreloadAround(activeSlideIndex.value)
    void nextTick(() => {
      const container = sliderContainerRef.value
      if (container && !isScrollCompleteListenerAttached) {
        container.addEventListener(
          SLIDER_SCROLL_COMPLETE_EVENT,
          handleSliderScrollComplete as EventListener
        )
        isScrollCompleteListenerAttached = true
      }
      handleWindowResize()
      refreshSliderLayout()
      evaluateSlidePlaybackState(activeSlideIndex.value)
    })
  }
})

onBeforeUnmount(() => {
  hideTapToPlayMessage()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize)
    if (wheelCooldownTimeout !== null) {
      window.clearTimeout(wheelCooldownTimeout)
      wheelCooldownTimeout = null
    }
  }

  if (sliderTween) {
    sliderTween.kill()
    sliderTween = null
  }

  const container = sliderContainerRef.value
  if (container && isScrollCompleteListenerAttached) {
    container.removeEventListener(
      SLIDER_SCROLL_COMPLETE_EVENT,
      handleSliderScrollComplete as EventListener
    )
    isScrollCompleteListenerAttached = false
  }

  wheelLocked = false
  sliderGsap = null
  pointerState.isPointerDown = false
  pointerState.pointerId = null
  pointerState.deltaX = 0
  pointerState.velocityX = 0

  stopHydraAudioLoop()

  audioRefs.value.forEach((audio) => {
    if (!audio) return
    try { audio.pause() } catch {}
  })

  sourceNodes.value.forEach((source, index) => {
    if (source) {
      try { source.disconnect() } catch {}
      sourceNodes.value[index] = null
    }
  })

  const master = masterGainNode.value
  if (master) {
    try { master.disconnect() } catch {}
    masterGainNode.value = null
  }

  const analyser = analyserNode.value
  if (analyser) {
    try { analyser.disconnect() } catch {}
    analyserNode.value = null
  }

  analyserDataArray = null
  analyserBandIndices = []

  const ctx = audioContext.value
  if (ctx) {
    try { ctx.close() } catch {}
    audioContext.value = null
  }

  if (canvasResizeObserver) {
    try { canvasResizeObserver.disconnect() } catch {}
    canvasResizeObserver = null
  }

  try { if (hydra && hydra.synth) hydra.synth.tick = () => {} } catch {}
  hydra = null
  canvasRef.value = null
  lastCanvasSize = null
})
</script>
