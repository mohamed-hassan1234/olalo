import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connect, ensureSchema } from './db.js';
import { aggregate } from './services/aggregation.js';
import { runRetention } from './services/retention.js';

export async function start(env: NodeJS.ProcessEnv = process.env) {
  const cfg = loadConfig(env);
  const d = await connect(cfg.mongoUri, cfg.mongoDb);
  await ensureSchema(d);
  const app = createApp(d, cfg);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await aggregate(d);
      if (n) console.log(`[jobs] aggregated ${n} events`);
      await runRetention(d);
    } catch (e) {
      console.error('[jobs] failed', e);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, cfg.aggIntervalMs);
  timer.unref();

  const server = app.listen(cfg.port, () => console.log(`[api] listening on :${cfg.port} (${cfg.env}), db ${cfg.mongoDb}`));
  const shutdown = async () => {
    clearInterval(timer);
    server.close();
    await tick();
    await d.client.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return { server, d, cfg };
}
