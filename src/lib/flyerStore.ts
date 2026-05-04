const KEY = "backstage:flyer";

export function saveFlyerDataUrl(dataUrl: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, dataUrl);
  } catch {
    // quota exceeded などは無視（モックなので）
  }
}

export function loadFlyerDataUrl(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function clearFlyerDataUrl() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
