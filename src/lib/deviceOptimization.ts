/**
 * Device optimization utility tailored for low-spec hardware such as
 * school Android Smart Boards (1GB - 2GB RAM), mobile phones, and tablets.
 */

export interface DeviceProfile {
  isLowEnd: boolean;
  isAndroid: boolean;
  isTouchDevice: boolean;
  isSmartBoard: boolean;
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
}

export function getDeviceProfile(): DeviceProfile {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isLowEnd: false,
      isAndroid: false,
      isTouchDevice: false,
      isSmartBoard: false,
    };
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const userAgent = nav.userAgent || "";
  const isAndroid = /android/i.test(userAgent);
  const isTouchDevice = (nav.maxTouchPoints && nav.maxTouchPoints > 0) || "ontouchstart" in window;
  const deviceMemory = nav.deviceMemory;
  const hardwareConcurrency = nav.hardwareConcurrency;

  // School Android smart boards often identify as Android with high screen resolution (1080p, 4K)
  // but report low RAM (<= 2GB) and low concurrency (<= 4 cores).
  const isLargeScreen = typeof window !== "undefined" && window.innerWidth >= 1200;
  const isSmartBoard = isAndroid && isTouchDevice && isLargeScreen;

  const isLowEnd =
    (deviceMemory !== undefined && deviceMemory <= 2) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4 && isAndroid) ||
    (isAndroid && isLargeScreen); // Android smart boards usually run on budget SoCs

  return {
    isLowEnd,
    isAndroid,
    isTouchDevice,
    isSmartBoard,
    deviceMemoryGb: deviceMemory,
    hardwareConcurrency,
  };
}

/**
 * Returns optimal debounce delay in milliseconds for serializing and storing
 * canvas state to localStorage / Firestore.
 * Prevents UI thread stuttering during active freehand pen / hand drawing on 1GB RAM devices.
 */
export function getOptimalSaveDebounceMs(): number {
  const profile = getDeviceProfile();
  if (profile.isLowEnd) {
    return 1000; // 1s debounce on low-spec smart boards
  }
  return 300; // 300ms on desktop / high-end hardware
}

/**
 * Returns optimal interval for background network health checking
 * (e.g. Code Server status polling in IframePanel).
 */
export function getHealthCheckIntervalMs(): number {
  const profile = getDeviceProfile();
  if (profile.isLowEnd) {
    return 60000; // 60s on low-spec devices to minimize network & CPU wakeups
  }
  return 15000; // 15s on normal devices
}
