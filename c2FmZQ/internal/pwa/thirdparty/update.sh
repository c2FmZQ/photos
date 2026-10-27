#!/bin/bash -e

cd "$(dirname $0)"

npm ci --ignore-scripts

browserify worker.js \
  --exclude=./wordlists/japanese.json  \
  --exclude=./wordlists/spanish.json  \
  --exclude=./wordlists/italian.json \
  --exclude=./wordlists/french.json \
  --exclude=./wordlists/korean.json \
  --exclude=./wordlists/czech.json \
  --exclude=./wordlists/portuguese.json \
  --exclude=./wordlists/chinese_simplified.json \
  --exclude=./wordlists/chinese_traditional.json  > libs.js

browserify browser.js > browser-libs.js

rm -rf node_modules
