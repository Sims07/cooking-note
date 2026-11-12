import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'https://sims07.github.io';
const base = origin + '/cooking-note/';
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function createWorker(caches) {
  const handlers = {};
  const claimed = [];
  const self = {
    registration: { scope: base },
    location: { origin },
    clients: { async claim() { claimed.push(true); } },
    skipWaiting: async () => {},
    addEventListener(name, callback) { handlers[name] = callback; },
  };
  runInNewContext(swSource, { self, caches, URL, Promise, Response,
    Request: class { constructor(url) { this.url = url; } },
    fetch: async () => new Response('ok'),
  });
  return { handlers, claimed };
}

test('Saveurs & Notes PWA has its own manifest identity, distinct from other projects', () => {
  // Manifest identity resolves relative to the origin, not the manifest path.
  // Historically "./" yielded the origin root and collided with Companion.
  const resolved = new URL(manifest.id, origin + '/').href;
  assert.equal(resolved, origin + '/cooking-note/');
  assert.notEqual(resolved, origin + '/');
  assert.notEqual(resolved, origin + '/Companion-Correcteur-Devoir/');
  assert.equal(new URL(manifest.start_url, base).href, base);
  assert.equal(new URL(manifest.scope, base).href, base);
  assert.equal(manifest.display, 'standalone');
});

test('worker activates without deleting other PWA caches on the same GitHub Pages origin', async () => {
  const existing = [
    'saveurs-shell-v4',
    'saveurs-runtime-v3',
    'saveurs-shell-v5',
    'saveurs-runtime-v5',
    'companion-correcteur-shell-a1b2',
    'game-child-cache',
    'unrelated-cache',
  ];
  const deleted = [];
  const caches = {
    async keys() { return existing; },
    async delete(key) { deleted.push(key); return true; },
  };
  const { handlers, claimed } = createWorker(caches);
  assert.equal(typeof handlers.activate, 'function');
  let pending;
  handlers.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(deleted.sort(), ['saveurs-runtime-v3', 'saveurs-shell-v4'].sort());
  assert.equal(claimed.length, 1);
});

test('worker precaches Saveurs assets and keeps an offline cache', async () => {
  const writes = [];
  const caches = {
    async open(name) {
      return { async put(url, response) { writes.push({ name, url: String(url), status: response.status }); } };
    },
  };
  const { handlers } = createWorker(caches);
  assert.equal(typeof handlers.install, 'function');
  let pending;
  handlers.install({ waitUntil(promise) { pending = promise; } });
  await pending;
  const local = writes.filter((entry) => entry.url.startsWith('./'));
  assert.ok(local.length >= 7);
  assert.ok(local.some((entry) => entry.url === './manifest.webmanifest'));
  assert.ok(local.some((entry) => entry.url === './index.html'));
  assert.ok(writes.every((entry) => entry.name.startsWith('saveurs-shell-')));
});

test('worker does not handle non-GET requests or GitHub API, so user data stays live', () => {
  const { handlers } = createWorker({});
  const intercepted = [];
  function dispatch(url, method = 'GET', mode = 'cors') {
    handlers.fetch({
      request: { url, method, mode },
      respondWith(response) { intercepted.push(response); },
    });
  }
  dispatch(origin + '/cooking-note/', 'POST');
  dispatch('https://api.github.com/repos/Sims07/cooking-note/contents/recipes.json');
  assert.equal(intercepted.length, 0);
});
