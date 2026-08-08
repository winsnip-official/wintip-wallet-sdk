import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { WintipClient } from '../client.js';
import { createWintipClient, type CreateWintipClientOptions } from '../index.js';

export type WintipStatus = 'discovering' | 'ready' | 'unavailable';

export interface WintipContextValue {
  /** Null until discovery finishes, and permanently null when the provider never showed up. */
  client: WintipClient | null;
  status: WintipStatus;
  /** Only set when discovery itself threw, which is rare and not the same as "not available". */
  error: Error | null;
  /** Re-run discovery. */
  retry: () => void;
}

const WintipContext = createContext<WintipContextValue | null>(null);

export interface WintipProviderProps extends CreateWintipClientOptions {
  children: ReactNode;
}

/**
 * Discovers Wintip once on mount and shares the client with the tree below.
 *
 * Discovery runs in an effect, so this renders identically on the server and during hydration —
 * `status` is `discovering` in both.
 */
export function WintipProvider({ children, ...options }: WintipProviderProps): JSX.Element {
  const [client, setClient] = useState<WintipClient | null>(null);
  const [status, setStatus] = useState<WintipStatus>('discovering');
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Options arrive as a fresh object each render; freezing the first value keeps the effect from
  // re-running discovery on every parent render.
  const optionsRef = useRef(options);

  useEffect(() => {
    let cancelled = false;
    setStatus('discovering');
    setError(null);

    createWintipClient(optionsRef.current)
      .then((discovered) => {
        if (cancelled) return;
        setClient(discovered);
        setStatus(discovered ? 'ready' : 'unavailable');
      })
      .catch((discoveryError: unknown) => {
        if (cancelled) return;
        setClient(null);
        setStatus('unavailable');
        setError(discoveryError instanceof Error ? discoveryError : new Error(String(discoveryError)));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<WintipContextValue>(
    () => ({ client, status, error, retry }),
    [client, status, error, retry],
  );

  return createElement(WintipContext.Provider, { value }, children);
}

/** Access the discovered client. Must be used inside {@link WintipProvider}. */
export function useWintip(): WintipContextValue {
  const value = useContext(WintipContext);
  if (!value) {
    throw new Error('useWintip must be used within a <WintipProvider>.');
  }
  return value;
}
