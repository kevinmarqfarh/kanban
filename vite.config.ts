import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The deployed commit, shown in crash reports so an error can be traced to the exact build.
// `process` exists when Vite loads this file in Node; declared here so the app's tsconfig needs no Node types.
declare const process: { env: Record<string, string | undefined> }
const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'local'

export default defineConfig({
  define: { __FORMA_VERSION__: JSON.stringify(version) },
  plugins: [react(), {
    name: 'forma-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css|woff2?|png|svg)$/.test(name)).sort()
      const version = Date.now().toString(36)
      const paths = ['/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', ...assets.map(name => '/' + name)]
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'forma-shell-${version}';
const ASSETS = ${JSON.stringify(paths)};
// The cache must never be able to stop the app from starting. A cache lookup that fails or hangs (seen in
// Safari 15 when its storage gets into a bad state) falls back to the network after at most two seconds.
const fromCache = path => Promise.race([
  caches.open(CACHE).then(cache => cache.match(path)),
  new Promise(resolve => setTimeout(() => resolve(undefined), 2000)),
]).catch(() => undefined);
self.addEventListener('install', event => {
  // Take over at once, so a fix reaches a docked iPad that is never closed.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {}));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('forma-shell-') && key !== CACHE).map(key => caches.delete(key)))).catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Cache app files only. Supabase Auth and data requests always use the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await fromCache('/index.html')) || Response.error()));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(fromCache(url.pathname).then(cached => cached || fetch(request)));
  }
});
` })
    },
  }],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules\/@supabase/, priority: 20 },
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 15 },
            { name: 'drag-and-drop', test: /node_modules\/@dnd-kit/, priority: 10 },
          ],
        },
      },
    },
  },
})
