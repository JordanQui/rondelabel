<template>
  <main class="patch-page">
    <div v-if="overlayVisible" class="overlay">
      <div class="home-container">
        <div class="home-logo-container">
          <img class="home-logo" src="/images/logorondewa.png" alt="" />
        </div>
        <button class="enter-button" type="button" @click="startGyroscope">
          ENTER
        </button>
      </div>
    </div>
    <ClientOnly>
      <section ref="canvasContainer" class="canvas-panel"></section>
    </ClientOnly>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

type PermissionState = "pending" | "granted" | "denied";

type OrientationAxes = {
  alpha: number;
  beta: number;
  gamma: number;
};

const isClient = import.meta.client;

const permissionStatus = ref<PermissionState>("pending");
const canvasContainer = ref<HTMLElement | null>(null);
const overlayVisible = ref(true);

const orientation = reactive<OrientationAxes>({
  alpha: 0,
  beta: 0,
  gamma: 0,
});

let orientationListener: ((event: DeviceOrientationEvent) => void) | null =
  null;
let p5Instance: any = null;
let p5Script: HTMLScriptElement | null = null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const wrap = (value: number, max: number) => ((value % max) + max) % max;

const normalizeAxisToUnit = (value: number, min: number, max: number) => {
  const clamped = clamp(value, min, max);
  return (clamped - min) / (max - min);
};

const colorChannels = computed(() => {
  const x = normalizeAxisToUnit(orientation.beta ?? 0, -90, 90);
  const y = normalizeAxisToUnit(orientation.gamma ?? 0, -90, 90);
  const wrappedAlpha = wrap(orientation.alpha ?? 0, 360);
  const z = normalizeAxisToUnit(wrappedAlpha, 0, 360);

  return {
    r: Math.round(x * 255),
    g: Math.round(y * 255),
    b: Math.round(z * 255),
  };
});

const handleOrientation = (event: DeviceOrientationEvent) => {
  orientation.alpha = event.alpha ?? orientation.alpha;
  orientation.beta = event.beta ?? orientation.beta;
  orientation.gamma = event.gamma ?? orientation.gamma;
};

const attachOrientationListener = () => {
  if (!isClient || orientationListener) {
    return;
  }

  orientationListener = (event: DeviceOrientationEvent) =>
    handleOrientation(event);
  window.addEventListener("deviceorientation", orientationListener, true);
};

const detachOrientationListener = () => {
  if (!isClient || !orientationListener) {
    return;
  }

  window.removeEventListener("deviceorientation", orientationListener, true);
  orientationListener = null;
};

const setupP5 = () => {
  if (!isClient || p5Instance || !canvasContainer.value) {
    return;
  }

  const sketch = (p: any) => {
    const getSize = () => {
      const parent = canvasContainer.value;
      if (!parent) {
        return { width: window.innerWidth, height: window.innerHeight };
      }
      return { width: parent.clientWidth, height: parent.clientHeight };
    };

    p.setup = () => {
      const { width, height } = getSize();
      p.createCanvas(width, height);
      p.noStroke();
    };

    p.windowResized = () => {
      const { width, height } = getSize();
      p.resizeCanvas(width, height);
    };

    p.draw = () => {
      const { r, g, b } = colorChannels.value;
      p.background(r, g, b);
    };
  };

  const P5 = (window as any).p5;
  try {
    p5Instance = new P5(sketch, canvasContainer.value);
  } catch (error: any) {
    console.error(error);
  }
};

const loadP5Script = () =>
  new Promise<void>((resolve, reject) => {
    if (!isClient) {
      reject(new Error("Client uniquement"));
      return;
    }

    if ((window as any).p5) {
      resolve();
      return;
    }

    p5Script = document.createElement("script");
    p5Script.src = "https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js";
    p5Script.async = true;
    p5Script.onload = () => resolve();
    p5Script.onerror = () => reject(new Error("Chargement de p5 impossible"));
    document.head.appendChild(p5Script);
  });

const initializeP5 = async () => {
  try {
    await loadP5Script();
    setupP5();
  } catch (error: any) {
    console.error(error);
  }
};

type RequestableEventClass = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

const requestPermissionIfAvailable = async (
  eventClass: RequestableEventClass | undefined,
) => {
  if (eventClass && typeof eventClass.requestPermission === "function") {
    try {
      return await eventClass.requestPermission();
    } catch (error) {
      console.error(error);
      return "denied" as const;
    }
  }
  return "default" as const;
};

const detectPermissionFlow = () => {
  if (!isClient) {
    return;
  }

  const DeviceOrientation = window.DeviceOrientationEvent as
    | typeof DeviceOrientationEvent
    | undefined;
  const DeviceMotion = window.DeviceMotionEvent as
    | typeof DeviceMotionEvent
    | undefined;
  if (!DeviceOrientation) {
    permissionStatus.value = "denied";
    overlayVisible.value = false;
    return;
  }

  const orientationRequestable =
    typeof DeviceOrientation.requestPermission === "function";
  const motionRequestable =
    typeof DeviceMotion?.requestPermission === "function";

  if (!orientationRequestable && !motionRequestable) {
    permissionStatus.value = "granted";
    attachOrientationListener();
    overlayVisible.value = false;
  }
};

const requestGyroPermission = async (): Promise<"granted" | "denied"> => {
  if (!isClient) {
    permissionStatus.value = "denied";
    return "denied";
  }

  const DeviceOrientation = window.DeviceOrientationEvent as
    | typeof DeviceOrientationEvent
    | undefined;
  const DeviceMotion = window.DeviceMotionEvent as
    | typeof DeviceMotionEvent
    | undefined;

  if (!DeviceOrientation) {
    permissionStatus.value = "denied";
    return "denied";
  }

  const orientationStatus = await requestPermissionIfAvailable(DeviceOrientation);
  if (orientationStatus === "granted") {
    permissionStatus.value = "granted";
    attachOrientationListener();
    return "granted";
  }

  if (orientationStatus === "denied") {
    permissionStatus.value = "denied";
    return "denied";
  }

  const motionStatus = await requestPermissionIfAvailable(DeviceMotion);
  if (motionStatus === "denied") {
    permissionStatus.value = "denied";
    return "denied";
  }

  permissionStatus.value = "granted";
  attachOrientationListener();
  return "granted";
};

const startGyroscope = async () => {
  if (permissionStatus.value === "granted") {
    overlayVisible.value = false;
    return;
  }

  const status = await requestGyroPermission();
  if (status === "granted") {
    overlayVisible.value = false;
  }
};

onMounted(() => {
  detectPermissionFlow();
  initializeP5();
});

onBeforeUnmount(() => {
  detachOrientationListener();

  if (p5Instance && typeof p5Instance.remove === "function") {
    p5Instance.remove();
    p5Instance = null;
  }

  if (p5Script && p5Script.parentNode) {
    p5Script.parentNode.removeChild(p5Script);
    p5Script = null;
  }
});
</script>

<style scoped>
.patch-page {
  min-height: 100vh;
  margin: 0;
  padding: 0;
  background: #000;
  position: relative;
}

.canvas-panel {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background: #000;
}

.canvas-panel canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
