// Zero-dependency static server for the exported site (local preview and e2e tests).
// Applies the same security headers as public/_headers. Usage: node scripts/serve.mjs out 3000
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 3000);
const api = process.env.API_ORIGIN ?? 'http://localhost:4000';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.png': 'image/png', '.ico': 'image/x-icon',
};
const headers = {
  'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${api}; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag': 'noindex, nofollow',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let p = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) p = join(root, '404.html');
  const status = p.endsWith('404.html') && !url.pathname.endsWith('404.html') ? 404 : 200;
  res.writeHead(status, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream', ...headers });
  createReadStream(p).pipe(res);
}).listen(port, () => console.log(`[serve] ${root} on http://localhost:${port}`));
