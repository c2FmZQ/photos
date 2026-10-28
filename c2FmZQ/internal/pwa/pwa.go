//
// Copyright 2021-2026 TTBT Enterprises LLC
//
// This file is part of c2FmZQ (https://c2FmZQ.org/).
//
// c2FmZQ is free software: you can redistribute it and/or modify it under the
// terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version.
//
// c2FmZQ is distributed in the hope that it will be useful, but WITHOUT ANY
// WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
// A PARTICULAR PURPOSE. See the GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with
// c2FmZQ. If not, see <https://www.gnu.org/licenses/>.

package pwa

import "embed"

// The PWA core is written in Go and compiled to WebAssembly by build.sh (via
// go generate), which produces pwa.wasm and refreshes wasm_exec.js from
// GOROOT. pwa.wasm is embedded below but not checked into the repository, so
// `go generate ./...` must be run before `go build`. Without it, the build
// fails with "pattern *.wasm: no matching files found".
//
//go:generate ./build.sh

//go:embed *.html *.css *.js *.mjs *.wasm *.png *.webmanifest thirdparty/* lang/* icons/*
var FS embed.FS
