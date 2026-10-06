import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('forma-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Cache app files only. Supabase Auth and data requests always use the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
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
