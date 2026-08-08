/**
 * React bindings for wintip-wallet-sdk.
 *
 * Imported as `wintip-wallet-sdk/react`. React is an optional peer dependency — the core entry
 * point does not touch it, so a non-React dApp never pulls this in.
 */

export {
  WintipProvider,
  useWintip,
  type WintipContextValue,
  type WintipProviderProps,
  type WintipStatus,
} from './context.js';

export {
  useConnect,
  useDisconnect,
  useWintipAccount,
  useWintipEvent,
  useSubmitTransaction,
  type UseWintipAccountResult,
} from './hooks.js';
