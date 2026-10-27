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

//go:build js && wasm

package main

import (
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"slices"
	"sync"
	"syscall/js"

	"c2FmZQ/internal/pwa/wasm/indexeddb"
	"c2FmZQ/internal/pwa/wasm/jsutil"
)

type wasmApp struct {
	mu           sync.Mutex
	store        *Store
	client       *Client
	sameOrigin   bool
	capabilities []string
	callbacks    ClientCallbacks
}

func main() {
	app := &wasmApp{
		store:      NewStore("c2FmZQ"),
		sameOrigin: true,
	}

	api := jsutil.Object.New()
	api.Set("configure", js.FuncOf(app.jsConfigure))
	api.Set("derivePassphraseKey", js.FuncOf(app.jsDerivePassphraseKey))
	api.Set("unlock", js.FuncOf(app.jsUnlock))
	api.Set("lock", js.FuncOf(app.jsLock))
	api.Set("call", js.FuncOf(app.jsCall))
	api.Set("runTests", js.FuncOf(app.jsRunTests))

	if readyCb := jsutil.Global.Get("__c2fmzqWasmReady"); readyCb.Truthy() && readyCb.Type() == js.TypeFunction {
		jsutil.Global.Delete("__c2fmzqWasmReady")
		readyCb.Invoke(api)
	}
	select {}
}

func (a *wasmApp) jsConfigure(this js.Value, args []js.Value) any {
	if len(args) == 0 || !args[0].Truthy() {
		return nil
	}
	opts := args[0]
	a.mu.Lock()
	defer a.mu.Unlock()

	if so := opts.Get("sameOrigin"); !so.IsUndefined() {
		a.sameOrigin = so.Bool()
	}
	if caps := opts.Get("capabilities"); caps.Truthy() {
		var c []string
		_ = jsutil.FromJSValue(caps, &c)
		a.capabilities = c
	}
	if fn := opts.Get("onError"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.OnError = func(msg string) {
			fn.Invoke(msg)
		}
	}
	if fn := opts.Get("onInfo"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.OnInfo = func(msg string) {
			fn.Invoke(msg)
		}
	}
	if fn := opts.Get("onLoggedOut"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.OnLoggedOut = func() {
			fn.Invoke()
		}
	}
	if fn := opts.Get("onUploadProgress"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.OnUploadProgress = func(progress map[string]any) {
			fn.Invoke(jsutil.ToJSValue(progress))
		}
	}
	if fn := opts.Get("onDownloadProgress"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.OnDownloadProgress = func(progress map[string]any) {
			fn.Invoke(jsutil.ToJSValue(progress))
		}
	}
	if fn := opts.Get("getMFA"); fn.Truthy() && fn.Type() == js.TypeFunction {
		a.callbacks.GetMFA = func(mfa any) (any, error) {
			resVal, err := jsutil.Await(fn.Invoke(jsutil.ToJSValue(mfa)))
			if err != nil {
				return nil, err
			}
			var out any
			if err := jsutil.FromJSValue(resVal, &out); err != nil {
				return nil, err
			}
			return out, nil
		}
	}
	return nil
}

func (a *wasmApp) jsDerivePassphraseKey(this js.Value, args []js.Value) any {
	return jsutil.NewPromise(func() (any, error) {
		if len(args) < 2 {
			return nil, fmt.Errorf("missing arguments")
		}
		passphrase := args[0].String()
		salt := jsutil.Uint8ArrayToBytes(args[1])
		dk, err := pbkdf2.Key(sha256.New, passphrase, salt, 200000, 64)
		if err != nil {
			return nil, err
		}
		defer wipeBytes(dk)
		return base64.StdEncoding.EncodeToString(dk), nil
	})
}

