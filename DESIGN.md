# Design and Architecture

This document provides a high-level overview of the c2FmZQ project's design and architecture.

* [Overview](#overview)
* [Features](#features)
* [Architecture](#architecture)
* [Security and Privacy](#security-and-privacy)
* [Scale and Performance](#scale-and-performance)
* [Interoperability](#interoperability)

## Overview

c2FmZQ is an application that can securely encrypt, store, and share files, including but not limited to pictures and videos.

There is a command-line client application, a server application, and a Progressive Web App that can run in most modern browsers.

The server is the central repository where all the encrypted data can be stored. It has no way to access the client's plaintext data. The PWA and the command-line clients are used to import, export, organize, and share files.

_This project is **NOT** associated with stingle.org. This is not the code used by stingle.org. The code in this repo was developed by studying the client app's code and reverse engineering the API. Stingle eventually released their [server code](https://github.com/stingle/stingle-api) in April 2023._

## Features

### c2FmZQ Server
- API server for storing encrypted data.
- Small footprint, can run on various platforms (Linux, macOS, Windows, Raspberry Pi, etc.).
- Can be deployed using Docker.
- Supports TLS via file-based certificates or automatically via Let's Encrypt.
- Can be configured to allow or deny new account registrations.

### c2FmZQ Client
- Command-line interface for interacting with the c2FmZQ server.
- Supports account management, file and album operations, and sharing.
- Can mount the storage as a FUSE filesystem for direct access to files.
- Can sync files with a remote server.

### Progressive Web App (PWA)
- A full-featured web-based client.
- Performs all cryptographic operations in the browser.
- Supports all account and album management features.
- Local encrypted caching for offline access.
- Photo editing capabilities.
- Optional push notifications for shared album updates.

## Architecture

The project follows a classic client-server architecture.

-   **`c2FmZQ-server`**: This is the backend of the application, written in Go. It exposes a RESTful API that clients use to interact with the service. It is responsible for user authentication, data storage, and managing shared album metadata. All data stored on the server is encrypted and the server does not have the keys to decrypt it. The server code is located in the `c2FmZQ/c2FmZQ-server` directory.

-   **`c2FmZQ-client`**: This is a command-line client, also written in Go. It provides a rich set of commands for managing files and albums, as well as account administration. It interacts with the `c2FmZQ-server` via its API. For developers looking to understand the client-side logic, the code in `c2FmZQ/c2FmZQ-client` and `c2FmZQ/internal/client` is the place to start.

-   **Progressive Web App (PWA)**: This is a modern, web-based client built with HTML, JavaScript, and CSS. It runs entirely in the browser and performs all cryptographic operations on the client-side, ensuring that unencrypted data never leaves the user's device. The PWA can be served directly from the `c2FmZQ-server` or hosted on a separate static web host. The source code for the PWA is located in `c2FmZQ/internal/pwa`.

The components communicate over HTTPS, with the clients authenticating to the server using a custom protocol based on NaCl.

## Security and Privacy

**This software has not been reviewed for security.** Review, comments, and contributions are welcome.

The server has no way to decrypt the files that are uploaded by the clients. It only knows how many files you have, how big they are, and who they're shared with.

The clients have to trust the server when sharing albums. The server provides the contact search feature, which returns a User ID and a public key for the contact. A malicious server _could_ replace the contact's User ID and public key with someone else's, making the user think they're sharing with their friend while actually sharing with an attacker. The command-line client application lets the user verify the contact's public key before sharing.

When viewing a shared album, the clients have to trust that the shared content is "safe". Since the server can't decrypt the content, it has no way to sanitize it either. A malicious user _could_ share content that aims to exploit some unpatched vulnerability in the client code.

Since c2FmZQ is compatible with the Stingle Photos API, it uses the [same cryptographic algorithms](https://stingle.org/security/) for authentication, client-server communication, and file encryption.

## Scale and Performance

The server was designed for personal use, not for large scale deployment or speed. On a modern CPU and SSD, it scales to 10+ concurrent users with tens of thousands of files per album, while maintaining a response time well under a second (excluding network I/O).

On a small device, e.g. a raspberry pi, it scales to a handful of concurrent users with a few thousand files per album, and still maintain an acceptable response time.

## Interoperability

The c2FmZQ server and clients use an API that's compatible with the Stingle Photos app (https://github.com/stingle/stingle-photos-android) published by [stingle.org](https://stingle.org). This means that the official Stingle Photos Android app can be configured to connect to a self-hosted c2FmZQ server.

To connect the Stingle Photos app to this server, on the _Welcome Screen_, click the setting button at the top right corner and then enter the URL of your server.