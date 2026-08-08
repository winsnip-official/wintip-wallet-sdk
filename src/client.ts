import { toWintipRpcError, WintipRpcError, INTERNAL_ERROR } from './errors.js';
import type {
  ActiveNetwork,
  Cip0103Provider,
  WintipAccount,
  ConnectResult,
  LedgerApiParams,
  PrepareExecuteParams,
  PrepareExecuteResult,
  StatusEvent,
  TxChangedEvent,
  WintipEventMap,
  WintipEventName,
} from './types.js';

export interface WintipClientOptions {
  /**
   * Ceiling on a single request, in ms. Default 240 000.
   *
   * Deliberately generous: `connect`, `prepareExecute` and `ledgerApi` all show an interactive
   * approval screen (with a PIN/passkey step) inside the wallet's own frame, and this has to outlast
   * a real person taking their time on it — it is a backstop for a provider that never answers at
   * all, not a second deadline racing the user. Pass 0 to disable and rely entirely on the provider.
   */
  timeoutMs?: number;
}

type Unsubscribe = () => void;

const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * Typed client over a CIP-0103 provider.
 *
 * Construct it with any provider object — the one `wintip-provider.js` injects, or a fake in a
 * test. The provider is the only seam this class touches, which is what makes it testable without a
 * browser anywhere in sight.
 */
export class WintipClient {
  readonly provider: Cip0103Provider;
  private readonly timeoutMs: number;

  constructor(provider: Cip0103Provider, options: WintipClientOptions = {}) {
    this.provider = provider;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Escape hatch for methods this SDK does not wrap. Errors are normalized either way. */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const call = params === undefined
      ? this.provider.request<T>({ method })
      : this.provider.request<T>({ method, params });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.timeoutMs <= 0) {
        return await call;
      }
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new WintipRpcError(`Wallet did not answer "${method}" in time.`, INTERNAL_ERROR));
        }, this.timeoutMs);
      });
      return await Promise.race([call, timeout]);
    } catch (error) {
      throw toWintipRpcError(error);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  /**
   * Ask the user to connect this origin. Opens Wintip's approval prompt (in the hidden bridge
   * iframe, expanded into view) and resolves once they answer — rejects with code 4001 if they
   * decline, or 4100 if they aren't signed in to wallet.wintip.cc at all.
   */
  connect(): Promise<ConnectResult> {
    return this.request<ConnectResult>('connect');
  }

  disconnect(): Promise<void> {
    return this.request<void>('disconnect');
  }

  /** Non-interactive check. Never opens a prompt. */
  isConnected(): Promise<ConnectResult> {
    return this.request<ConnectResult>('isConnected');
  }

  /** Identity, connection and network probe. Answers before connecting — never prompts. */
  status(): Promise<StatusEvent> {
    return this.request<StatusEvent>('status');
  }

  getActiveNetwork(): Promise<ActiveNetwork> {
    return this.request<ActiveNetwork>('getActiveNetwork');
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  /** Always at most one entry — Wintip holds a single custodial account per user. */
  listAccounts(): Promise<WintipAccount[]> {
    return this.request<WintipAccount[]>('listAccounts');
  }

  /**
   * The account that will sign.
   *
   * Unlike some wallets this never resolves `null` for a connected origin — Wintip always has
   * exactly one account once you're connected. It rejects with code 4100 instead if the origin
   * isn't connected yet; call {@link WintipClient.connect} first.
   */
  getPrimaryAccount(): Promise<WintipAccount> {
    return this.request<WintipAccount>('getPrimaryAccount');
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  /**
   * Submit raw Daml commands on the connected party's behalf.
   *
   * Fire-and-forget: resolves once the wallet has accepted the request, before it finishes
   * executing. Watch the `txChanged` event for the terminal outcome, or use
   * {@link WintipClient.prepareExecuteAndWait} to await it directly.
   */
  prepareExecute(params: PrepareExecuteParams): Promise<void> {
    return this.request<void>('prepareExecute', params);
  }

  /**
   * `prepareExecute`, but resolves once the command has actually finished — with the terminal
   * `txChanged` payload (`{ tx: { status, updateId, ... } }`) as the return value.
   *
   * Wintip's own RPC supports this natively (`prepareExecuteAndWait`), so unlike wallets that only
   * expose a fire-and-forget submit, there is no client-side event correlation here — no risk of two
   * concurrent submissions from the same page getting mixed up.
   */
  async prepareExecuteAndWait(params: PrepareExecuteParams): Promise<TxChangedEvent> {
    const result = await this.request<PrepareExecuteResult>('prepareExecuteAndWait', params);
    return result.tx;
  }

  // ── Ledger reads/writes ─────────────────────────────────────────────────────

  /**
   * Proxies a Canton JSON Ledger API v2 request, scoped to the connected party — e.g.
   * `{ requestMethod: 'get', resource: 'v2/state/active-contracts', query: {...} }`. Every call
   * shows the raw request in Wintip's own approval UI and requires confirmation, even after the
   * one-time per-origin permission grant `prepareExecute`/`ledgerApi` share.
   */
  ledgerApi<T = unknown>(params: LedgerApiParams): Promise<{ status: number; data: T }> {
    return this.request<{ status: number; data: T }>('ledgerApi', params);
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /** Subscribe to a wallet event. Returns an unsubscribe function. */
  on<E extends WintipEventName>(event: E, handler: (payload: WintipEventMap[E]) => void): Unsubscribe {
    const listener = (...args: unknown[]) => {
      handler(args[0] as WintipEventMap[E]);
    };
    this.provider.on(event, listener);
    return () => {
      this.provider.removeListener(event, listener);
    };
  }

  /** Subscribe until the first event, then unsubscribe. */
  once<E extends WintipEventName>(event: E, handler: (payload: WintipEventMap[E]) => void): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }
}
