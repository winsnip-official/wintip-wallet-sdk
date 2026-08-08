# wintip-wallet-sdk

Connect a dApp to [Wintip Wallet](https://wintip.cc) over **CIP-0103**, the Canton dApp standard.

- **Zero runtime dependencies.** Nothing is pulled into your bundle but this package.
- **SSR-safe.** Importing it on a server does nothing; every `window` access is guarded.
- **No HTML changes needed.** `createWintipClient()` loads Wintip's own connector script for you.
- **Typed end to end**, including the places where Wintip diverges from the bare spec.
- **Errors carry stable numeric codes.** Branch on `code`, never on message text.

You do **not** need this package to support Wintip. Wintip announces itself over
`canton:announceProvider`, so any CIP-0103 aggregator — [PartyLayer](https://partylayer.xyz), for
one — already reaches it with no wallet-specific code. Reach for this SDK when you want to talk to
Wintip directly, with types.

## Install

```bash
npm install wintip-wallet-sdk
```

## Quick start

```ts
import { createWintipClient, isUserRejection } from 'wintip-wallet-sdk';

const wintip = await createWintipClient();
if (!wintip) {
  // wintip-provider.js never showed up within the discovery window, or this is SSR.
  return;
}

try {
  await wintip.connect();
  const account = await wintip.getPrimaryAccount();
  console.log('connected as', account.partyId);
} catch (error) {
  if (isUserRejection(error)) {
    console.log('the user said no');
  } else {
    throw error;
  }
}
```

`createWintipClient()` injects `<script src="https://wallet.wintip.cc/wintip-provider.js">` itself
if it isn't already on the page, then waits for it to finish running — there is no HTML to hand-edit
first. If you'd rather add the tag yourself (e.g. it needs to appear in a specific place in your
`<head>`, or your CSP blocks programmatic `<script>` insertion), pass `autoLoadScript: false`.

## React

```tsx
import { WintipProvider, useWintipAccount, useConnect } from 'wintip-wallet-sdk/react';

function App() {
  return (
    <WintipProvider>
      <Wallet />
    </WintipProvider>
  );
}

function Wallet() {
  const { isConnected, account, networkId } = useWintipAccount();
  const { connect, isConnecting, error } = useConnect();

  if (!isConnected) {
    return (
      <>
        <button onClick={() => connect()} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : 'Connect Wintip Wallet'}
        </button>
        {error && <p>Error {error.code}: {error.message}</p>}
      </>
    );
  }

  return <p>{account?.partyId} on {networkId}</p>;
}
```

React is an **optional** peer dependency. The core entry point never imports it.

## API

### Discovery

| Function | Returns |
|---|---|
| `createWintipClient(options?)` | `Promise<WintipClient \| null>` — null when the provider never shows up, or during SSR |
| `requireWintipClient(options?)` | `Promise<WintipClient>` — throws `WintipNotFoundError` instead |
| `getWintipClient(options?)` | `WintipClient \| null`, synchronous, only if already injected — never loads the script |
| `getWintipProvider()` | the raw CIP-0103 provider, or null |
| `injectWintipScript()` | inserts the `<script>` tag if it isn't already present; a no-op otherwise |
| `waitForWintipProvider(options?)` | resolves once `window.wintipCantonProvider` exists, or null on timeout |

Options: `discoveryTimeoutMs` (default 3000) bounds discovery; `timeoutMs` (default 240 000) bounds
a single request afterwards. They are separate on purpose — one waits for the script to finish
loading and running, the other waits for the user to answer a prompt inside the wallet.

### Client

```ts
client.connect()                          // → ConnectResult, prompts the user
client.disconnect()
client.isConnected()                      // never prompts
client.status()                           // → StatusEvent, answers before connecting
client.getActiveNetwork()                 // → { networkId: 'canton:da-mainnet' }
client.listAccounts()                     // → WintipAccount[] (0 or 1 entries)
client.getPrimaryAccount()                // → the account that will sign; throws 4100 if not connected
client.prepareExecute(params)             // fire-and-forget submit; resolves before execution finishes
client.prepareExecuteAndWait(params)      // submit and resolve with the terminal txChanged payload
client.ledgerApi({ requestMethod, resource, body?, query?, path? })  // proxied Ledger API v2 call
client.request(method, params?)           // escape hatch, still normalizes errors
client.on(event, handler)                 // → unsubscribe function
client.once(event, handler)
```

There is no `client.signMessage()`. Wintip is fully custodial and holds no per-user signing key to
produce a verifiable signature with — see Quirks below.

### Events

`statusChanged`, `accountsChanged`, `txChanged` — all typed through `WintipEventMap`.

```ts
const off = client.on('txChanged', (event) => {
  if (event.status === 'executed') console.log(event.updateId);
});
```

### Errors

Every rejection is a `WintipRpcError` with a numeric `code`.

| Code | Meaning |
|---|---|
| `4001` | user rejected the request |
| `4100` | unauthorized — origin not connected, **or** the user is signed out of wallet.wintip.cc entirely |
| `4200` | method not supported (currently just `signMessage`) |
| `-32601` | method not found |
| `-32602` | invalid params |
| `-32603` | internal error, including an approval that timed out |

```ts
import { isUserRejection, isUnauthorized, isUnsupportedMethod, UNAUTHORIZED } from 'wintip-wallet-sdk';
```

## Quirks

Wintip's surface differs from a typical CIP-0103 wallet in a few places. Each one is encoded in the
types, but they are worth knowing.

**No `signMessage`.** Wintip is fully custodial — there is no per-user signing key on the client
side to produce a verifiable signature with. Calling `client.request('signMessage', { message })`
directly always rejects with code `4200`; this SDK doesn't expose a wrapper for it so you never have
to find that out at runtime.

**`prepareExecuteAndWait` needs no client-side event correlation.** Some wallets only expose a
fire-and-forget submit, forcing an SDK to watch for the `pending` event a call triggers and follow
its `commandId` to find the matching terminal event — fragile if two submissions overlap. Wintip's
own RPC supports a synchronous wait variant natively, so `prepareExecuteAndWait()` just unwraps the
response directly. Concurrent submissions from the same page are safe.

**`prepareExecute` only accepts raw Daml commands.** There is no convenience "simple transfer"
shape — `{ commands: [...] }` is the only input. `actAs`/`readAs` can only ever name the connected
party; naming anyone else is rejected before it reaches the ledger.

**`ledgerApi` is a real Ledger API proxy, not a narrow whitelist.** `resource` is a Canton JSON
Ledger API v2 path such as `"v2/state/active-contracts"`, scoped to the connected party. Every call
— like `prepareExecute` — still shows the raw request in Wintip's own approval UI and requires
confirmation, even after the one-time per-origin permission grant the two capabilities share.

**Mainnet only.** Wintip reports `canton:da-mainnet` and does not implement network switching.

**Discovery isn't extension-based.** There is no browser extension and no content script racing
page load. `wintip-provider.js` is a plain script tag that publishes `window.wintipCantonProvider`
once it finishes running — this SDK can load that script itself (see Install above), which a
wallet-extension SDK has no equivalent for.

**`canton:announceProvider` fires once, eagerly, at script load** — Wintip's connector does not
currently listen for `canton:requestProvider` and re-announce on demand the way a fully spec-compliant
EIP-6963-style provider would. A listener attached after the script has already run will miss it.
This SDK's own discovery never depends on that handshake — it polls `window.wintipCantonProvider`
directly — but if you're building your own aggregator-style discovery, attach your
`canton:announceProvider` listener *before* `wintip-provider.js` loads, not after.

## Session restore

Wintip implements `status`, `isConnected` and `getPrimaryAccount` without prompting, so a page
reload can restore a session silently: call `status()`, and if `connection.isConnected` is true the
session is live. The React bindings do this for you in `useWintipAccount`.

## Security

- The SDK never sees a PIN, a passkey, or a password. It speaks `postMessage` to a hidden iframe
  pointed at `wallet.wintip.cc/bridge`, which does all approval and confirmation behind its own UI.
- Every request has a ceiling, so a wallet that stops answering surfaces an error instead of hanging
  your UI forever.
- No dynamic code evaluation beyond the one `<script src>` tag this SDK can optionally insert (the
  same tag you could add to your HTML yourself), and no runtime dependencies.

## License

MIT. See [LICENSE](./LICENSE).
