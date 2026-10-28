#!/bin/sh -e

cd "$(dirname "$0")"

cp -f "$(go env GOROOT)/lib/wasm/wasm_exec.js" .
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o pwa.wasm ./wasm
