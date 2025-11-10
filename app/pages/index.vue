<template>
  <main class="main-page">
    <div v-if="overlayVisible" class="overlay">
      <div class="home-container">
        <div class="home-logo-container">
          <img class="home-logo" src="/images/logorondewa.png" alt="">
        </div>
        <button class="enter-button" type="button" @click="startSequence">ENTER</button>
      </div>
    </div>
    <canvas :id="canvasId" width="640" height="480"></canvas>
    <div class="link-frame">
      <a href="/label" rel="noopener noreferrer">
        label
      </a>
      <a href="/mixes" rel="noopener noreferrer">
        mixes
      </a>
      <!-- <a href="https://www.instagram.com/jordanxyolivier" target="_blank" rel="noopener noreferrer">
        @jordanxyolivier
      </a> -->
      <a href="https://www.instagram.com/ronde_label" target="_blank" rel="noopener noreferrer">
        @ronde_label
      </a>
      <!-- <a href="https://ronde.bandcamp.com" target="_blank" rel="noopener noreferrer">
        @bandcamp
      </a> -->
    </div>
    <a class="legal-link" href="/mentions-legales">Mentions légales</a>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { enableMixWithOthers } from '~/utils/iosAudioSession';

const overlayVisible = ref(true);
const canvasId = 'hydra-canvas';
const mousePosition = reactive({ x: 0.5, y: 0.5 });
const gyroscopeData = reactive({ alpha: 0.5, beta: 0.5, gamma: 0.5 });
const baselineOrientation = reactive({
  alpha: null as number | null,
  beta: null as number | null,
  gamma: null as number | null,
});
const isOrientationAuth = ref(false);

const toneRef = shallowRef<any>(null);
const playersRefX = shallowRef<any>(null);
const playersRefY = shallowRef<any>(null);
const currentSampleKeyX = ref<string | null>(null);
const currentSampleKeyY = ref<string | null>(null);
const audioActive = ref(false);

const scrollLockClass = 'no-vertical-scroll';

const applyScrollLock = () => {
  if (!isClient) {
    return;
  }

  document.documentElement.classList.add(scrollLockClass);
  document.body.classList.add(scrollLockClass);
};

const removeScrollLock = () => {
  if (!isClient) {
    return;
  }

  document.documentElement.classList.remove(scrollLockClass);
  document.body.classList.remove(scrollLockClass);
};

let orientationListener: ((event: DeviceOrientationEvent) => void) | null = null;
let hydraScript: HTMLScriptElement | null = null;
let toneScript: HTMLScriptElement | null = null;
let hydraAnimationFrame = 0;

const isClient = import.meta.client;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const orientationRanges = {
  alpha: 70,
  beta: 45,
  gamma: 45,
};

const normalizeCircularOffset = (value: number, baseline: number | null, range: number) => {
  if (baseline === null) {
    return 0.5;
  }
  const diff = ((((value - baseline) % 360) + 540) % 360) - 180;
  return clamp01((diff + range) / (range * 2));
};

const normalizeLinearOffset = (value: number, baseline: number | null, range: number) => {
  if (baseline === null) {
    return 0.5;
  }
  const diff = value - baseline;
  return clamp01((diff + range) / (range * 2));
};

const resetOrientationBaseline = () => {
  baselineOrientation.alpha = null;
  baselineOrientation.beta = null;
  baselineOrientation.gamma = null;
};

const isMobileDevice = () => {
  if (!isClient) {
    return false;
  }
  return /Mobi|Android/i.test(navigator.userAgent);
};

const handleMouseMove = (event: MouseEvent) => {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  mousePosition.x = clamp01(event.clientX / width);
  mousePosition.y = clamp01(event.clientY / height);
};

const handleOrientation = (event: DeviceOrientationEvent) => {
  const { alpha = 0, beta = 0, gamma = 0 } = event;

  if (baselineOrientation.alpha === null) {
    baselineOrientation.alpha = alpha;
  }
  if (baselineOrientation.beta === null) {
    baselineOrientation.beta = beta;
  }
  if (baselineOrientation.gamma === null) {
    baselineOrientation.gamma = gamma;
  }

  gyroscopeData.alpha = normalizeCircularOffset(alpha, baselineOrientation.alpha, orientationRanges.alpha);
  gyroscopeData.beta = normalizeLinearOffset(beta, baselineOrientation.beta, orientationRanges.beta);
  gyroscopeData.gamma = normalizeLinearOffset(gamma, baselineOrientation.gamma, orientationRanges.gamma);
};

const attachOrientationListener = () => {
  if (!isClient || orientationListener) {
    return;
  }
  orientationListener = (event: DeviceOrientationEvent) => handleOrientation(event);
  window.addEventListener('deviceorientation', orientationListener, true);
};

