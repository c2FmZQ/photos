#!/bin/bash -e

cd "$(dirname $0)"

npm ci --ignore-scripts

browserify browser.js > browser-libs.js

rm -rf node_modules
