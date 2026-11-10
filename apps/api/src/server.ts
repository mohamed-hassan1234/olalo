import { start } from './bootstrap.js';

start().catch((e) => {
  console.error('[api] failed to start:', e instanceof Error ? e.message : e);
  process.exit(1);
});
