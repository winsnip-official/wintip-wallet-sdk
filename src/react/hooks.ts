import { useCallback, useEffect, useRef, useState } from 'react';

import { toWintipRpcError, isUnauthorized, type WintipRpcError } from '../errors.js';
import type {
  WintipAccount,
  WintipEventMap,
  WintipEventName,
  PrepareExecuteParams,
  TxChangedEvent,
} from '../types.js';
import { useWintip } from './context.js';

/** Subscribe to a wallet event for the lifetime of the component. */
export function useWintipEvent<E extends WintipEventName>(
  event: E,
  handler: (payload: WintipEventMap[E]) => void,
): void {
  const { client } = useWintip();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!client) return;
    return client.on(event, (payload) => handlerRef.current(payload));
  }, [client, event]);
}

export interface UseWintipAccountResult {
  isConnected: boolean;
  /** The account that will sign, or null when disconnected. */
  account: WintipAccount | null;
  accounts: WintipAccount[];
  networkId: string | null;
  isLoading: boolean;
  error: WintipRpcError | null;
  refresh: () => void;
}

/**
 * Live account state.
 *
 * Reads `status` first and only asks for accounts once connected — an unauthorized origin is a
 * normal state here, not an error, so it surfaces as `isConnected: false` rather than a throw.
 * Stays current by following `statusChanged` and `accountsChanged`.
 */
export function useWintipAccount(): UseWintipAccountResult {
  const { client } = useWintip();
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<WintipAccount[]>([]);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<WintipRpcError | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!client) {
      setIsConnected(false);
      setAccounts([]);
      setNetworkId(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const status = await client.status();
        if (cancelled) return;
        setNetworkId(status.network?.networkId ?? null);

        const connected = status.connection?.isConnected === true;
        setIsConnected(connected);

        if (!connected) {
          setAccounts([]);
          return;
        }

        const list = await client.listAccounts();
        if (cancelled) return;
        setAccounts(list);
      } catch (thrown) {
        if (cancelled) return;
        const rpcError = toWintipRpcError(thrown);
        if (isUnauthorized(rpcError)) {
          setIsConnected(false);
          setAccounts([]);
        } else {
          setError(rpcError);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, tick]);

  useWintipEvent('accountsChanged', (next) => {
    setAccounts(next.accounts);
    setIsConnected(next.accounts.length > 0);
  });

  useWintipEvent('statusChanged', (status) => {
    setIsConnected(status.connection?.isConnected === true);
    setNetworkId(status.network?.networkId ?? null);
  });

  const account = accounts.find((candidate) => candidate.primary) ?? accounts[0] ?? null;

  return { isConnected, account, accounts, networkId, isLoading, error, refresh };
}

interface AsyncAction<Args extends unknown[], Result> {
  isPending: boolean;
  error: WintipRpcError | null;
  reset: () => void;
  run: (...args: Args) => Promise<Result>;
}

function useAsyncAction<Args extends unknown[], Result>(
  action: ((...args: Args) => Promise<Result>) | null,
): AsyncAction<Args, Result> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<WintipRpcError | null>(null);

  const reset = useCallback(() => setError(null), []);

  const run = useCallback(
    async (...args: Args): Promise<Result> => {
      if (!action) {
        throw new Error('Wintip Wallet is not available.');
      }
      setIsPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (thrown) {
        const rpcError = toWintipRpcError(thrown);
        setError(rpcError);
        throw rpcError;
      } finally {
        setIsPending(false);
      }
    },
    [action],
  );

  return { isPending, error, reset, run };
}

export function useConnect() {
  const { client } = useWintip();
  const { run, isPending, error, reset } = useAsyncAction(
    client ? () => client.connect() : null,
  );
  return { connect: run, isConnecting: isPending, error, reset };
}

export function useDisconnect() {
  const { client } = useWintip();
  const { run, isPending, error, reset } = useAsyncAction(
    client ? () => client.disconnect() : null,
  );
  return { disconnect: run, isDisconnecting: isPending, error, reset };
}

/**
 * Submit a transaction and resolve with its terminal `txChanged` payload, so the `updateId` is in
 * hand without wiring an event listener yourself.
 */
export function useSubmitTransaction() {
  const { client } = useWintip();
  const { run, isPending, error, reset } = useAsyncAction<[PrepareExecuteParams], TxChangedEvent>(
    client ? (params: PrepareExecuteParams) => client.prepareExecuteAndWait(params) : null,
  );
  return { submitTransaction: run, isSubmitting: isPending, error, reset };
}