func (a *wasmApp) jsUnlock(this js.Value, args []js.Value) any {
	return jsutil.NewPromise(func() (any, error) {
		if len(args) == 0 || !args[0].Truthy() {
			return map[string]any{"ok": false}, nil
		}
		opts := args[0]
		storeKey := ""
		if sk := opts.Get("storeKey"); sk.Truthy() {
			storeKey = sk.String()
		}
		storeName := ""
		if sn := opts.Get("storeName"); sn.Truthy() {
			storeName = sn.String()
		}
		reset := false
		if r := opts.Get("reset"); r.Truthy() {
			reset = r.Bool()
		}
		if storeKey == "" || storeName == "" {
			return map[string]any{"ok": false}, nil
		}

		dbs, err := indexeddb.Databases()
		var dbList []string
		if err == nil && dbs != nil {
			for _, name := range dbs {
				if name != "notifications" {
					dbList = append(dbList, name)
				}
			}
		} else {
			dbList = []string{storeName}
		}

		if !reset && len(dbList) > 0 && !slices.Contains(dbList, storeName) {
			return map[string]any{
				"ok":  false,
				"err": T("wrong-passphrase"),
			}, nil
		}

		a.mu.Lock()
		defer a.mu.Unlock()

		a.store.SetName(storeName)
		a.store.SetPassphrase(storeKey)
		if err := a.store.Open(); err != nil {
			a.store.Lock()
			return nil, err
		}
		defer a.store.Release()

		if !a.store.Check() {
			a.store.Lock()
			return map[string]any{
				"ok":  false,
				"err": T("wrong-passphrase"),
			}, nil
		}

		for _, name := range dbList {
			if name != storeName {
				_ = indexeddb.DeleteDatabase(name)
			}
		}

		if a.client == nil {
			client := NewClient(a.store, jsutil.PathPrefix(), a.sameOrigin, a.capabilities, a.callbacks)
			if err := client.Init(); err != nil {
				return nil, err
			}
			a.client = client
			jsutil.InitStreamHelper(client.HandleStreamRequest)
		}

		return map[string]any{
			"ok":       true,
			"storeKey": storeKey,
		}, nil
	})
}

func (a *wasmApp) jsLock(this js.Value, args []js.Value) any {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.client != nil {
		a.client.CancelUpload()
		go a.client.cancelCheckCachedFiles()
		a.client.Wipe()
	}
	a.store.Lock()
	a.client = nil
	return nil
}

func (a *wasmApp) jsRunTests(this js.Value, args []js.Value) any {
	return jsutil.NewPromise(func() (any, error) {
		a.mu.Lock()
		busy := a.client != nil
		a.mu.Unlock()
		if busy {
			return nil, fmt.Errorf("cannot run tests while unlocked")
		}
		return RunAllTests(), nil
	})
}

