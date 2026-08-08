import type { Cip0103Provider } from './types.js';

export const ANNOUNCE_EVENT = 'canton:announceProvider';
export const REQUEST_EVENT = 'canton:requestProvider';

/** Where `wintip-provider.js` publishes its provider — set unconditionally, unlike the shared `window.canton` slot it also claims (only if nothing else got there first). */
const INJECTION_PATH = 'wintipCantonProvider';

export const WINTIP_WALLET_URL = 'https://wallet.wintip.cc';
export const WINTIP_PROVIDER_SCRIPT_URL = `${WINTIP_WALLET_URL}/wintip-provider.js`;

/** True when running in a browser. Every entry point guards on this so SSR imports are safe. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

function looksLikeProvider(value: unknown): value is Cip0103Provider {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.request === 'function'
    && typeof candidate.on === 'function'
    && typeof candidate.removeListener === 'function';
}

/**
 * The injected provider, if `wintip-provider.js` has already run.
 *
 * Deliberately reads only `window.wintipCantonProvider`, never the shared `window.canton` slot:
 * this SDK exists to talk to Wintip specifically, and that slot can belong to whichever wallet's
 * script ran first on the page. Returns null during SSR — never throws.
 */
export function getWintipProvider(): Cip0103Provider | null {
  if (!isBrowser()) {
    return null;
  }
  const candidate = (window as unknown as Record<string, unknown>)[INJECTION_PATH];
  return looksLikeProvider(candidate) ? candidate : null;
}

function hasWintipScriptTag(): boolean {
  return document.querySelector(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`) !== null;
}

/**
 * Injects `<script src="https://wallet.wintip.cc/wintip-provider.js">` if it is not already on the
 * page. A no-op if the dApp already added the tag itself (either convention works — this just
 * saves having to hand-edit an HTML template).
 *
 * Safe to call more than once; only ever inserts one tag. Does nothing outside a browser.
 */
export function injectWintipScript(): void {
  if (!isBrowser() || hasWintipScriptTag()) {
    return;
  }
  const script = document.createElement('script');
  script.src = WINTIP_PROVIDER_SCRIPT_URL;
  document.head.appendChild(script);
}

export interface WaitOptions {
  /** How long to wait for the provider to appear, in ms. Default 3000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Insert the `<script>` tag automatically if it is missing. Default true. Set to false if your
   * CSP blocks programmatic `<script>` insertion (e.g. a `script-src` policy without the wallet's
   * host, or a Trusted Types policy) — add the tag to your HTML yourself in that case.
   */
  autoLoadScript?: boolean;
}

/**
 * Wait for `wintip-provider.js` to finish running and publish its provider.
 *
 * Resolves as soon as `window.wintipCantonProvider` is present. With `autoLoadScript` (the
 * default), this injects the script itself if it isn't already on the page, so a bare
 * `await waitForWintipProvider()` works with no HTML changes at all.
 */
export function waitForWintipProvider(options: WaitOptions = {}): Promise<Cip0103Provider | null> {
  const { timeoutMs = 3000, signal, autoLoadScript = true } = options;

  if (!isBrowser()) {
    return Promise.resolve(null);
  }

  const immediate = getWintipProvider();
  if (immediate) {
    return Promise.resolve(immediate);
  }

  if (autoLoadScript) {
    injectWintipScript();
  }

  return new Promise((resolve) => {
    const started = Date.now();

    const finish = (provider: Cip0103Provider | null) => {
      clearInterval(poll);
      signal?.removeEventListener('abort', onAbort);
      resolve(provider);
    };

    const onAbort = () => finish(getWintipProvider());

    const poll = setInterval(() => {
      const provider = getWintipProvider();
      if (provider || Date.now() - started >= timeoutMs) {
        finish(provider);
      }
    }, 50);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
