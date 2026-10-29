/*
 * Copyright 2021-2026 TTBT Enterprises LLC
 *
 * This file is part of c2FmZQ (https://c2FmZQ.org/).
 *
 * c2FmZQ is free software: you can redistribute it and/or modify it under the
 * terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * c2FmZQ is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * c2FmZQ. If not, see <https://www.gnu.org/licenses/>.
 */

import { VERSION, DEVEL } from './version.mjs';
import { Lang } from './lang.mjs';

console.log(`SW Version ${VERSION}`, DEVEL ? 'DEVEL' : '');

const MANIFEST = [
  'c2fmzq.webmanifest',
  'c2.png',
  'c2-bg.png',
  'c2-144x144.png',
  'clear.png',
  'index.html',
  'lang.mjs',
  'main.mjs',
  'pwa.wasm',
  'style.css',
  'ui.mjs',
  'version.mjs',
  'wasm_exec.js',
  'thirdparty/browser-libs.js',
  'thirdparty/filerobot-image-editor.min.js',
  'icons/arrow-left.svg',
  'icons/arrow-right.svg',
  'icons/grid.svg',
  'icons/info.svg',
  'icons/list.svg',
  'icons/plus.svg',
  'icons/refresh-cw.svg',
  'icons/settings.svg',
  'icons/trash-2.svg',
  'icons/user.svg',
  'icons/x.svg',
];

for (const lang of Object.keys(Lang.supported)) {
  MANIFEST.push(`lang/${lang}.json`);
  MANIFEST.push(`lang/filerobot/${lang}.json`);
}

function makeResponse(data) {
  if (!data || data.body === undefined || data.body === null) {
    return new Response('Internal Server Error', {status: 500, statusText: 'Internal Server Error'});
  }
  try {
    return new Response(data.body, data.options);
  } catch (err) {
    if (data.body instanceof ReadableStream) {
      data.body.cancel(err);
    }
    console.error('makeResponse failed:', err);
    return new Response('Internal Server Error', {status: 500, statusText: 'Internal Server Error'});
  }
}

// Pending stream/ requests, keyed by a random id, waiting for the page to
// post back a response.
const appStreams = new Map();

// Store keys handed over by a page that is about to unload, keyed by a random
// one-time id, so that the page that replaces it can pick them up without
// prompting for the passphrase. A key is kept in memory only, and is dropped
// when it is retrieved, when it expires, or when the service worker is
// terminated by the browser.
const savedKeys = new Map();
const SAVED_KEY_TTL_MS = 60000;

function saveKey(id, key) {
  if (typeof id !== 'string' || typeof key !== 'string' || !id || !key) {
    return;
  }
  const old = savedKeys.get(id);
  if (old) {
    clearTimeout(old.timer);
  }
  const timer = setTimeout(() => savedKeys.delete(id), SAVED_KEY_TTL_MS);
  savedKeys.set(id, {key, timer});
}

function takeKey(id) {
  const s = savedKeys.get(id);
  if (!s) {
    return null;
  }
  savedKeys.delete(id);
  clearTimeout(s.timer);
  return s.key;
}

function randomStreamId() {
  const bytes = new Uint8Array(16);
  self.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('install', event => {
  if (DEVEL) {
    console.log(`SW install ${VERSION} DEVEL`);
    event.waitUntil(self.skipWaiting());
    return;
  }
  console.log(`SW install ${VERSION}`);
  event.waitUntil(
    self.caches.open(VERSION)
      .then(c => c.addAll(MANIFEST))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log(`SW activate ${VERSION}`, DEVEL ? 'DEVEL' : '');
  event.waitUntil(
    self.caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => (DEVEL || k !== VERSION) && k !== 'local')
            .map(k => self.caches.delete(k))
      ))
      .then(r => console.log('SW cache deletes', r))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  switch (event.data?.type) {
    case 'saveKey':
      saveKey(event.data.id, event.data.key);
      return;
    case 'getKey': {
      // The key is only ever sent back on the private port provided by the
      // requester.
      const port = event.ports?.[0];
      if (port) {
        port.postMessage({key: takeKey(event.data.id)});
      }
      return;
    }
    default:
      break;
  }
  const id = event.data?.streamId;
  if (!id) return;
  const s = appStreams.get(id);
  // Only accept the response from the client that made the request.
  if (s && event.source?.id === s.clientId) {
    appStreams.delete(id);
    s.resolve(event.data);
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }
  const reqUrl = event.request.url.replace(/#.*$/, '');
  if (!reqUrl.startsWith(self.registration.scope)) {
    return;
  }
  const url = new URL(reqUrl);
  const scope = new URL(self.registration.scope);
  let rel = url.pathname.slice(scope.pathname.length);
  if (rel === '') {
    rel = 'index.html';
  }
  if (MANIFEST.includes(rel)) {
    event.respondWith(
      self.caches.match(rel, {cacheName: VERSION}).then(resp => {
        if (resp) return resp;
        console.log(`SW fetch ${rel}, no cache`);
        return fetch(event.request);
      })
    );
    return;
  }
  if (!rel.startsWith('stream/')) {
    return;
  }
  const id = randomStreamId();
  event.respondWith(new Promise(async resolve => {
    let c = event.clientId ? await self.clients.get(event.clientId) : null;
    if (!c && event.request.mode === 'navigate') {
      const list = await self.clients.matchAll({type: 'window'});
      if (list.length > 0) {
        c = list[0];
      }
    }
    if (!c) {
      resolve(new Response('client not found', {status: 404, statusText: 'Not Found'}));
      return;
    }
    const timeoutId = setTimeout(() => {
      appStreams.delete(id);
      resolve(new Response('client did not respond in time', {status: 504, statusText: 'Gateway Timeout'}));
    }, 30000);
    appStreams.set(id, {
      clientId: c.id,
      resolve: data => {
        clearTimeout(timeoutId);
        resolve(makeResponse(data));
      },
    });
    c.postMessage({
      streamId: id,
      url: event.request.url,
      range: event.request.headers.get('Range') || '',
    });
  }));
});

console.log(`SW loaded ${VERSION}`);
