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

/* jshint -W060 */
/* jshint -W126 */

import './wasm_exec.js';
import { VERSION, SAMEORIGIN, DEVEL } from './version.mjs';
import { Lang, _T } from './lang.mjs';
import { UI } from './ui.mjs';

if (!('serviceWorker' in navigator)) {
  document.open();
  document.write('service workers are not supported');
  document.close();
}
/* jshint +W060 */

if (SAMEORIGIN) {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'content-security-policy';
  meta.content = "connect-src 'self';";
  document.head.appendChild(meta);
}

const wasmReady = new Promise(resolve => {
  window.__c2fmzqWasmReady = resolve;
});
const go = new Go();
WebAssembly.instantiateStreaming(fetch('pwa.wasm'), go.importObject)
  .then(r => go.run(r.instance));

async function startApp() {
  console.log(`Version ${VERSION}`, DEVEL ? 'DEVEL' : '');
  await Lang.init();
  const wasm = await wasmReady;
  const main = new Main(wasm);
  const ui = new UI(main);
  main.setUI(ui);
  document.getElementById('version').textContent = VERSION + (DEVEL ? ' DEVEL' : '');
  window.addEventListener('unhandledrejection', event => {
    ui.popupMessage(event.reason);
  });
  await main.init();
}

if (document.readyState === 'complete') {
  startApp();
} else {
  window.addEventListener('load', startApp, {once: true});
}

export class Main {
  #wasm;
  #ui;
  #storeKey;

  constructor(wasm) {
    this.#wasm = wasm;
    this.#storeKey = () => null;
    this.salt_ = null;
    this.fixing_ = false;

    try {
      const salt = window.localStorage.getItem('salt');
      if (salt) {
        this.salt_ = this.base64DecodeToBytes(salt);
      }
    } catch (err) {
      this.salt_ = null;
    }
    if (this.salt_ === null) {
      this.salt_ = window.crypto.getRandomValues(new Uint8Array(16));
      window.localStorage.setItem('salt', this.base64RawUrlEncode(this.salt_));
      window.localStorage.setItem('resetPassphrase', 'yes');
    }
    const sh = window.localStorage.getItem('sh');
    if (sh) {
      this.serverHashValue_ = this.base64DecodeToBytes(sh);
    }
    if (window.localStorage.getItem('resetPassphrase') === 'yes') {
      window.sessionStorage.removeItem('storeKeyId');
    }
    // The store key is only ever kept in memory. To survive a page reload,
    // it is handed to the service worker right before the page unloads, and
    // retrieved from it when the new page starts. See #saveStoreKey and
    // #restoreStoreKey.
    window.addEventListener('pagehide', () => this.#saveStoreKey());
  }

  // #saveStoreKey hands the store key to the service worker so that it can
  // be retrieved by the page that is about to replace this one. It is
  // indexed by a random one-time id saved in sessionStorage. The service
  // worker drops the key when it is retrieved, when it expires, or when the
  // service worker itself is terminated by the browser.
  #saveStoreKey() {
    const key = this.#storeKey();
    const ctrl = navigator.serviceWorker.controller;
    if (!key || !ctrl) {
      return;
    }
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    const id = this.base64RawUrlEncode(bytes);
    try {
      window.sessionStorage.setItem('storeKeyId', id);
    } catch (err) {
      console.error('saveStoreKey', err);
      return;
    }
    ctrl.postMessage({type: 'saveKey', id: id, key: key});
  }

