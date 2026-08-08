import { describe, expect, it } from 'vitest';

import { WintipClient } from '../src/client.js';
import { WintipRpcError, USER_REJECTED, UNAUTHORIZED, isUnauthorized, isUserRejection } from '../src/errors.js';
import { FakeProvider } from './fake-provider.js';

describe('WintipClient', () => {
  it('connects and returns the connection result', async () => {
    const provider = new FakeProvider({
      handlers: { connect: () => ({ isConnected: true, isNetworkConnected: true }) },
    });
    const client = new WintipClient(provider);

    await expect(client.connect()).resolves.toEqual({ isConnected: true, isNetworkConnected: true });
    expect(provider.calls).toEqual([{ method: 'connect' }]);
  });

  it('getPrimaryAccount rejects with 4100 rather than resolving null when unauthorized', async () => {
    const provider = new FakeProvider({
      handlers: {
        getPrimaryAccount: () => {
          throw Object.assign(new Error('Not signed in to Wintip Wallet'), { code: UNAUTHORIZED });
        },
      },
    });

    const error = await new WintipClient(provider).getPrimaryAccount().catch((e: unknown) => e);
    expect(isUnauthorized(error)).toBe(true);
  });

  it('preserves the numeric code of a rejection', async () => {
    const provider = new FakeProvider({
      handlers: {
        connect: () => {
          throw Object.assign(new Error('User rejected the connection request'), { code: USER_REJECTED });
        },
      },
    });

    const error = await new WintipClient(provider).connect().catch((e: unknown) => e);
    expect(isUserRejection(error)).toBe(true);
    expect(isUnauthorized(error)).toBe(false);
    expect((error as WintipRpcError).code).toBe(USER_REJECTED);
  });

  it('normalizes an unknown throw into an internal error rather than leaking it', async () => {
    const provider = new FakeProvider({
      handlers: {
        status: () => {
          throw 'kaboom';
        },
      },
    });

    const error = await new WintipClient(provider).status().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WintipRpcError);
    expect((error as WintipRpcError).code).toBe(-32603);
  });

  it('times out a provider that never answers', async () => {
    const provider = new FakeProvider({ handlers: { status: () => new Promise(() => {}) } });
    const client = new WintipClient(provider, { timeoutMs: 20 });

    const error = await client.status().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WintipRpcError);
    expect((error as WintipRpcError).message).toContain('status');
  });

  it('unsubscribes event listeners', () => {
    const provider = new FakeProvider();
    const client = new WintipClient(provider);

    const unsubscribe = client.on('txChanged', () => {});
    expect(provider.listenerCount('txChanged')).toBe(1);
    unsubscribe();
    expect(provider.listenerCount('txChanged')).toBe(0);
  });

  it('once() detaches after the first event', () => {
    const provider = new FakeProvider();
    const client = new WintipClient(provider);
    const seen: unknown[] = [];

    client.once('txChanged', (event) => seen.push(event));
    provider.emit('txChanged', { status: 'pending', commandId: 'a' });
    provider.emit('txChanged', { status: 'pending', commandId: 'b' });

    expect(seen).toHaveLength(1);
    expect(provider.listenerCount('txChanged')).toBe(0);
  });

  it('accountsChanged carries { accounts } rather than a bare array', () => {
    const provider = new FakeProvider();
    const client = new WintipClient(provider);
    const seen: { accounts: unknown[] }[] = [];

    client.on('accountsChanged', (event) => seen.push(event));
    provider.emit('accountsChanged', { accounts: [{ partyId: 'p::1', primary: true }] });

    expect(seen).toEqual([{ accounts: [{ partyId: 'p::1', primary: true }] }]);
  });

  it('ledgerApi forwards the request verbatim — no narrow resource whitelist', async () => {
    const provider = new FakeProvider({
      handlers: { ledgerApi: () => ({ status: 200, data: { active: true } }) },
    });
    const params = { requestMethod: 'get' as const, resource: 'v2/state/active-contracts', query: { limit: '10' } };
    const result = await new WintipClient(provider).ledgerApi(params);

    expect(provider.calls[0]).toEqual({ method: 'ledgerApi', params });
    expect(result).toEqual({ status: 200, data: { active: true } });
  });

  describe('prepareExecuteAndWait', () => {
    it('unwraps { tx } directly — no client-side event correlation needed', async () => {
      const provider = new FakeProvider({
        handlers: {
          prepareExecuteAndWait: () => ({
            tx: { status: 'executed', commandId: 'cmd-1', updateId: 'update-9', completionOffset: 0 },
          }),
        },
      });

      const result = await new WintipClient(provider).prepareExecuteAndWait({ commands: [{ some: 'command' }] });

      expect(result).toEqual({ status: 'executed', commandId: 'cmd-1', updateId: 'update-9', completionOffset: 0 });
      // Unlike a fire-and-forget-only wallet, this never touches the event bus.
      expect(provider.listenerCount('txChanged')).toBe(0);
    });

    it('surfaces a failed transaction as a terminal result, not a throw', async () => {
      const provider = new FakeProvider({
        handlers: {
          prepareExecuteAndWait: () => ({
            tx: { status: 'failed', commandId: 'cmd-2', error: { code: -32003, message: 'Transaction rejected' } },
          }),
        },
      });

      const result = await new WintipClient(provider).prepareExecuteAndWait({ commands: [{ some: 'command' }] });
      expect(result.status).toBe('failed');
    });
  });

  describe('prepareExecute (fire-and-forget)', () => {
    it('resolves once accepted, before execution finishes', async () => {
      const provider = new FakeProvider({ handlers: { prepareExecute: () => null } });
      await expect(
        new WintipClient(provider).prepareExecute({ commands: [{ some: 'command' }] }),
      ).resolves.toBeNull();
    });
  });
});
