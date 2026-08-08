/**
 * wintip-wallet-sdk — connect a dApp to Wintip Wallet over CIP-0103.
 *
 * Zero runtime dependencies. Safe to import during SSR: nothing touches `window` at module scope.
 */

import { WintipClient, type WintipClientOptions } from './client.js';
import { WintipNotFoundError } from './errors.js';
import { type WaitOptions, getWintipProvider, waitForWintipProvider } from './discovery.js';

export { WintipClient, type WintipClientOptions } from './client.js';

export {
  ANNOUNCE_EVENT,
  REQUEST_EVENT,
  WINTIP_WALLET_URL,
  WINTIP_PROVIDER_SCRIPT_URL,
  type WaitOptions,
  getWintipProvider,
  injectWintipScript,
  isBrowser,
  waitForWintipProvider,
} from './discovery.js';

export {
  WINTIP_ERROR_CODES,
  WintipNotFoundError,
  WintipRpcError,
  type WintipErrorCode,
  isWintipRpcError,
  isUnauthorized,
  isUnsupportedMethod,
  isUserRejection,
  toWintipRpcError,
  DISCONNECTED,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  TRANSACTION_REJECTED,
  UNAUTHORIZED,
  UNSUPPORTED_METHOD,
  USER_REJECTED,
} from './errors.js';

export type {
  AccountStatus,
  ActiveNetwork,
  AnnouncedWallet,
  CantonNetworkId,
  Cip0103Provider,
  ConnectResult,
  LedgerApiParams,
  LedgerApiResult,
  PrepareExecuteParams,
  PrepareExecuteResult,
  ProviderInfo,
  StatusEvent,
  TxChangedEvent,
  TxExecutedEvent,
  TxFailedEvent,
  TxPendingEvent,
  TxStatus,
  WintipAccount,
  WintipEventMap,
  WintipEventName,
} from './types.js';

export interface CreateWintipClientOptions extends WintipClientOptions {
  /**
   * How long to wait for `wintip-provider.js` to finish running, in ms. Default 3000.
   *
   * Kept distinct from `timeoutMs` on purpose: one bounds discovery of the provider itself, the
   * other bounds a single request once connected, and collapsing them into one name makes both
   * unclear.
   */
  discoveryTimeoutMs?: number;
  /** See {@link WaitOptions.autoLoadScript}. Default true. */
  autoLoadScript?: boolean;
  signal?: AbortSignal;
}

function toWaitOptions(options: CreateWintipClientOptions): WaitOptions {
  const wait: WaitOptions = {};
  if (options.discoveryTimeoutMs !== undefined) wait.timeoutMs = options.discoveryTimeoutMs;
  if (options.autoLoadScript !== undefined) wait.autoLoadScript = options.autoLoadScript;
  if (options.signal !== undefined) wait.signal = options.signal;
  return wait;
}

/**
 * Load `wintip-provider.js` (if it isn't already on the page) and return a client once it's ready,
 * or `null` if it never shows up within `discoveryTimeoutMs`.
 *
 * Returns null during SSR too, so it is safe to call unconditionally in a component effect.
 */
export async function createWintipClient(
  options: CreateWintipClientOptions = {},
): Promise<WintipClient | null> {
  const provider = await waitForWintipProvider(toWaitOptions(options));
  return provider ? new WintipClient(provider, options) : null;
}

/**
 * Same as {@link createWintipClient}, but throws {@link WintipNotFoundError} when the provider
 * never appears. Use this when your flow doesn't need to distinguish "still loading" from "not
 * available" — e.g. a dedicated "Connect Wintip Wallet" button, rather than a picker that lists
 * every wallet it can find.
 */
export async function requireWintipClient(
  options: CreateWintipClientOptions = {},
): Promise<WintipClient> {
  const client = await createWintipClient(options);
  if (!client) {
    throw new WintipNotFoundError();
  }
  return client;
}

/** Synchronous variant: returns a client only if the provider is already present. Never injects the script. */
export function getWintipClient(options: WintipClientOptions = {}): WintipClient | null {
  const provider = getWintipProvider();
  return provider ? new WintipClient(provider, options) : null;
}
