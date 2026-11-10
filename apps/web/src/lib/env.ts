/** Public API base URL, baked in at build time. Empty string disables analytics and feedback sending. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
