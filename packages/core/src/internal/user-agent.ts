/**
 * Sent on every GitHub request. Node's fetch adds a User-Agent; Cloudflare
 * Workers' does not, and GitHub answers a request without one with a 403.
 */
export const USER_AGENT = "maple-kit";
