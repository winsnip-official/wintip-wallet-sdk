/**
 * The CIP-0103 surface as Wintip Wallet actually implements it (see
 * wallet.wintip.cc's own `wallet/lib/cip103/types.ts` and `rpcServer.ts`).
 *
 * Where Wintip diverges from the bare spec — or from what a typical wallet
 * implements — the divergence is encoded here rather than left for a dApp to
 * discover at runtime. Each one is called out in the README's "Quirks"
 * section too.
 */

/** CAIP-2 network identifier. Wintip only ever reports `canton:da-mainnet`. */
export type CantonNetworkId = `canton:${string}`;

export type AccountStatus = 'initializing' | 'allocated' | 'removed';

export interface WintipAccount {
  partyId: string;
  status: AccountStatus;
  /** Party hint — the portion of `partyId` before `::`. */
  hint: string;
  /** Always `''` — Wintip is custodial and holds no per-user signing key. */
  publicKey: string;
  /** Namespace — the portion of `partyId` after `::`. */
  namespace: string;
  networkId: CantonNetworkId | string;
  signingProviderId: string;
  /** Wintip only ever reports a single account, always primary. */
  primary: boolean;
  disabled: boolean;
}

export interface ProviderInfo {
  id: string;
  version: string;
  providerType: 'browser' | 'desktop' | 'mobile' | 'remote';
}

export interface ConnectResult {
  isConnected: boolean;
  isNetworkConnected: boolean;
  /** Present when `isConnected` is false, explaining why (e.g. `"unauthenticated"`). */
  reason?: string;
  networkReason?: string;
  userUrl?: string;
}

export interface StatusEvent {
  provider: ProviderInfo;
  connection: ConnectResult;
  network?: { networkId: CantonNetworkId | string };
}

export interface ActiveNetwork {
  networkId: CantonNetworkId | string;
  /**
   * Wintip never returns a ledger endpoint or an access token here: it does
   * not expose its backend session to a web page. Declared because the spec
   * allows them, absent in practice.
   */
  ledgerApi?: string;
  accessToken?: string;
}

export type TxStatus = 'pending' | 'executed' | 'failed';

export interface TxPendingEvent {
  status: 'pending';
  commandId: string;
}

/**
 * NOTE: `updateId`/`completionOffset` sit directly on the event (flat),
 * *not* nested under a `payload` field the way some other CIP-0103 wallets
 * shape it. `payload` is included and read defensively in case a future
 * Wintip release moves to the nested form — prefer the flat fields.
 */
export interface TxExecutedEvent {
  status: 'executed';
  commandId: string;
  updateId?: string;
  completionOffset?: number;
  payload?: { updateId?: string; completionOffset?: number };
}

export interface TxFailedEvent {
  status: 'failed';
  commandId: string;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Wintip never emits a `signed` event — `prepareExecute` goes straight from
 * `pending` to a terminal `executed`/`failed`, so that spec-allowed status is
 * intentionally not part of this union.
 */
export type TxChangedEvent = TxPendingEvent | TxExecutedEvent | TxFailedEvent;

/** Raw Daml commands to submit on the connected party's behalf. */
export interface PrepareExecuteParams {
  commands: unknown[];
  commandId?: string;
  /** Must be the connected party (or a subset). Any other party is rejected before it reaches the ledger. */
  actAs?: string[];
  readAs?: string[];
  disclosedContracts?: unknown[];
  synchronizerId?: string;
  packageIdSelectionPreference?: string[];
}

export interface PrepareExecuteResult {
  tx: TxExecutedEvent;
}

/**
 * Wintip's `ledgerApi` is a genuine proxy to the Canton JSON Ledger API v2,
 * scoped to the connected party — *not* a narrow read-only whitelist the way
 * some wallets implement it. `resource` is a Ledger API path such as
 * `"v2/state/active-contracts"`. Every call still shows the raw request in
 * the wallet's own approval UI and requires confirmation, even after the
 * one-time per-origin permission grant.
 */
export interface LedgerApiParams {
  requestMethod: 'get' | 'post' | 'patch' | 'put' | 'delete';
  resource: string;
  body?: unknown;
  query?: Record<string, string>;
  path?: Record<string, string>;
}

export interface LedgerApiResult {
  status: number;
  data: unknown;
}

/** Events Wintip pushes to a connected origin. */
export interface WintipEventMap {
  statusChanged: StatusEvent;
  accountsChanged: { accounts: WintipAccount[] };
  txChanged: TxChangedEvent;
}

export type WintipEventName = keyof WintipEventMap;

/** The CIP-0103 shaped object `wintip-provider.js` injects. */
export interface Cip0103Provider {
  request<T = unknown>(args: { method: string; params?: unknown }): Promise<T>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
  emit?(event: string, ...args: any[]): boolean;
}

/** Payload of the `canton:announceProvider` event. */
export interface AnnouncedWallet {
  id: string;
  name?: string;
  icon?: string;
}
