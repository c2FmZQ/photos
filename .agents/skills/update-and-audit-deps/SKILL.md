---
name: update-and-audit-deps
description: >-
  Runs scripts/update-go-version.sh (and optionally updates PWA thirdparty npm
  dependencies) to update the Go toolchain, Go module dependencies, and
  frontend npm packages, then audits all upstream dependency changes for
  supply-chain attacks, security vulnerabilities, regressions, or API contract
  hazards that are exploitable in c2FmZQ-server, c2FmZQ-client, inspect, or the
  PWA. Use when the user asks to update Go or npm/PWA dependencies, run
  update-go-version.sh, or audit updated upstream libraries.
---

# Update and Audit Go & NPM Dependencies

## Overview

This skill updates the Go version and upstream module dependencies using [`scripts/update-go-version.sh`](../../../scripts/update-go-version.sh) (and optionally frontend npm dependencies in `c2FmZQ/internal/pwa/thirdparty/`), extracts the exact source code diffs between the old and new versions from `GOMODCACHE` and npm registry tarballs, and audits every change for malicious/suspicious code, security vulnerabilities, or subtle behavioral changes before any build, bundle, or test command is executed.

> [!CAUTION]
> **CRITICAL: Never run `go build`, `go test`, `go run`, `go generate`, `go install`, `./c2FmZQ/internal/pwa/thirdparty/update.sh`, `./c2FmZQ/run-pwa-tests.sh`, `browserify`, or `npm` without `--ignore-scripts` BEFORE completing the full source diff audit in Step 3, and NEVER run them if suspicious or malicious code is detected in any dependency.**
> Compiling or testing untrusted Go dependency updates can execute attacker-controlled code on the host (via `init()` functions, test binaries, CGo, or compiler directives). Running npm without `--ignore-scripts` or bundling with `browserify` can execute attacker-controlled JavaScript on the host (via `preinstall`/`install`/`postinstall` hooks or bundler transforms). If suspicious code is found during Step 3, stop immediately, do not build or run tests, and report the finding to the user.

## Workflow

### 1. Check Working Tree & Update Dependencies

1. Check `git status -s` in the repository root:
   - Confirm what baseline git ref (`BASE_REF`, typically `HEAD`) holds the pre-update `c2FmZQ/go.mod` and `c2FmZQ/internal/pwa/thirdparty/package-lock.json`.
   - If `c2FmZQ/go.mod` has not yet been updated in the working tree, run:
     ```bash
     ./scripts/update-go-version.sh
     ```
   - If npm dependencies in `c2FmZQ/internal/pwa/thirdparty/` should also be updated (and have not yet been updated in the working tree), update `c2FmZQ/internal/pwa/thirdparty/package.json` and `c2FmZQ/internal/pwa/thirdparty/package-lock.json` using `--package-lock-only --ignore-scripts` (do **not** run `./c2FmZQ/internal/pwa/thirdparty/update.sh` or `browserify` before Step 4):
     ```bash
     (cd c2FmZQ/internal/pwa/thirdparty && npm install --package-lock-only --ignore-scripts bip39@latest sodium-plus@latest exifreader@latest && npm update --package-lock-only --ignore-scripts)
     ```
2. Inspect `git diff Dockerfile .goversion c2FmZQ/docker-compose-browser-tests.yaml c2FmZQ/go.mod c2FmZQ/internal/pwa/thirdparty/package.json c2FmZQ/internal/pwa/thirdparty/package-lock.json` to see which Go version, Go modules, and npm packages were updated.

### 2. Generate Upstream Source Diffs

Run the helper script [`scripts/diff-go-deps.sh`](./scripts/diff-go-deps.sh) against the pre-update git ref (`HEAD` if changes are uncommitted, or `HEAD~1` if the update was already committed):

```bash
./.agents/skills/update-and-audit-deps/scripts/diff-go-deps.sh HEAD /tmp/c2fmzq-dep-audit
```

- The script downloads both the previous and updated versions of each changed Go module in `c2FmZQ/go.mod` into `GOMODCACHE` and unpacks both the previous and updated tarballs of each changed npm package in `c2FmZQ/internal/pwa/thirdparty/package-lock.json` without executing any scripts, locates every `.go` file in `c2FmZQ/` that imports each changed Go module and every `.js` file in `c2FmZQ/internal/pwa/` that references each changed npm package, and writes:
  - `/tmp/c2fmzq-dep-audit/summary.md`: Overview of all changed Go modules and npm packages, their unpacked source directories, importing/referencing files in this repo, install lifecycle script warnings, and diff line counts.
  - `/tmp/c2fmzq-dep-audit/<module>.diff`: Unified diff of non-test Go source files between the old and new versions.
  - `/tmp/c2fmzq-dep-audit/npm_<package>.diff`: Unified diff of unpacked npm package files between the old and new versions.
