# PWA

## Secret key

The `secret key` is the root of trust of a user. It is used to encrypt file keys, album keys, and some request parameters. It can also be used to recover the user's account and force a new password. It is very important to protect it.

Within the PWA, the `secret key` is saved in the encrypted store, which is protected by the `store key`. When the app is _locked_, the `store key` is not present into the PWA anywhere. When the app is _unlocked_, the `lock passphrase` is used to derive the `store key`. The frontend (and the Go/WASM core running in it) keeps the `store key` in memory only, as long as the app is _unlocked_. It is never written to `localStorage`, `sessionStorage`, or IndexedDB. Across a page reload, it is handed to the service worker for a few seconds (see [Reload frontend](#reload-frontend)). There is no API to retrieve the `store key` from the frontend or the service worker, but forensics tools could get it. Knowledge of the `lock passphrase` or the `store key`, combined with the `salt` used to derive the `store key` are sufficient to discover the user's `secret key`.

The user's `password` can also be used to retrieve the `secret key` from the `key bundle` that's stored on the server. The `key bundle` (usually) contains an _encrypted_ version of the `secret key`, and the user's `password` can be used to decrypt it. So, knowledge of the user's `password` is sufficient to discover the user's `secret key`.

The user's `backup phrase` is effectively the same thing about the user's `secret key`, presented in a human-readable format.

```mermaid
flowchart TD
  subgraph SECRETS
    sk[/Secret Key/]
    bp[/Backup Phrase/]
    fk[/File keys/]
    ak[/Album keys/]
  end
  up[/User password/]
  kb[/Key Bundle/]
  lp[/Lock passphrase/]
  subgraph Browser
    subgraph App
      fe(Frontend<br>+ Go/WASM core)
      sw(Service Worker)
      pp[/Store key/]
    end
    db[(IndexedDB)]
  end
  subgraph Cloud
    be(Server)
  end
  
  sk <==> bp
  sk --> fk
  sk --> ak
  ak --> fk
  db -- with store key --> sk
  up --> login[[Login]] --> be
  login --> fe
  fe --> be
  up --> gbp[[Get Backup Phrase]] --> fe
  be --> kb
  kb -- with user password --> sk
  lp --> unlock[[Unlock]] --> fe
  lp ..->|PBKDF2| pp
  fe ..-> pp
  sw ..->|reload only| pp
  fe --> db
  fe -- stream/ requests --> sw
```

## Encrypted store sequence diagrams

The PWA uses an encrypted object store in IndexedDB. The object keys are plaintext, but the values are encrypted with `crypto_secretbox` using a 256-bit key derived from a passphrase provided by the user, or a random key if the user chooses the _skip passphrase_ option.

The store is opened and used by the Go/WASM core, which runs in the frontend (the page). The frontend keeps the `store key` in memory only. The service worker does not use the store. It serves the app's static files, and forwards `stream/` media requests to the frontend for decryption.

Because the frontend reloads when switching between apps, or when the user triggers a page reload, the `store key` would normally be lost on every reload. To avoid prompting the user each time, the frontend hands the `store key` to the service worker right before it unloads, indexed by a random one-time `id` that is saved in `sessionStorage`. The new page retrieves the key with that `id`. The service worker keeps the key in memory only, drops it as soon as it is retrieved, or after 60 seconds, or when the browser terminates the service worker. The key itself is never written to web storage.

When the service worker is not running when the page comes back (e.g. the browser was restarted), or when the store was manually locked, the user has to enter the passphrase.

This section describes the sequence of events for setting a passphrase, locking, unlocking, etc.

Note that the server is not involved at all.

### Set passphrase / unlock

Sequence diagram of setting a passphrase or unlocking the store. This sequence also happens when the frontend is reloaded and the `store key` could not be retrieved from the service worker.

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant W as Go/WASM core<br>(in frontend)
  participant DB as IndexedDB<br>(browser)

  A->>FE: passphrase
  Note over FE: salt = rand(16)<br>pp = PBKDF2(salt, passphrase)
  FE->>W: unlock(name=salt, key=pp)
  Note over W: key = SHA256(name + key)
  W->>DB: get('__sentinel')
  DB->>W: v
  alt v is not set
    rect cyan
    Note over FE,DB: New passphrase<br>Store is unlocked
    W->>DB: set('__sentinel', encrypt(key, nonce))
    W->>FE: ok
    Note over FE: Keep pp in memory<br>Start UI
    end
  else decrypt(key, v) OK
    rect cyan
    Note over FE,DB: Unlock with correct passphrase<br>Store is unlocked
    W->>FE: ok
    Note over FE: Keep pp in memory<br>Start UI
    end
  else decrypt(key, v) FAIL
    rect cyan
    Note over FE,DB: Unlock failed<br>Store is locked
    W->>FE: err=Wrong passphrase
    end
    FE-->>A: Prompt for passphrase
  end
```

### Reload frontend

Sequence diagram of reloading the frontend while the store is unlocked.

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)

  A-->>FE: reload
  rect cyan
  Note over FE: pagehide<br>id = rand(16)<br>sessionStorage.storeKeyId = id
  FE->>SW: saveKey(id, pp)
  Note over SW: savedKeys[id] = pp<br>(expires after 60s)
  end
  Note over FE: New page starts<br>id = sessionStorage.storeKeyId<br>delete sessionStorage.storeKeyId
  FE->>SW: getKey(id) on a private MessageChannel
  alt SW has the key
    rect cyan
    Note over SW: delete savedKeys[id]
    SW->>FE: pp
    Note over FE: unlock(name=salt, key=pp)<br>Start UI
    end
  else SW was terminated, or key expired
    rect cyan
    SW->>FE: null
    end
    FE-->>A: Prompt for passphrase
  end
```

### Lock

Sequence diagram for locking the store.

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant W as Go/WASM core<br>(in frontend)

  A-->>FE: lock
  Note over FE: Delete store key<br>Delete sessionStorage.storeKeyId
  FE->>W: lock
  Note over W: Delete store key<br>Reset app
  Note over FE: reload
  FE-->>A: Prompt for passphrase
```

## Account lifecycle

When a user creates an account, they provide their `email`, a `salt`, a `hashed password`, and a `key bundle`. The `key bundle` contains the user's public key, and usually the user's encrypted secret key.

When the user logs in, they provide their `email`, and their `hashed password`. After the credentials are validated, the server returns a `token` and the user's `key bundle`. The `token` is evidence that the user is logged in and must be included in most requests.

If the user forgets their password, they can use their `backup phrase` to recover their account. The `backup phrase` is a `bip39` mnemonic of the secret key itself, i.e. it is functionally equivalent to the secret key.

### Create account

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant BE as Server<br>(cloud)

  A->>FE: email, password
  rect cyan
  FE->>SW: BEGIN createAccount(email, password)
  Note over SW: Generate keypair<br>Make key bundle<br>Hash password with pwhash
  SW->>BE: /v2/register/createAccount<br>email, salt, hashed password, key bundle
  Note over BE: Create account
  BE->>SW: ok
  rect yellow
    SW->>BE: /v2/login/login<br>email, hashed password
    Note over BE: Validate credentials
    BE->>SW: key bundle, token, ...
    Note over SW: Decode key bundle<br>Save encrypted secret key, token, ... in store
  end
  SW->>FE: END createAccount
  end
  FE-->>A: logged in
```

### Login

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant BE as Server<br>(cloud)

  A->>FE: email, password
  rect cyan
  FE->>SW: BEGIN login(email, password)
  SW->>BE: /v2/login/preLogin<br>email
  BE->>SW: pw salt
  Note over SW: Hash password with pwhash
  rect yellow
    SW->>BE: /v2/login/login<br>email, hashed password
    Note over BE: Validate credentials
    BE->>SW: key bundle, token, ...
    Note over SW: Decode key bundle<br>Save encrypted secret key, token, ... in store
  end
  SW->>FE: END login
  end
  
  FE-->>A: logged in
```

### Recover account

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant BE as Server<br>(cloud)

  A->>FE: email, backup phrase, new password
  rect cyan
  FE->>SW: BEGIN recoverAccount(email, backupPhrase, newPassword)
  Note over SW: bip39 phrase -> secret key
  SW->>BE: /v2/login/checkKey<br>email
  BE->>SW: challenge, server pub key
  Note over SW: Decrypt challenge with secret key
  Note over SW: Make key bundle<br>Hash password with pwhash
  SW->>BE: /v2/login/recoverAccount<br>email, encrypted params, salt, hashed password
  Note over BE: Validate key
  BE->>SW: ok
  rect yellow
    SW->>BE: /v2/login/login<br>email, hashed password
    Note over BE: Validate credentials
    BE->>SW: key bundle, token, ...
    Note over SW: Decode key bundle<br>Save encrypted secret key, token, ... in store
  end
  SW->>FE: END recoverAccount
  end
  
  FE-->>A: logged in
```

### Delete account

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant BE as Server<br>(cloud)

  A->>FE: password
  rect cyan
  FE->>SW: BEGIN deleteAccount(password)
  Note over SW: Hash password with pwhash
  SW->>BE: /v2/login/deleteUser<br>hashed password
  Note over BE: Validate password
  Note over BE: Delete account
  BE->>SW: ok
  SW->>FE: END deleteAccount
  end
  FE-->>A: logged out
```


## Media

Media files are encrypted with a symmetric key. Each file has its own key, which is itself kept encrypted using the either the user's `secret key` or the `album secret key`.

When media files are download, the encrypted blob is retrieved from the server and decrypted by the service worker. Similarly, when a file is uploaded, it is encrypted by the service worker, and then the encrypted blob is uploaded to the server.

### Read / download media

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant CA as Cache<br>(browser)
  participant BE as Server<br>(cloud)

  A-->>FE: Open file
  rect cyan
    FE->>SW: fetch URL
    alt
      rect lightblue
        Note right of SW: In cache? Yes<br>Fetch from cache
        SW->>CA: get
        CA->>SW: stream ciphertext
      end
    else
      rect lightgreen
        Note right of SW: In cache? No<br>Fetch from server 
        SW->>BE: /v2/sync/getUrl<br>file, set, token
        Note over BE: Validate token
        BE->>SW: URL
        SW->>BE: fetch URL
        BE->>SW: stream ciphertext
        Note right of SW: Add to cache
        SW->>CA: stream ciphertext
      end
    end
    Note over SW: Decrypt file key
    Note over SW: Decrypt stream
    SW->>FE: stream plaintext
  end
  FE-->>A: Display content
```

### Upload media

```mermaid
sequenceDiagram
  actor A as User
  participant FE as Frontend<br>(browser)
  participant SW as Service Worker<br>(browser)
  participant BE as Server<br>(cloud)

  A-->>FE: Upload file
  rect cyan
    FE->>SW: BEGIN upload(file)
    rect lightgreen
      Note over SW: Create file ID<br>Create key<br>Create header, etc.
      Note over SW: Encrypt stream
      SW->>BE: /v2/sync/upload<br>file, set, token<br>Stream ciphertext
      Note over BE: Validate token<br>Create file, etc.
      BE->>SW: 200
    end
    SW->>FE: END upload
  end
  FE-->>A: Success
```
