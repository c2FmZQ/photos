#!/bin/bash

cd "$(dirname $0)"

npm install base64-js exifreader

browserify browser.js > browser-libs.js