- Read `/tmp/c2fmzq-dep-audit/summary.md` first.

### 3. Audit Upstream Changes and `c2FmZQ` Call Sites

For each upgraded Go module or npm package (delegate to parallel `research` subagents if multiple large diffs exist):

1. **Read the upstream diff** (`/tmp/c2fmzq-dep-audit/<module>.diff` or `/tmp/c2fmzq-dep-audit/npm_<package>.diff`) and the surrounding upstream code in `GOMODCACHE` or `/tmp/c2fmzq-dep-audit/npm/`.
2. **Read every call site** in `c2FmZQ-server` (`c2FmZQ/c2FmZQ-server/`, `c2FmZQ/c2FmZQ-server/inspect/`, `c2FmZQ/internal/server/`, `c2FmZQ/internal/database/`, `c2FmZQ/internal/stingle/`, `c2FmZQ/internal/webauthn/`, `c2FmZQ/internal/webpush/`), `c2FmZQ-client` (`c2FmZQ/c2FmZQ-client/`, `c2FmZQ/internal/client/`, `c2FmZQ/internal/client/fuse/`, `c2FmZQ/internal/client/web/`, `c2FmZQ/internal/pp/`), and the Progressive Web App (`c2FmZQ/internal/pwa/`, `c2FmZQ/internal/pwa/thirdparty/worker.js`, `c2FmZQ/internal/pwa/thirdparty/browser.js`, `c2FmZQ/internal/pwatests/`) that interacts with the upgraded dependency.
3. **Evaluate against supply-chain threats and the `c2FmZQ` threat model**:
   - **Supply-Chain & Suspicious Code Inspection (Must Pass Before Any Build/Test)**:
     - **Go modules**: Check for newly added or modified `init()` functions, `os/exec` commands, `syscall` / `unsafe` / `reflect` abuse, `//go:linkname` or `//go:cgo_*` directives, CGo/assembly files (especially in `github.com/jamesruan/sodium`, `github.com/minio/blake2b-simd`, `golang.org/x/sys`, `golang.org/x/crypto`), obfuscated strings or encoded payloads (base64/hex blobs), unexpected outbound network calls (`net`, `net/http`), environment variable access (`os.Getenv`, `os.Environ` — e.g., reading `C2FMZQ_PASSPHRASE*`), or unexpected filesystem reads/writes.
     - **NPM packages**: Check for `preinstall` / `install` / `postinstall` / `prepare` scripts in `package.json` (note that `exifreader` and `sodium-native` declare install scripts and must never be installed without `--ignore-scripts`), `child_process` / `fs` / `net` / `http` / `https` / `fetch` / `WebSocket` / `eval` / `Function` calls, obfuscated or minified payloads, prototype pollution, or DOM / `IndexedDB` / `CacheStorage` / `localStorage` / Web Worker exfiltration (e.g., reading decrypted secret keys, BIP39 mnemonics, passphrases, or plaintext photos/files in `worker.js`, `browser.js`, `c2fmzq-client.js`, or `store2.js`).
     - **If any suspicious, backdoored, or unexplained code is detected: STOP IMMEDIATELY. Do NOT proceed to Step 4 (`./c2FmZQ/internal/pwa/thirdparty/update.sh`, `go test`, or `go build`).** Alert the user with the exact file path and line numbers.
   - **Parsing, Media Processing & Input Validation**:
     - Can malformed network input or untrusted shared-album content (HTTP/2 / `h2c` frames in `golang.org/x/net/http2`, gzip bodies in `github.com/NYTimes/gziphandler`, CBOR/COSE WebAuthn attestation/assertion structures in `github.com/fxamacker/cbor/v2`, EXIF/TIFF/XMP/XML tags in `github.com/rwcarlsen/goexif` or npm `exifreader` / `@xmldom/xmldom`, malicious image files in `github.com/disintegration/imaging` or `golang.org/x/image`, CLI arguments/shell tokens in `github.com/urfave/cli/v2` and `github.com/mattn/go-shellwords`, or FUSE filesystem requests in `bazil.org/fuse`) trigger panics, slice bounds errors, nil-pointer dereferences, XXE/entity expansion, integer overflows, or path traversal?
     - Are file/album ID validation (`isValidID` in `c2FmZQ/internal/database`), path traversal protections (`ExportFiles`, `node.find` in `c2FmZQ/internal/client`), download URL origin validation (`ServerBaseURL` in `c2FmZQ/internal/client` and `getDownloadUrl_` in `c2FmZQ/internal/pwa/c2fmzq-client.js`), terminal control-character stripping in CLI output, and sandbox `Content-Security-Policy` / `X-Content-Type-Options: nosniff` headers (`handleTokenDownload`, local web `/raw`) preserved?
   - **Zero-Knowledge Cryptography, Key Management & Authentication**:
     - Are Stingle protocol cryptographic primitives across `c2FmZQ/internal/stingle` and the PWA (`sodium-plus` in `worker.js` / `c2fmzq-client.js`) — Curve25519 / NaCl `box` (`EncryptMessage`/`DecryptMessage`, `SealAnonymous`/`OpenAnonymous` in `DecryptHeader`), `secretbox` / XChaCha20-Poly1305 chunked stream encryption (`StreamReader` chunk size, nonce progression, truncated final chunk and premature EOF detection in Go and `Decrypter` in JS), BLAKE2b key derivation (`github.com/minio/blake2b-simd`), Argon2id (`pwhash`) and bcrypt password hashing, BIP39 mnemonic phrase encoding/decoding (`github.com/tyler-smith/go-bip39` and npm `bip39`), and `chacha20poly1305` sealed server tokens (`c2FmZQ/internal/stingle/token`) — still strictly enforced and interoperable between Go and JS?
     - Are secret keys and decrypted headers (`SecretKey.Wipe`, `Header.Wipe`, ` DecryptBase64Headers`) reliably zeroed on all success and error paths, is shared-album public/private keypair consistency verified during sync, and is `github.com/c2FmZQ/storage` master-key encryption (including TPM protection via `github.com/c2FmZQ/tpm`) intact?
     - Are MFA checks (`github.com/pquerna/otp/totp` with non-empty secret validation in `validateOTP`, WebAuthn ES256/RS256 signature and challenge/origin/RP ID verification in `c2FmZQ/internal/webauthn`), token revocation (`ValidTokens`), and shared album permission checks (`AlbumOwner`, `AllowAdd`, `AllowCopy`, `AllowShare`) preserved?
   - **Resource Exhaustion, Memory/File Leaks & DoS**:
     - Can an unauthenticated or authenticated client, untrusted shared media file, or Web Push endpoint cause unbounded memory allocation (e.g., decompression bombs in `gziphandler` or image decoders, oversized CBOR/EXIF/XML payloads, or unthrottled multipart uploads)?
     - Are temporary uploaded file/thumbnail blobs (`receiveUpload` / `handleUpload`), encrypted storage locks (`github.com/c2FmZQ/storage`), `ConnLimiter` in-flight counters on context cancellation (`c2FmZQ/internal/server/limit`), rate limiters (`golang.org/x/time/rate`), and FUSE file handles properly cleaned up and released on early close, context cancellation, or error paths?

