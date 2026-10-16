/** Only an actual authentication rejection can end a local session. */
export function isAuthRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  return error.status === 401 || error.status === 403;
}

export class AuthSessionChangedError extends Error {
  constructor() {
    super('Authentication session changed.');
    this.name = 'AuthSessionChangedError';
  }
}

export const CONNECTED_RECOVERY_MESSAGE =
  'Connect once to confirm your account before recording under it. Your saved local data is still on this device.';
