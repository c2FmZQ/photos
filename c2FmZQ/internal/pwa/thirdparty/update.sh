#!/bin/bash -e

cd "$(dirname $0)"

npm ci --ignore-scripts

browserify browser.js --exclude http --exclude https --exclude fs > browser-libs.js

rm -rf node_modules
