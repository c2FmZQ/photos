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

async function runTests() {
  const wasmReady = new Promise(resolve => {
    window.__c2fmzqWasmReady = resolve;
  });
  const go = new Go();
  const r = await WebAssembly.instantiateStreaming(fetch('pwa.wasm'), go.importObject);
  go.run(r.instance);
  const wasm = await wasmReady;

  const results = await wasm.runTests();
  const e = document.createElement('div');
  e.id = 'results';
  e.textContent = JSON.stringify(results);
  document.body.appendChild(e);
  const d = document.createElement('div');
  d.className = 'summary';
  document.body.appendChild(d);
  const push = c => {
    const t = document.createElement('div');
    t.textContent = c;
    d.appendChild(t);
  };
  for (const res of results) {
    push(res.test);
    push(res.result);
    push(res.err || '-');
  }
}

runTests();