func (a *wasmApp) jsCall(this js.Value, args []js.Value) any {
	return jsutil.NewPromise(func() (any, error) {
		if len(args) == 0 {
			return nil, fmt.Errorf("missing method name")
		}
		method := args[0].String()
		callArgs := args[1:]

		a.mu.Lock()
		client := a.client
		store := a.store
		a.mu.Unlock()

		if client == nil {
			return nil, fmt.Errorf("app not initialized")
		}
		if err := store.Open(); err != nil {
			return nil, err
		}
		defer store.Release()

		switch method {
		case "ping":
			return true, nil
		case "isLoggedIn":
			return client.IsLoggedIn(), nil
		case "quota":
			return client.Quota(), nil
		case "keyBackupEnabled":
			return client.KeyBackupEnabled(), nil
		case "login":
			var la LoginArgs
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &la); err != nil {
					return nil, err
				}
			}
			return client.Login(la)
		case "createAccount":
			var la LoginArgs
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &la); err != nil {
					return nil, err
				}
			}
			return client.CreateAccount(la)
		case "recoverAccount":
			var la LoginArgs
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &la); err != nil {
					return nil, err
				}
			}
			return client.RecoverAccount(la)
		case "logout":
			return nil, client.Logout()
		case "changeKeyBackup":
			var pw string
			var doBackup bool
			if len(callArgs) > 0 {
				pw = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				doBackup = callArgs[1].Bool()
			}
			return client.ChangeKeyBackup(pw, doBackup)
		case "restoreSecretKey":
			var bp string
			if len(callArgs) > 0 {
				bp = callArgs[0].String()
			}
			return nil, client.RestoreSecretKey(bp)
		case "backupPhrase":
			var pw string
			if len(callArgs) > 0 {
				pw = callArgs[0].String()
			}
			return client.BackupPhrase(pw)
		case "updateProfile":
			var upa UpdateProfileArgs
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &upa); err != nil {
					return nil, err
				}
			}
			return nil, client.UpdateProfile(upa)
		case "deleteAccount":
			var pw string
			if len(callArgs) > 0 {
				pw = callArgs[0].String()
			}
			return nil, client.DeleteAccount(pw)
		case "listSecurityKeys":
			return client.ListSecurityKeys()
		case "addSecurityKey":
			var argVal js.Value
			if len(callArgs) > 0 {
				argVal = callArgs[0]
			}
			return client.AddSecurityKey(argVal)
		case "mfaStatus":
			return client.MfaStatus()
		case "mfaCheck":
			var passKey bool
			if len(callArgs) > 0 && callArgs[0].Truthy() {
				passKey = callArgs[0].Bool()
			}
			return client.MfaCheck(passKey)
		case "generateOTP":
			return client.GenerateOTP()
		case "adminUsers":
			var changes any
			if len(callArgs) > 0 && !callArgs[0].IsUndefined() && !callArgs[0].IsNull() {
				if err := jsutil.FromJSValue(callArgs[0], &changes); err != nil {
					return nil, err
				}
			}
			return client.AdminUsers(changes)
		case "getUpdates":
			return nil, client.GetUpdates()
		case "emptyTrash":
			return client.EmptyTrash()
		case "deleteFiles":
			var files []string
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &files); err != nil {
					return nil, err
				}
			}
			return client.DeleteFiles(files)
		case "changeCover":
			var albumID, cover string
			if len(callArgs) > 0 {
				albumID = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				cover = callArgs[1].String()
			}
			return client.ChangeCover(albumID, cover)
		case "moveFiles":
			var from, to string
			var files []string
			var isMove bool
			if len(callArgs) > 0 {
				from = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				to = callArgs[1].String()
			}
			if len(callArgs) > 2 {
				_ = jsutil.FromJSValue(callArgs[2], &files)
			}
			if len(callArgs) > 3 {
				isMove = callArgs[3].Bool()
			}
			return client.MoveFiles(from, to, files, isMove)
		case "getContact":
			var email string
			if len(callArgs) > 0 {
				email = callArgs[0].String()
			}
			return client.GetContact(email)
		case "getContacts":
			return client.GetContacts(), nil
		case "getFiles":
			var col string
			var offset int
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 && !callArgs[1].IsUndefined() && !callArgs[1].IsNull() {
				offset = callArgs[1].Int()
			}
			return client.GetFiles(col, offset)
		case "getCollections":
			return client.GetCollections()
		case "getCover":
			var col string
			var optCode *string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 && !callArgs[1].IsUndefined() && !callArgs[1].IsNull() {
				s := callArgs[1].String()
				optCode = &s
			}
			return client.GetCover(col, optCode)
		case "renameCollection":
			var col, name string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				name = callArgs[1].String()
			}
			return client.RenameCollection(col, name)
		case "setCollectionOffline":
			var col string
			var isOffline bool
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				isOffline = callArgs[1].Bool()
			}
			return nil, client.SetCollectionOffline(col, isOffline)
		case "shareCollection":
			var col string
			var perms PermissionsArg
			var members []string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				_ = jsutil.FromJSValue(callArgs[1], &perms)
			}
			if len(callArgs) > 2 {
				_ = jsutil.FromJSValue(callArgs[2], &members)
			}
			return client.ShareCollection(col, perms, members)
		case "unshareCollection":
			var col string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			return client.UnshareCollection(col)
		case "removeMembers":
			var col string
			var members []string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				_ = jsutil.FromJSValue(callArgs[1], &members)
			}
			return client.RemoveMembers(col, members)
		case "updatePermissions":
			var col string
			var perms PermissionsArg
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				_ = jsutil.FromJSValue(callArgs[1], &perms)
			}
			return client.UpdatePermissions(col, perms)
		case "leaveCollection":
			var col string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			return client.LeaveCollection(col)
		case "createCollection":
			var name string
			if len(callArgs) > 0 {
				name = callArgs[0].String()
			}
			return client.CreateCollection(name)
		case "deleteCollection":
			var col string
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			return client.DeleteCollection(col)
		case "setCachePreference":
			var pref CachePreferenceArg
			if len(callArgs) > 0 {
				if err := jsutil.FromJSValue(callArgs[0], &pref); err != nil {
					return nil, err
				}
			}
			return nil, client.SetCachePreference(pref)
		case "cachePreference":
			return client.CachePreference(), nil
		case "enableNotifications":
			var onoff bool
			if len(callArgs) > 0 {
				onoff = callArgs[0].Bool()
			}
			return client.EnableNotifications(onoff)
		case "upload":
			var col string
			var filesJS js.Value
			if len(callArgs) > 0 {
				col = callArgs[0].String()
			}
			if len(callArgs) > 1 {
				filesJS = callArgs[1]
			}
			return "ok", client.Upload(col, filesJS)
		case "cancelUpload":
			client.CancelUpload()
			return nil, nil
		default:
			return nil, fmt.Errorf("method not allowed: %s", method)
		}
	})
}
