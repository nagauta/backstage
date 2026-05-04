import type { Band } from "./bands";

const FLYER_KEY = "backstage:flyer";
const BANDS_KEY = "backstage:bands";

let cachedFlyer: string | null = null;
let flyerInitialized = false;

function readFlyerCached(): string | null {
  if (typeof window === "undefined") return null;
  if (!flyerInitialized) {
    cachedFlyer = sessionStorage.getItem(FLYER_KEY);
    flyerInitialized = true;
  }
  return cachedFlyer;
}

function subscribeFlyer(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === FLYER_KEY || e.key === null) {
      flyerInitialized = false;
      callback();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export const flyerStore = {
  subscribe: subscribeFlyer,
  getSnapshot: readFlyerCached,
  getServerSnapshot: (): string | null => null,
};

let cachedJson: string | null = null;
let cachedBands: Band[] | null = null;

function readBandsCached(): Band[] | null {
  if (typeof window === "undefined") return null;
  const json = sessionStorage.getItem(BANDS_KEY);
  if (json === cachedJson) return cachedBands;
  cachedJson = json;
  if (!json) {
    cachedBands = null;
    return null;
  }
  try {
    const parsed = JSON.parse(json) as Band[];
    cachedBands = Array.isArray(parsed) ? parsed : null;
  } catch {
    cachedBands = null;
  }
  return cachedBands;
}

function subscribeBands(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === BANDS_KEY || e.key === null) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export const bandsStore = {
  subscribe: subscribeBands,
  getSnapshot: readBandsCached,
  getServerSnapshot: (): Band[] | null => null,
};

export function saveFlyerDataUrl(dataUrl: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FLYER_KEY, dataUrl);
    flyerInitialized = false;
  } catch {
    // quota exceeded などは無視
  }
}

export function loadFlyerDataUrl(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(FLYER_KEY);
}

export function clearFlyerDataUrl() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FLYER_KEY);
}

export function saveBands(bands: Band[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BANDS_KEY, JSON.stringify(bands));
    // sessionStorage の同一タブ内変更は storage イベントが飛ばないので、cache を invalidate して
    // 次の getSnapshot で再読込されるようにする (subscribe は同一タブでは発火しない前提)
    cachedJson = null;
  } catch {
    // quota exceeded などは無視
  }
}

export function loadBands(): Band[] | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(BANDS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Band[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBands() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(BANDS_KEY);
}
