import type { Cip0103Provider } from '../src/types.js';

type Listener = (...args: any[]) => void;

export interface FakeProviderOptions {
  /** Per-method handler. Anything not listed rejects with METHOD_NOT_FOUND, like the wallet does. */
  handlers?: Record<string, (params: unknown) => unknown>;
}

/**
 * Stands in for `window.wintipCantonProvider`.
 *
 * This is the seam the whole SDK is built around: everything except discovery takes a provider,
 * so the client and hooks are testable without a browser anywhere in sight.
 */
export class FakeProvider implements Cip0103Provider {
  readonly calls: Array<{ method: string; params?: unknown }> = [];
  private readonly handlers: Record<string, (params: unknown) => unknown>;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(options: FakeProviderOptions = {}) {
    this.handlers = options.handlers ?? {};
  }

  async request<T = unknown>(args: { method: string; params?: unknown }): Promise<T> {
    this.calls.push(args.params === undefined ? { method: args.method } : { method: args.method, params: args.params });
    const handler = this.handlers[args.method];
    if (!handler) {
      throw Object.assign(new Error(`Unknown method: ${args.method}`), { code: -32601 });
    }
    return (await handler(args.params)) as T;
  }

  on(event: string, listener: Listener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const listener of [...set]) listener(...args);
    return true;
  }

  /** How many listeners are attached — used to prove unsubscribe actually detaches. */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
