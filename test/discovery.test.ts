import { afterEach, describe, expect, it } from 'vitest';

import {
  WINTIP_PROVIDER_SCRIPT_URL,
  getWintipProvider,
  injectWintipScript,
  isBrowser,
  waitForWintipProvider,
} from '../src/discovery.js';
import { createWintipClient, getWintipClient, requireWintipClient } from '../src/index.js';
import { WintipNotFoundError } from '../src/errors.js';
import { FakeProvider } from './fake-provider.js';

function inject(provider: unknown): void {
  (window as unknown as Record<string, unknown>).wintipCantonProvider = provider;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).wintipCantonProvider;
  document.querySelectorAll(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`).forEach((el) => el.remove());
});

describe('discovery', () => {
  it('reports a browser environment under the test DOM', () => {
    expect(isBrowser()).toBe(true);
  });

  it('returns null when nothing is injected', () => {
    expect(getWintipProvider()).toBeNull();
    expect(getWintipClient()).toBeNull();
  });

  it('ignores an object that does not implement the provider surface', () => {
    inject({ request: () => {} });
    expect(getWintipProvider()).toBeNull();
  });

  it('ignores window.canton — this SDK only trusts the dedicated wintipCantonProvider slot', () => {
    (window as unknown as Record<string, unknown>).canton = new FakeProvider();
    try {
      expect(getWintipProvider()).toBeNull();
    } finally {
      delete (window as unknown as Record<string, unknown>).canton;
    }
  });

  it('finds an injected provider', () => {
    const provider = new FakeProvider();
    inject(provider);
    expect(getWintipProvider()).toBe(provider);
    expect(getWintipClient()?.provider).toBe(provider);
  });

  it('resolves immediately when the provider is already present', async () => {
    const provider = new FakeProvider();
    inject(provider);
    await expect(waitForWintipProvider({ timeoutMs: 5_000 })).resolves.toBe(provider);
  });

  it('injects the provider script tag exactly once when autoLoadScript is on', () => {
    expect(document.querySelector(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`)).toBeNull();
    injectWintipScript();
    injectWintipScript();
    expect(document.querySelectorAll(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`)).toHaveLength(1);
  });

  it('does not duplicate a script tag the dApp already added itself', () => {
    const manual = document.createElement('script');
    manual.src = WINTIP_PROVIDER_SCRIPT_URL;
    document.head.appendChild(manual);

    injectWintipScript();
    expect(document.querySelectorAll(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`)).toHaveLength(1);
  });

  it('waitForWintipProvider auto-injects the script by default', async () => {
    const wait = waitForWintipProvider({ timeoutMs: 30 });
    expect(document.querySelector(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`)).not.toBeNull();
    await wait;
  });

  it('skips injection when autoLoadScript is false', async () => {
    await waitForWintipProvider({ timeoutMs: 30, autoLoadScript: false });
    expect(document.querySelector(`script[src="${WINTIP_PROVIDER_SCRIPT_URL}"]`)).toBeNull();
  });

  it('picks up the provider once it appears mid-poll, simulating the script finishing execution', async () => {
    const provider = new FakeProvider();
    const wait = waitForWintipProvider({ timeoutMs: 2_000, autoLoadScript: false });
    setTimeout(() => inject(provider), 75);
    await expect(wait).resolves.toBe(provider);
  });

  it('gives up after the timeout when the wallet is absent', async () => {
    await expect(waitForWintipProvider({ timeoutMs: 30, autoLoadScript: false })).resolves.toBeNull();
    await expect(createWintipClient({ discoveryTimeoutMs: 30, autoLoadScript: false })).resolves.toBeNull();
  });

  it('requireWintipClient throws WintipNotFoundError when absent', async () => {
    await expect(
      requireWintipClient({ discoveryTimeoutMs: 30, autoLoadScript: false }),
    ).rejects.toBeInstanceOf(WintipNotFoundError);
  });
});
