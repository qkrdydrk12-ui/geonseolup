export interface TaxSettings {
  taxMode: string;
  dependents?: number;
}

let cachedPromise: Promise<TaxSettings | null> | null = null;
let cacheTime = 0;
const CACHE_MS = 4000;

export function fetchTaxSettings(): Promise<TaxSettings | null> {
  const now = Date.now();
  if (cachedPromise && now - cacheTime < CACHE_MS) {
    return cachedPromise;
  }
  cacheTime = now;
  cachedPromise = fetch('/api/auth/tax-settings')
    .then((res) => res.json())
    .catch(() => null);
  return cachedPromise;
}

export function invalidateTaxSettingsCache() {
  cachedPromise = null;
}
