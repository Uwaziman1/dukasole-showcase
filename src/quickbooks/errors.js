export class AppError extends Error {
  constructor(status, code, message, metadata = {}) {
    super(message); this.status = status; this.code = code; this.metadata = metadata;
  }
}
export function upstreamError(error, operation) {
  // Never serialize SDK errors: they can contain request credentials, codes and tokens.
  const json = error?.authResponse?.json;
  const status = Number(error?.authResponse?.response?.status || error?.response?.status ||
    (/^\d{3}$/.test(String(error?.code)) ? error.code : 0));
  const tid = error?.intuit_tid || error?.intuitTid;
  const metadata = /^[a-zA-Z0-9-]{1,128}$/.test(tid || '') ? { intuitTid: tid } : {};
  if (error?.error === 'invalid_grant' || json?.error === 'invalid_grant')
    return new AppError(401, 'RECONNECT_REQUIRED', 'Authorization expired or was revoked. Connect again.', metadata);
  if (status === 401 || error?.code === 'UNAUTHORIZED')
    return new AppError(401, 'UPSTREAM_UNAUTHORIZED', 'Intuit rejected authorization. Refresh or connect again.', metadata);
  if (status === 403)
    return new AppError(403, 'UPSTREAM_FORBIDDEN', 'Check requested scopes and sandbox company/Payments access.', metadata);
  if (status === 429 || error?.code === 'RATE_LIMIT_EXCEEDED')
    return new AppError(429, 'UPSTREAM_RATE_LIMIT', 'Intuit rate limit reached. Try later; do not blindly resubmit charges.', metadata);
  if (status === 400)
    return new AppError(422, 'UPSTREAM_VALIDATION', 'Intuit rejected the request. Check sandbox credentials, callback or Payments token.', metadata);
  return new AppError(502, 'UPSTREAM_FAILURE', operation + ' failed. Inspect the Intuit dashboard before retrying a charge.', metadata);
}
