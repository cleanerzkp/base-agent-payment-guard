export type OnchainErrorCode =
  | 'BUSY'
  | 'DEPLOYMENT_INVALID'
  | 'INVALID_INPUT'
  | 'MISSING_BUILDER_SUFFIX'
  | 'NOT_CONNECTED'
  | 'RECEIPT_INVALID'
  | 'ROLE_DENIED'
  | 'SESSION_STALE'
  | 'SNAPSHOT_STALE'
  | 'USER_REJECTED'
  | 'WALLET_ERROR';

export class OnchainError extends Error {
  override readonly name = 'OnchainError';

  constructor(readonly code: OnchainErrorCode, message: string) {
    super(message);
  }
}

export function normalizeOnchainError(error: unknown): OnchainError {
  if (error instanceof OnchainError) return error;

  const record = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
  const code = record?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return new OnchainError('USER_REJECTED', 'The wallet request was rejected. No transaction was sent.');
  }

  return new OnchainError('WALLET_ERROR', 'The wallet or RPC request failed. Check the wallet and try again.');
}
