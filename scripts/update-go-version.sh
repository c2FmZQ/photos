#!/bin/bash
#
# Check the latest Go version and update Dockerfile, .goversion,
# c2FmZQ/docker-compose-browser-tests.yaml, and c2FmZQ/go.mod.

cd "$(dirname "$0")/.."

latest=$(curl -s 'https://go.dev/dl/?mode=json' | jq -r '[.[] | select(.stable == true)][0].version')
version="${latest#go}"
osversion="alpine3.24"
if [[ "${latest}" =~ ^go ]]; then
  sed -i -re "s/^FROM golang:.*/FROM golang:${version}-${osversion} AS build/" Dockerfile
  sed -i -re "s/image: \"golang:.*\"/image: \"golang:${version}-${osversion}\"/" c2FmZQ/docker-compose-browser-tests.yaml
  echo "${version}" > .goversion
  sed -i -re "s/^go .*/go ${version}/" c2FmZQ/go.mod
fi

export GOTOOLCHAIN="go$(cat .goversion)"

deps=$(
  (
    cd c2FmZQ &&
    go get -u -t ./... 2>&1 &&
    go get -u -t -tags "chromedp fusetest" ./... 2>&1 &&
    go get -u -t -tags "sodium" ./... 2>&1 &&
    go mod tidy 2>&1
  ) | grep upgrade | sed -re 's/go: //g' | awk '!seen[$0]++'
)

if [[ -n $(git status -s Dockerfile .goversion c2FmZQ/docker-compose-browser-tests.yaml) ]]; then
  echo "* Update go: ${version}"
fi
if [[ -n "${deps}" ]]; then
  echo "* Update go dependencies:"
  echo "${deps}" | sed -re 's/^/  * /g'
fi

exit 0