### 4. Build, Test, and Report Findings

> [!IMPORTANT]
> **Only run the build, bundle, and test commands below if Step 3 confirmed that no suspicious or malicious code was introduced in any dependency diff.** If suspicious code was detected, skip Step 4.1 entirely and report the suspicious code immediately.

1. Run the bundle, build, vet, lint, and test checks (only after all diffs pass inspection):
   ```bash
   # If c2FmZQ/internal/pwa/thirdparty/package.json or package-lock.json changed, rebuild libs.js and browser-libs.js:
   ./c2FmZQ/internal/pwa/thirdparty/update.sh

   # Build all Go packages, run go vet, and run unit tests:
   (cd c2FmZQ && GOTOOLCHAIN="go$(cat ../.goversion)" go build ./...)
   (cd c2FmZQ && GOTOOLCHAIN="go$(cat ../.goversion)" go vet ./...)
   (cd c2FmZQ && GOTOOLCHAIN="go$(cat ../.goversion)" go test -count=1 ./...)
   ```
   - If direct Go module imports were added or removed and `~/go/bin/go-licenses` is available, update embedded licenses with `(cd c2FmZQ && ./licenses/update.sh)`.
   - If PWA JavaScript files changed and `jshint` is installed, run `./c2FmZQ/run-jshint.sh`.
   - If PWA, `thirdparty/` npm bundles, `chromedp`, or server HTTP/WebAuthn behavior was affected and Docker is available, also run `./c2FmZQ/run-pwa-tests.sh`.
2. Present a concise, triaged report of the audit:
   - **Summary Table of Upgraded Dependencies**: Module/package name, ecosystem (Go / npm), old -> new version, and audit status.
   - **Triaged Findings (Critical / High / Medium / Low)**:
     - Exact upstream file and line numbers in `GOMODCACHE` or unpacked npm tarball
     - Exact `c2FmZQ` call-site file and line numbers
     - Exploitability preconditions and impact
     - Recommended fix location (`c2FmZQ`, sibling `github.com/c2FmZQ/*` repository, or upstream third-party library)
