`echo -n safe | base64`

# c2FmZQ

* [Overview](#overview)
* [Design and Architecture](#design-and-architecture)
* [c2FmZQ Server](#c2FmZQ-server)
  * [How to run the server](#run-server)
  * [DEMO / test drive](#demo)
* [Progressive Web App (PWA)](#pwa)
* [c2FmZQ Client](#c2FmZQ-client)
  * [Mount as fuse filesystem](#fuse)
  * [Connecting to stingle.org account](#connect-to-stingle)
* [Experimental features](#experimental)
  * [Multi-Factor Authentication](#mfa)
  * [Decoy / duress passwords](#decoy)

# <a name="overview"></a>Overview

c2FmZQ is a self-hostable, end-to-end encrypted file storage and sharing platform, with a strong focus on photos and videos. It is designed for users who want to maintain full control over their personal data without sacrificing the convenience of modern cloud services.

The core principle of c2FmZQ is **zero-knowledge privacy**. All encryption and decryption happen on the client-side, meaning that the server only ever stores encrypted data. The server operator (even if that's you) cannot access the plaintext contents of your files.

The project consists of three main components:

*   **`c2FmZQ-server`**: A lightweight, high-performance backend written in Go. It acts as the central API and storage hub for encrypted data and can be deployed on a wide range of hardware, from a Raspberry Pi to a dedicated cloud server.
*   **`c2FmZQ-client`**: A powerful command-line interface (CLI) also written in Go. It allows for scripting, bulk operations, and advanced features like mounting your encrypted storage as a local filesystem using FUSE.
*   **Progressive Web App (PWA)**: A feature-rich web interface that runs in any modern browser. It provides a user-friendly experience for managing photos and videos, including album organization, sharing, and even photo editing, all while performing cryptographic operations directly in the browser.

c2FmZQ implements an API that is compatible with the official **Stingle Photos** Android app, allowing you to use it as a client with your self-hosted c2FmZQ server.

_Disclaimer: This project is an independent implementation of the Stingle API and is **NOT** associated with stingle.org. The original code was developed by studying the official client's behavior. Stingle.org released their own [server code](https://github.com/stingle/stingle-api) in April 2023._

---

# <a name="design-and-architecture"></a>Design and Architecture

For a detailed explanation of the project's design, architecture, security considerations, and performance characteristics, please see the [DESIGN.md](DESIGN.md) document.

---

# <a name="c2FmZQ-server"></a>c2FmZQ Server

c2FmZQ-server is an API server with a relatively small footprint. It can run
just about anywhere, as long as it has access to a lot of storage space, and a modern
CPU. It must be reachable by the clients via HTTPS.

The server needs at least two pieces of information: the name of the directory where
its data will be stored, and a passphrase to protect the data. The passphrase
can be read from a file or retrieved with an external command, otherwise the server
will prompt for it when it starts.

---

## <a name="run-server"></a>How to run the server

The server is self-contained and can run on various platforms like Linux, macOS, Windows, or a Raspberry Pi. The recommended way to run the `c2FmZQ-server` is with Docker, using [tlsproxy](https://github.com/c2FmZQ/tlsproxy) to handle HTTPS termination and certificate management.

This approach simplifies deployment by automating TLS certificate acquisition from Let's Encrypt and securely proxying traffic to the `c2FmZQ-server` container.

An example `docker-compose` setup is available in the [tlsproxy repository](https://github.com/c2FmZQ/tlsproxy/tree/main/examples/docker-compose). This is the easiest and most secure way to get started.

For users who prefer to manage TLS manually or use other deployment methods, the server can also be built from source and run as a standalone binary.

---

---

<details>
<summary>Build and run manually from source</summary>

#### Build and run it locally

```bash
cd c2FmZQ/c2FmZQ-server
go build
./c2FmZQ-server help
```
```txt
NAME:
   c2FmZQ-server - Run the c2FmZQ server

USAGE:
   c2FmZQ-server [global options]  

GLOBAL OPTIONS:
   --database DIR, --db DIR         Use the database in DIR (default: "$HOME/c2FmZQ-server/data") [$C2FMZQ_DATABASE]
   --address value, --addr value    The local address to use. (default: "127.0.0.1:8080") [$C2FMZQ_ADDRESS]
   --path-prefix value              The API endpoints are <path-prefix>/v2/... [$C2FMZQ_PATH_PREFIX]
   --base-url value                 The base URL of the generated download links. If empty, the links will generated using the Host headers of the incoming requests, i.e. https://HOST/. [$C2FMZQ_BASE_URL]
   --redirect-404 value             Requests to unknown endpoints are redirected to this URL. [$C2FMZQ_REDIRECT_404]
   --tlscert FILE                   The name of the FILE containing the TLS cert to use. [$C2FMZQ_TLSCERT]
   --tlskey FILE                    The name of the FILE containing the TLS private key to use. [$C2FMZQ_TLSKEY]
   --autocert-domain domain         Use autocert (letsencrypt.org) to get TLS credentials for this domain. The special value 'any' means accept any domain. The credentials are saved in the database. [$C2FMZQ_DOMAIN]
   --autocert-address value         The autocert http server will listen on this address. It must be reachable externally on port 80. (default: ":http") [$C2FMZQ_AUTOCERT_ADDRESS]
   --allow-new-accounts             Allow new account registrations. (default: true) [$C2FMZQ_ALLOW_NEW_ACCOUNTS]
   --auto-approve-new-accounts      Newly created accounts are auto-approved. (default: true) [$C2FMZQ_AUTO_APPROVE_NEW_ACCOUNTS]
   --verbose value, -v value        The level of logging verbosity: 1:Error 2:Info 3:Debug (default: 2 (info)) [$C2FMZQ_VERBOSE]
   --passphrase-command COMMAND     Read the database passphrase from the standard output of COMMAND. [$C2FMZQ_PASSPHRASE_CMD]
   --passphrase-file FILE           Read the database passphrase from FILE. [$C2FMZQ_PASSPHRASE_FILE]
   --passphrase value               Use value as database passphrase. [$C2FMZQ_PASSPHRASE]
   --htdigest-file FILE             The name of the htdigest FILE to use for basic auth for some endpoints, e.g. /metrics [$C2FMZQ_HTDIGEST_FILE]
   --max-concurrent-requests value  The maximum number of concurrent requests. (default: 10) [$C2FMZQ_MAX_CONCURRENT_REQUESTS]
   --enable-webapp                  Enable Progressive Web App. (default: true) [$C2FMZQ_ENABLE_WEBAPP]
   --licenses                       Show the software licenses. (default: false)
```

#### Build a binary for another platform, e.g. windows, raspberry pi, or a NAS

```bash
cd c2FmZQ/c2FmZQ-server
GOOS=windows GOARCH=amd64 go build -o c2FmZQ-server.exe
GOOS=linux GOARCH=arm go build -o c2FmZQ-server-arm
GOOS=darwin GOARCH=arm64 go build -o c2FmZQ-server-darwin
```

</details>

---

## <a name="demo"></a>DEMO / test drive

For DEMO or testing purpose, the server can be launched on a github codespace.

Create a [codespace](https://github.com/codespaces) for the `c2FmZQ/c2FmZQ` repository, open the terminal, and run:
```
cd c2FmZQ
go run ./c2FmZQ-server --passphrase=test
```
Select `Open in Browser` to open the PWA, or connect the android app to the same URL.

Please note that this is **NOT** a secure configuration. Do not use this to store anything you care about.

---

# <a name="pwa"></a>Progressive Web App (PWA)

The PWA is a full-featured client app for c2FmZQ implemented entirely in HTML and javascript.

![PWA Screenshot](docs/screenshot.png)

[Watch the automated test video](https://youtu.be/R_sQ26unlXQ?si=4FolTMKrpdqP6lzb&t=12)

## Features

* All account management features (account creation, recovery, etc).
* All album management features (creating, sharing, moving files, etc).
* Browsing albums with photos and videos with local encrypted caching for speed or offline conditions.
* Uploading files with streaming encryption.
* Photo editing, using a local [Filerobot Image Editor](https://scaleflex.github.io/filerobot-image-editor/)
* Optional push notification when new content or new members are added to shared albums.

## Getting Started

To access the PWA:

* Open your server URL in a browser: `https://${DOMAIN}/${path-prefix}/`. This requires `--enable-webapp` to be set on the server. Or,
* Open https://c2fmzq.org/pwa/ and enter your server URL in the `Server` field. This works with or without `--enable-webapp`, Or,
* Clone https://github.com/c2FmZQ/c2FmZQ.github.io, and publish it on your own web site.

<details>
<summary>Technical Details</summary>

All the cryptographic operations are performed in the browser using
[Sodium-Plus](https://github.com/paragonie/sodium-plus), and the app
implements the same protocol as the c2FmZQ client and the Stingle Photos app.

Push notification is disabled by default on the server. To enable it, use the `inspect edit ps`
command, and set the top-level `enable` option to `true` and set `jwtSubject` to a
valid `mailto:` or `https://` URL \([rfc8292](https://www.rfc-editor.org/rfc/rfc8292#section-2.1)).
Some push services require a valid email address or web site address.

Enabling push notification for the Microsoft Edge browser on Windows requires [extra effort](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/windows-push-notification-services--wns--overview).
```
go run ./c2FmZQ-server/inspect edit ps
```
or,
```
sudo docker exec -it c2fmzq-server inspect edit ps
```
</details>

---

## <a name="experimental"></a>Experimental features

The following features are experimental and could change or disappear in the future.

### <a name="mfa"></a>Multi-Factor Authentication

[WebAuthn](https://webauthn.guide/) and [One-time passwords](https://en.wikipedia.org/wiki/Time-based_One-Time_Password) can
be used as an extra layer of protection for sensitive operations, e.g. login, password changes, account recovery, etc.
A strong password is still required to protect the user's main encryption key.

External security keys (e.g. yubikeys), [passkeys](https://developers.google.com/identity/passkeys), and
[OTP](https://en.wikipedia.org/wiki/Time-based_one-time_password) keys can be added from the `Profile` window
on the progressive web app.

When push notifications are enabled, the progressive web app can also be used to authenticate other clients that
don't have native support for MFA, e.g. the android app. In that case, a notification will appear in the
progressive web app to ask the user to approve or deny the operation.

To use OTP, the user needs an authenticator app like [Google Authenticator](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
or [Authy](https://play.google.com/store/apps/details?id=com.authy.authy).

---

### <a name="decoy"></a>Decoy / duress passwords

Decoy passwords can be associated with any normal account. When a
decoy password is used to login, the login is successful, but the user
is actually logged in with a different account, not their normal account.

Note that logging in with decoy passwords is not as safe as normal accounts
because the passwords have to be known by the server. So, someone with access to
the server metadata could access the files in any decoy account.

To enable, use the `inspect decoy` command.

```
docker exec -it c2fmzq-server inspect decoy
```

---

# <a name="c2FmZQ-client"></a>c2FmZQ Client

The c2FmZQ client can be used by itself, or with a remote ("cloud") server very
similarly.

Sharing only works when content is synced with a remote server.

To connect to a remote server, the user will need to provide the URL of the
server when _create-account_, _login_, or _recover-account_ is used.

To run it:

```bash
cd c2FmZQ/c2FmZQ-client
go build
./c2FmZQ-client
```
```txt
NAME:
   c2FmZQ - Keep your files away from prying eyes.

USAGE:
   c2FmZQ-client [global options] command [command options] [arguments...]

COMMANDS:
   Account:
     backup-phrase    Show the backup phrase for the current account. The backup phrase must be kept secret.
     change-password  Change the user's password.
     create-account   Create an account.
     delete-account   Delete the account and wipe all data.
     login            Login to an account.
     logout           Logout.
     recover-account  Recover an account with backup phrase.
     set-key-backup   Enable or disable secret key backup.
     status           Show the client's status.
     wipe-account     Wipe all local files associated with the current account.
   Albums:
     create-album, mkdir  Create new directory (album).
     delete-album, rmdir  Remove a directory (album).
     rename               Rename a directory (album).
   Files:
     cat, show           Decrypt files and send their content to standard output.
     copy, cp            Copy files to a different directory.
     delete, rm, remove  Delete files (move them to trash, or delete them from trash).
     list, ls            List files and directories.
     move, mv            Move files to a different directory, or rename a directory.
   Import/Export:
     export  Decrypt and export files.
     import  Encrypt and import files.
   Misc:
     licenses  Show the software licenses.
   Mode:
     mount             Mount as a fuse filesystem.
     shell             Run in shell mode.
     webserver         Run web server to access the files.
     webserver-config  Update the web server configuration.
   Share:
     change-permissions, chmod  Change the permissions on a shared directory (album).
     contacts                   List contacts.
     leave                      Remove a directory (album) that is shared with us.
     remove-member              Remove members from a directory (album).
     share                      Share a directory (album) with other people.
     unshare                    Stop sharing a directory (album).
   Sync:
     download, pull   Download a local copy of encrypted files.
     free             Remove the local copy of encrypted files that are backed up.
     sync             Upload changes to remote server.
     updates, update  Pull metadata updates from remote server.

GLOBAL OPTIONS:
   --data-dir DIR, -d DIR        Save the data in DIR (default: "$HOME/.config/.c2FmZQ") [$C2FMZQ_DATADIR]
   --verbose value, -v value     The level of logging verbosity: 1:Error 2:Info 3:Debug (default: 2 (info))
   --passphrase-command COMMAND  Read the database passphrase from the standard output of COMMAND. [$C2FMZQ_PASSPHRASE_CMD]
   --passphrase-file FILE        Read the database passphrase from FILE. [$C2FMZQ_PASSPHRASE_FILE]
   --passphrase value            Use value as database passphrase. [$C2FMZQ_PASSPHRASE]
   --server value                The API server base URL. [$C2FMZQ_API_SERVER]
   --auto-update                 Automatically fetch metadata updates from the remote server before each command. (default: true)
```

---

## <a name="fuse"></a>Mount as fuse filesystem

The c2FmZQ client can mount itself as a fuse filesystem. It supports read and
write operations with some caveats.

* Files can only be opened for writing when they are created, and all writes must
  append. The file content is encrypted as it is written.
* Once a new file is closed, it is read-only (regardless of file permissions).
  The only way to modify a file after that is to delete it or replace it. Renames
  are OK.
* While the fuse filesystem is mounted, data is automatically synchronized with the
  cloud/remote server every minute. Remote content is streamed for reading if a local
  copy doesn't exist.

```bash
mkdir -m 0700 /dev/shm/$USER
# Create a passphrase with with favorite editor.
 echo -n "<INSERT DATABASE PASSPHRASE HERE>" > /dev/shm/$USER/.c2fmzq-passphrase
export C2FMZQ_PASSPHRASE_FILE=/dev/shm/$USER/.c2fmzq-passphrase
```
```bash
mkdir $HOME/mnt
./c2FmZQ-client mount $HOME/mnt
```
```txt
I0604 144921.460 fuse/fuse.go:43] Mounted $HOME/mnt
```

Open a different terminal. You can now access all your files. They will be decrypted on demand as they are read.
```bash
ls -a $HOME/mnt
```
```txt
gallery  .trash
```
Bulk copy in and out of the fuse filesystem should work as expected with:

* cp, cp -r, mv
* tar
* rsync, with --no-times

When you're done, hit `CTRL-C` where the `mount` command is running to close and unmount the fuse filesystem.

---

## <a name="connect-to-stingle"></a>Connecting to stingle.org account

To connect to your stingle.org account, `--server=https://api.stingle.org/` with _login_ or _recover-account_.

```bash
mkdir -m 0700 /dev/shm/$USER
# Create a passphrase with with favorite editor.
 echo -n "<INSERT DATABASE PASSPHRASE HERE>" > /dev/shm/$USER/.c2fmzq-passphrase
export C2FMZQ_PASSPHRASE_FILE=/dev/shm/$USER/.c2fmzq-passphrase
```
```bash
./c2FmZQ-client --server=https://api.stingle.org/ login <email>
```
```txt
Enter password: 
Logged in successfully.
```
```bash
./c2FmZQ-client ls -a
```
```txt
.trash/
gallery/
```