const detachOrientationListener = () => {
  if (!isClient || !orientationListener) {
    return;
  }
  window.removeEventListener('deviceorientation', orientationListener, true);
  orientationListener = null;
};

type PermissionState = 'granted' | 'denied' | 'default';

const requestPermissionIfAvailable = async (
  eventClass: { requestPermission?: () => Promise<PermissionState> } | undefined,
): Promise<PermissionState> => {
  if (eventClass && typeof eventClass.requestPermission === 'function') {
    try {
      return await eventClass.requestPermission();
    } catch (error) {
      console.error(error);
      return 'denied';
    }
  }
  return 'default';
};

const requestGyroPermission = async (): Promise<PermissionState> => {
  if (!isClient) {
    return 'denied';
  }

  const DeviceOrientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent | undefined;
  const DeviceMotion = window.DeviceMotionEvent as typeof DeviceMotionEvent | undefined;

  if (!DeviceOrientation) {
    isOrientationAuth.value = false;
    return 'denied';
  }

  const orientationStatus = await requestPermissionIfAvailable(DeviceOrientation);
  if (orientationStatus === 'granted') {
    attachOrientationListener();
    isOrientationAuth.value = true;
    return 'granted';
  }

  if (orientationStatus === 'denied') {
    isOrientationAuth.value = false;
    return 'denied';
  }

  const motionStatus = await requestPermissionIfAvailable(DeviceMotion);
  if (motionStatus === 'denied') {
    isOrientationAuth.value = false;
    return 'denied';
  }

  attachOrientationListener();
  isOrientationAuth.value = true;
  return 'granted';
};

const setupHydra = () => {
  if (!isClient) {
    return;
  }

  hydraScript = document.createElement('script');
  hydraScript.src = 'https://unpkg.com/hydra-synth@1.3.25/dist/hydra-synth.js';
  hydraScript.async = true;
  hydraScript.onload = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    const hydraGlobals = window as any;
    if (!canvas || !hydraGlobals.Hydra) {
      return;
    }

    const hydra = new hydraGlobals.Hydra({
      canvas,
      detectAudio: true,
    });

    hydraGlobals.a.setBins(8);
    hydraGlobals.a.setSmooth(0);
    if (typeof hydraGlobals.setResolution === 'function') {
      hydraGlobals.setResolution(1920, 1080);
    }
    hydraGlobals.speed = 0.0001;

    const fftThreshold = 0.05;
    const smoothFft = Array(8).fill(0);
    const smoothingFactor = 0.15;

    const updateSmoothedFft = () => {
      for (let i = 0; i < 8; i += 1) {
        const raw = hydraGlobals.a.fft[i] || 0;
        const value = raw > fftThreshold ? raw : 0;
        smoothFft[i] += (value - smoothFft[i]) * smoothingFactor;
      }
      hydraAnimationFrame = requestAnimationFrame(updateSmoothedFft);
    };

    updateSmoothedFft();

    hydraGlobals
      .osc(() => 4 + smoothFft[1] * 2, 0, 0)
      .modulateRotate(hydraGlobals.o0, () => smoothFft[0] * 0.5 + 1)
      .modulateKaleid(
        osc(
          () => 1 + hydraGlobals.a.fft[0] * 5 + hydraGlobals.a.fft[7] * 20,
          0,
          0,
        ),
        7,
      )
      .scale(1)
      .out();
  };

  document.body.appendChild(hydraScript);
};

const loadTone = () => {
  if (!isClient) {
    return Promise.reject(new Error('Tone can only be loaded in the browser.'));
  }

  if ((window as any).Tone) {
    toneRef.value = (window as any).Tone;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    toneScript = document.createElement('script');
    toneScript.src = 'https://unpkg.com/tone@14.8.49/build/Tone.js';
    toneScript.async = true;
    toneScript.onload = () => {
      toneRef.value = (window as any).Tone;
      resolve();
    };
    toneScript.onerror = () => reject(new Error('Failed to load Tone.js'));
    document.body.appendChild(toneScript);
  });
};