  // #restoreStoreKey retrieves the store key saved by #saveStoreKey, if any.
  async #restoreStoreKey() {
    let id;
    try {
      id = window.sessionStorage.getItem('storeKeyId');
      window.sessionStorage.removeItem('storeKeyId');
    } catch (err) {
      return;
    }
    const ctrl = navigator.serviceWorker.controller;
    if (!id || !ctrl) {
      return;
    }
    const key = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 5000);
      const mc = new MessageChannel();
      mc.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data?.key || null);
      };
      ctrl.postMessage({type: 'getKey', id: id}, [mc.port2]);
    });
    if (key) {
      this.#storeKey = () => key;
    }
  }

  setUI(v) {
    this.#ui = v;
  }

  async init() {
    await this.initServiceWorker_();

    const capabilities = [''];
    if ('PublicKeyCredential' in window) {
      capabilities.push('mfa');
    }
    this.#wasm.configure({
      sameOrigin: SAMEORIGIN,
      capabilities: capabilities,
      onError: msg => this.#ui.popupMessage(msg),
      onInfo: msg => this.#ui.popupMessage(msg, 'info'),
      onLoggedOut: () => {
        window.localStorage.removeItem('_');
        window.localStorage.removeItem('salt');
        this.lock();
      },
      onUploadProgress: progress => this.#ui.showUploadProgress(progress),
      onDownloadProgress: progress => this.#ui.showDownloadProgress(progress),
      getMFA: mfa => this.getMFA(mfa),
    });

    if (this.#storeKey() === null) {
      await this.#restoreStoreKey();
    }
    if (this.#storeKey() !== null) {
      await this.unlock_();
    } else {
      setTimeout(() => {
        this.#ui.promptForPassphrase(window.localStorage.getItem('resetPassphrase') === 'yes');
      });
    }
  }

  async initServiceWorker_() {
    try {
      const r = await navigator.serviceWorker.register('service-worker.js', {type: 'module'});
      r.update().catch(err => console.error('Service worker update failed', err));
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => {
          const onChange = () => {
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.removeEventListener('controllerchange', onChange);
              resolve();
            }
          };
          navigator.serviceWorker.addEventListener('controllerchange', onChange);
        });
      }
      console.log('Service worker ready');
    } catch (err) {
      console.error('Service worker registration failed', err);
    }
  }

  async setPassphrase(p) {
    if (!p) {
      console.error('empty passphrase');
      return;
    }
    const k = await this.#wasm.derivePassphraseKey(p, this.salt_);
    this.#storeKey = () => k;
    await this.unlock_();
  }

  async unlock_() {
    const key = this.#storeKey();
    if (!key) {
      this.#ui.promptForPassphrase(window.localStorage.getItem('resetPassphrase') === 'yes');
      return;
    }
    const res = await this.#wasm.unlock({
      storeKey: key,
      storeName: this.base64RawUrlEncode(this.salt_).substring(0, 8),
      reset: window.localStorage.getItem('resetPassphrase') === 'yes',
    });
    if (res.err) {
      this.#storeKey = () => null;
      this.#ui.wrongPassphrase(res.err);
    }
    if (res.ok && res.storeKey) {
      this.#storeKey = () => res.storeKey;
      document.getElementById('version').textContent = VERSION + (DEVEL ? ' DEVEL' : '');
      window.localStorage.removeItem('resetPassphrase');
      this.#ui.startUI();
    } else {
      this.#ui.promptForPassphrase(window.localStorage.getItem('resetPassphrase') === 'yes');
    }
  }

  async lock() {
    if (this.locking_) {
      return;
    }
    this.locking_ = true;
    if (!window.localStorage.getItem('_')) {
      this.#storeKey = () => null;
      window.sessionStorage.removeItem('storeKeyId');
      this.#wasm.lock();
    }
    setTimeout(() => {
      window.location.reload();
    }, 25);
  }

  resetPassphrase() {
    this.#storeKey = () => null;
    window.sessionStorage.removeItem('storeKeyId');
    window.localStorage.setItem('resetPassphrase', 'yes');
  }

  async resetServiceWorker() {
    console.log('resetServiceWorker', this.fixing_);
    if (this.fixing_) {
      return;
    }
    this.fixing_ = true;
    return navigator.serviceWorker.ready
      .then(r => r.unregister())
      .then(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.indexedDB.databases().then(list => Promise.all(list.map(item => window.indexedDB.deleteDatabase(item.name))));
        return new Promise(resolve => {
          window.setTimeout(resolve, 5000);
        })
        .then(() => window.location.reload());
      });
  }

  setServerFingerPrint(elemId) {
    const elem = document.querySelector(elemId);
    const fp = this.fingerPrint(this.serverHashValue_);
    elem.textContent = fp;
  }

  async calcServerFingerPrint(n, elemId, commit) {
    const elem = document.querySelector(elemId);
    try {
      n = new URL(n).toString();
    } catch (err) {
      if (elem) {
        elem.textContent = '';
      }
      return Promise.resolve('');
    }
    const data = new TextEncoder().encode(n);
    return window.crypto.subtle.digest('SHA-256', data)
      .then(b => {
        const a = new Uint8Array(b);
        const fp = this.fingerPrint(a);
        if (elem) {
          elem.textContent = fp;
        }
        if (commit) {
          this.serverHashValue_ = a;
          window.localStorage.setItem('sh', this.base64RawUrlEncode(a));
        }
        return fp;
      });
  }

  fingerPrint(hash) {
    const map = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
    const h = [];
    for (let i = 0; i < 6; i++) {
      h.push(map[(hash[i]>>4)&0xf]+map[hash[i]&0xf]);
    }
    return h.slice(0, 2).join('') + '-' + h.slice(2, 4).join('') + '-' + h.slice(4, 6).join('');
  }

  checkKeyId_(keyId) {
    const b64 = this.base64RawUrlEncode(keyId);
    const sh = window.localStorage.getItem('sh');
    const saved = window.localStorage.getItem(b64);
    if (saved !== null && saved !== sh) {
      throw new Error('keyId belongs to another server');
    }
    if (saved === null) {
      window.localStorage.setItem(b64, sh);
    }
  }

  async addSecurityKey(password, usePassKey) {
    if (!('PublicKeyCredential' in window)) {
      throw new Error('Browser doesn\'t support WebAuthn');
    }
    return this.sendRPC('addSecurityKey', {password, usePassKey})
      .then(options => {
        options.challenge = this.base64DecodeToBytes(options.challenge);
        // Set user.id to the concatenation of server hash and user id from the server.
        const uid = this.base64DecodeToBytes(options.user.id);
        const id = new Uint8Array(this.serverHashValue_.byteLength + uid.byteLength);
        id.set(this.serverHashValue_);
        id.set(uid, this.serverHashValue_.byteLength);
        options.user.id = id;
        if (!SAMEORIGIN) {
          options.user.name = this.#ui.serverUrl_ + '; ' + options.user.name;
        }
        if (options.excludeCredentials) {
          for (let i = 0; i < options.excludeCredentials.length; i++) {
            options.excludeCredentials[i].id = this.base64DecodeToBytes(options.excludeCredentials[i].id);
          }
        }
        const done = this.#ui.freeze({message: _T('select-security-key')});
        return navigator.credentials.create({publicKey: options}).finally(done);
      })
      .then(async pkc => {
        if (pkc.type !== 'public-key' || !(pkc.response instanceof window.AuthenticatorAttestationResponse)) {
          console.log('Invalid credentials.create response', pkc);
          throw new Error('invalid credentials.create response');
        }
        this.checkKeyId_(new Uint8Array(pkc.rawId));
        let keyName = await this.#ui.prompt({
          message: _T('enter-security-key-name'),
          getValue: true,
          defaultValue: pkc.id,
        });
        if (keyName === '') {
          keyName = pkc.id;
        }
        const args = {
          password: password,
          keyName: keyName,
          discoverable: usePassKey,
          clientDataJSON: new Uint8Array(pkc.response.clientDataJSON),
          attestationObject: new Uint8Array(pkc.response.attestationObject),
          transports: pkc.response.getTransports(),
        };
        return this.sendRPC('addSecurityKey', args);
      });
  }

  async getMFA(mfa) {
    const getCode = () => {
      return this.#ui.prompt({
        message: _T('enter-otp'),
        getValue: true,
      })
      .then(v => {
        return {otp: v.trim()};
      });
    };
    const options = mfa.webauthn;
    if (!options || !('PublicKeyCredential' in window)) {
      return getCode();
    }
    options.challenge = this.base64DecodeToBytes(options.challenge);
    if (options.allowCredentials) {
      for (let i = 0; i < options.allowCredentials.length; i++) {
        options.allowCredentials[i].id = this.base64DecodeToBytes(options.allowCredentials[i].id);
        this.checkKeyId_(options.allowCredentials[i].id);
      }
    }
    const done = this.#ui.freeze({message: _T('verify-identity')});
    return navigator.credentials.get({publicKey: options})
      .finally(done)
      .then(pkc => {
        if (pkc.type !== 'public-key' || !(pkc.response instanceof window.AuthenticatorAssertionResponse)) {
          throw new Error('invalid PublicKeyCredential value');
        }
        let userHandle = pkc.response.userHandle;
        if (userHandle) {
          let uh = new Uint8Array(userHandle);
          if (uh.byteLength < this.serverHashValue_.byteLength) {
            throw new Error('invalid userHandle');
          }
          for (let i = 0; i < this.serverHashValue_.byteLength; i++) {
            if (uh[i] !== this.serverHashValue_[i]) {
              throw new Error('invalid userHandle');
            }
          }
          userHandle = uh.slice(this.serverHashValue_.byteLength);
        }
        return {
          webauthn: {
            id: pkc.id,
            clientDataJSON: this.base64RawUrlEncode(new Uint8Array(pkc.response.clientDataJSON)),
            authenticatorData: this.base64RawUrlEncode(new Uint8Array(pkc.response.authenticatorData)),
            signature: this.base64RawUrlEncode(new Uint8Array(pkc.response.signature)),
            userHandle: userHandle ? this.base64RawUrlEncode(userHandle) : undefined,
          },
        };
      })
      .catch(err => {
        console.log('getMFA', err);
        return getCode();
      });
  }

  setHash(key, value) {
    let obj = {};
    try {
      obj = JSON.parse(atob(location.hash.replace(/^#/, '')));
    } catch (e) {}
    obj[key] = value;
    location.hash = btoa(JSON.stringify(obj));
  }

  getHash(field, defaultValue) {
    let obj = {};
    try {
      obj = JSON.parse(atob(location.hash.replace(/^#/, '')));
    } catch (e) {}
    if (obj[field] !== undefined) {
      return obj[field];
    }
    return defaultValue;
  }

  base64DecodeToBytes(v) {
    if (typeof v !== 'string') {
      throw new Error('base64DecodeToBytes arg not string');
    }
    v = v.replaceAll('-', '+').replaceAll('_', '/');
    while (v.length % 4 !== 0) {
      v += '=';
    }
    return base64.toByteArray(v);
  }

  base64RawUrlEncode(v) {
    if (!(v instanceof Uint8Array)) {
      throw new Error('base64RawUrlEncode arg not Uint8Array');
    }
    return base64.fromByteArray(v).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  }

  async sendRPC(f, ...args) {
    document.body.classList.add('waiting');
    try {
      return await this.#wasm.call(f, ...args);
    } finally {
      document.body.classList.remove('waiting');
    }
  }
}
