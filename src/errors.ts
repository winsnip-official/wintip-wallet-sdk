/**
 * Error model. Branch on `code`, never on `message` — wording changes between wallet releases,
 * codes do not.
 */

/** EIP-1193 codes. */
export const USER_REJECTED = 4001;
export const UNAUTHORIZED = 4100;
export const UNSUPPORTED_METHOD = 4200;
export const DISCONNECTED = 4900;

/** EIP-1474 / JSON-RPC codes. */
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const TRANSACTION_REJECTED = -32003;

export const WINTIP_ERROR_CODES = {
  USER_REJECTED,
  UNAUTHORIZED,
  UNSUPPORTED_METHOD,
  DISCONNECTED,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  INTERNAL_ERROR,
  TRANSACTION_REJECTED,
} as const;

export type WintipErrorCode = (typeof WINTIP_ERROR_CODES)[keyof typeof WINTIP_ERROR_CODES] | number;

/** An RPC failure carrying a stable numeric code. */
export class WintipRpcError extends Error {
  readonly code: WintipErrorCode;
  readonly data?: unknown;

  constructor(message: string, code: WintipErrorCode, data?: unknown) {
    super(message);
    this.name = 'WintipRpcError';
    this.code = code;
    if (data !== undefined) {
      this.data = data;
    }
    // Keeps `instanceof` working when the package is consumed as transpiled CJS.
    Object.setPrototypeOf(this, WintipRpcError.prototype);
  }
}

/** Raised when no Wintip provider could be found on the page. */
export class WintipNotFoundError extends Error {
  constructor(message = 'Wintip Wallet was not found on this page.') {
    super(message);
    this.name = 'WintipNotFoundError';
    Object.setPrototypeOf(this, WintipNotFoundError.prototype);
  }
}

export function isWintipRpcError(value: unknown): value is WintipRpcError {
  return value instanceof WintipRpcError;
}

/** True when the user explicitly declined the request (the connect prompt, or an individual approval). */
export function isUserRejection(value: unknown): boolean {
  return isWintipRpcError(value) && value.code === USER_REJECTED;
}

/**
 * True when the wallet has no authority to serve the request yet — either the origin has not been
 * connected, or the user is signed out of wallet.wintip.cc entirely. Both are recoverable by the
 * user, which is why they are worth telling apart from an internal fault.
 */
export function isUnauthorized(value: unknown): boolean {
  return isWintipRpcError(value) && value.code === UNAUTHORIZED;
}

/** True for a method the wallet deliberately does not implement (currently just `signMessage`). */
export function isUnsupportedMethod(value: unknown): boolean {
  return isWintipRpcError(value) && value.code === UNSUPPORTED_METHOD;
}

/** Normalizes anything thrown by the provider into a `WintipRpcError`. */
export function toWintipRpcError(value: unknown): WintipRpcError {
  if (isWintipRpcError(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as { message?: unknown; code?: unknown; data?: unknown };
    const message = typeof record.message === 'string' ? record.message : 'Wallet request failed.';
    const code = typeof record.code === 'number' ? record.code : INTERNAL_ERROR;
    return new WintipRpcError(message, code, record.data);
  }
  return new WintipRpcError(typeof value === 'string' ? value : 'Wallet request failed.', INTERNAL_ERROR);
}