onMounted(async () => {
  if (!isClient) {
    return;
  }

  applyScrollLock();
  enableMixWithOthers();
  window.addEventListener('mousemove', handleMouseMove);

  try {
    await loadTone();
    const Tone = toneRef.value;

    if (!Tone) {
      throw new Error('Tone.js is not available.');
    }

    const sampleBankXEntries: Array<[string, string]> = [
      ['1x', '1x.mp3'],
      ['2x', '2x.mp3'],
      ['3x', '3x.mp3'],
      ['4x', '4x.mp3'],
      ['5x', '5x.mp3'],
      ['6x', '6x.mp3'],
      ['7x', '7x.mp3'],
      ['8x', '8x.mp3'],
      ['9x', '9x.mp3'],
      ['10x', '10x.mp3'],
    ];

    const sampleBankYEntries: Array<[string, string]> = [
      ['1y', '1y.mp3'],
      ['2y', '2y.mp3'],
      ['3y', '3y.mp3'],
      ['4y', '4y.mp3'],
      ['5y', '5y.mp3'],
      ['6y', '6y.mp3'],
      ['7y', '7y.mp3'],
      ['8y', '8y.mp3'],
      ['9y', '9y.mp3'],
      ['10y', '10y.mp3'],
    ];

    const createPlayerBank = async (entries: Array<[string, string]>, basePath: string) => {
      const urls = Object.fromEntries(entries.map(([key, file]) => [key, `${basePath}${file}`]));
      const players = new Tone.Players(urls).toDestination();
      await players.loaded;
      entries.forEach(([key]) => {
        const player = players.player(key);
        player.loop = true;
        player.autostart = false;
        player.fadeIn = 0.02;
        player.fadeOut = 0.3;
      });
      return players;
    };

    playersRefX.value = await createPlayerBank(sampleBankXEntries, '/samples/samplex/');
    playersRefY.value = await createPlayerBank(sampleBankYEntries, '/samples/sampley/');

    const selectSampleFromBank = (
      players: any,
      entries: Array<[string, string]>,
      currentKeyRef: { value: string | null },
      value: number,
    ) => {
      if (!players) {
        return;
      }
      const length = entries.length;
      if (length === 0) {
        return;
      }
      const scaledIndex = Math.floor(clamp01(value) * length);
      const index = Math.min(length - 1, scaledIndex);
      const [nextKey] = entries[index];
      if (!nextKey || currentKeyRef.value === nextKey) {
        return;
      }
      const now = toneRef.value?.now?.() ?? Tone.now();
      if (currentKeyRef.value) {
        const previousPlayer = players.player(currentKeyRef.value);
        previousPlayer.stop(now);
      }
      const player = players.player(nextKey);
      if (player) {
        player.start(now, 0);
        currentKeyRef.value = nextKey;
      }
    };

    const updateSampleSelection = () => {
      if (!audioActive.value) {
        return;
      }
      const controlX = isMobileDevice() ? gyroscopeData.beta : mousePosition.x;
      const controlY = isMobileDevice() ? gyroscopeData.alpha : mousePosition.y;
      selectSampleFromBank(playersRefX.value, sampleBankXEntries, currentSampleKeyX, controlX);
      selectSampleFromBank(playersRefY.value, sampleBankYEntries, currentSampleKeyY, controlY);
    };

    watch(
      () => [gyroscopeData.alpha, gyroscopeData.beta, mousePosition.x, mousePosition.y, audioActive.value],
      () => {
        updateSampleSelection();
      },
    );

    watch(audioActive, (active) => {
      if (active) {
        updateSampleSelection();
      } else {
        const now = toneRef.value?.now?.() ?? Tone.now();
        if (currentSampleKeyX.value && playersRefX.value) {
          playersRefX.value.player(currentSampleKeyX.value).stop(now);
        }
        if (currentSampleKeyY.value && playersRefY.value) {
          playersRefY.value.player(currentSampleKeyY.value).stop(now);
        }
        currentSampleKeyX.value = null;
        currentSampleKeyY.value = null;
      }
    });
  } catch (error) {
    console.error(error);
  }

  setupHydra();
});

onBeforeUnmount(() => {
  if (!isClient) {
    return;
  }

  removeScrollLock();
  window.removeEventListener('mousemove', handleMouseMove);
  detachOrientationListener();

  if (hydraScript && hydraScript.parentNode) {
    hydraScript.parentNode.removeChild(hydraScript);
    hydraScript = null;
  }

  if (toneScript && toneScript.parentNode) {
    toneScript.parentNode.removeChild(toneScript);
    toneScript = null;
  }

  if (hydraAnimationFrame) {
    cancelAnimationFrame(hydraAnimationFrame);
    hydraAnimationFrame = 0;
  }

  try {
    audioActive.value = false;
    currentSampleKeyX.value = null;
    currentSampleKeyY.value = null;
    playersRefX.value?.dispose?.();
    playersRefY.value?.dispose?.();
    playersRefX.value = null;
    playersRefY.value = null;
    toneRef.value?.Transport?.stop();
  } catch (error) {
    console.error(error);
  }
});

const startSequence = async () => {
  if (!toneRef.value) {
    return;
  }

  try {
    if (isMobileDevice()) {
      resetOrientationBaseline();
      const permission = await requestGyroPermission();
      if (permission !== 'granted') {
        console.warn('Permission refusée.');
        return;
      }
    }

    await toneRef.value.loaded();
    await toneRef.value.start();
    toneRef.value.Transport.start();
    audioActive.value = true;
    overlayVisible.value = false;
  } catch (error) {
    console.error(error);
  }
};
</script>
