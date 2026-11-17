// Cinderworks — tiny static dev server (Node 22, stdlib only).
// Serves the entry directory over HTTP so game/ can be played locally:
//   node serve.ts [port]   (default 8901, serves this script's directory)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8901);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ts': 'text/plain',
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(root, path === '/' ? 'game/index.html' : path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  if (statSync(file).isDirectory()) file = join(file, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
