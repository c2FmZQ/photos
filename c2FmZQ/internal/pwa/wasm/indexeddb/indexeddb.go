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

package indexeddb

import (
	"errors"
	"syscall/js"

	"c2FmZQ/internal/pwa/wasm/jsutil"
)

const (
	DefaultStoreName = "store"
	DefaultDBVersion = 2
)

var (
	ErrNotFound = errors.New("not found")
	indexedDB   = jsutil.Global.Get("indexedDB")
	idbKeyRange = jsutil.Global.Get("IDBKeyRange")
)

func Databases() ([]string, error) {
	if !indexedDB.Truthy() {
		return nil, errors.New("indexedDB unavailable")
	}
	if dbsFn := indexedDB.Get("databases"); dbsFn.IsUndefined() || dbsFn.Type() != js.TypeFunction {
		return nil, nil
	}
	list, err := jsutil.Await(indexedDB.Call("databases"))
	if err != nil {
		return nil, err
	}
	n := list.Length()
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		name := list.Index(i).Get("name")
		if name.Truthy() {
			out = append(out, name.String())
		}
	}
	return out, nil
}

func DeleteDatabase(name string) error {
	req := indexedDB.Call("deleteDatabase", js.ValueOf(name))
	ch := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		ch <- errors.New("error deleting database")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		ch <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	req.Set("onblocked", okFn)
	return <-ch
}

func Open(name, storeName string, version int) (*DB, error) {
	if storeName == "" {
		storeName = DefaultStoreName
	}
	if version <= 0 {
		version = DefaultDBVersion
	}
	req := indexedDB.Call("open", js.ValueOf(name), js.ValueOf(version))

	type result struct {
		v   js.Value
		err error
	}
	resCh := make(chan result, 2)

	upgradeFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		db := req.Get("result")
		names := db.Get("objectStoreNames")
		if contains := names.Get("contains"); contains.Truthy() {
			if !names.Call("contains", storeName).Bool() {
				db.Call("createObjectStore", storeName)
			}
		} else {
			var found bool
			for i := 0; i < names.Length(); i++ {
				if names.Index(i).String() == storeName {
					found = true
					break
				}
			}
			if !found {
				db.Call("createObjectStore", storeName)
			}
		}
		return nil
	})
	defer upgradeFn.Release()
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		resCh <- result{err: errors.New("error opening database")}
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		resCh <- result{v: req.Get("result")}
		return nil
	})
	defer okFn.Release()
	req.Set("onupgradeneeded", upgradeFn)
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	r := <-resCh
	if r.err != nil {
		return nil, r.err
	}
	return &DB{
		db:        r.v,
		storeName: storeName,
	}, nil
}

type DB struct {
	db        js.Value
	storeName string
}

func (db *DB) Close() {
	if db != nil && db.db.Truthy() {
		db.db.Call("close")
	}
}

func (db *DB) GetRaw(key string) ([]byte, error) {
	req := db.db.Call("transaction", db.storeName, "readonly").Call("objectStore", db.storeName).Call("get", key)
	errCh := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- errors.New("transaction error")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	if err := <-errCh; err != nil {
		return nil, err
	}
	v := req.Get("result")
	if v.IsUndefined() || v.IsNull() {
		return nil, ErrNotFound
	}
	if v.Type() == js.TypeString {
		return []byte(v.String()), nil
	}
	return jsutil.Uint8ArrayToBytes(v), nil
}

func (db *DB) SetRaw(key string, val []byte) error {
	t := db.db.Call("transaction", db.storeName, "readwrite")
	req := t.Call("objectStore", db.storeName).Call("put", jsutil.Uint8ArrayFromBytes(val), key)
	errCh := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- errors.New("transaction error")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	if err := <-errCh; err != nil {
		return err
	}

	compCh := make(chan error, 2)
	tErrFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- errors.New("transaction commit error")
		return nil
	})
	defer tErrFn.Release()
	tOkFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- nil
		return nil
	})
	defer tOkFn.Release()
	t.Set("onerror", tErrFn)
	t.Set("oncomplete", tOkFn)
	if commit := t.Get("commit"); commit.Truthy() {
		t.Call("commit")
	}
	return <-compCh
}

func (db *DB) Del(key string) error {
	return db.delTarget(js.ValueOf(key))
}

func (db *DB) DelPrefix(prefix string) error {
	if prefix == "" {
		return db.Clear()
	}
	return db.delTarget(PrefixRange(prefix))
}

func (db *DB) delTarget(target js.Value) error {
	t := db.db.Call("transaction", db.storeName, "readwrite")
	req := t.Call("objectStore", db.storeName).Call("delete", target)
	errCh := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- errors.New("transaction error")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	if err := <-errCh; err != nil {
		return err
	}

	compCh := make(chan error, 2)
	tErrFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- errors.New("transaction commit error")
		return nil
	})
	defer tErrFn.Release()
	tOkFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- nil
		return nil
	})
	defer tOkFn.Release()
	t.Set("onerror", tErrFn)
	t.Set("oncomplete", tOkFn)
	if commit := t.Get("commit"); commit.Truthy() {
		t.Call("commit")
	}
	return <-compCh
}

func (db *DB) Clear() error {
	t := db.db.Call("transaction", db.storeName, "readwrite")
	req := t.Call("objectStore", db.storeName).Call("clear")
	errCh := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- errors.New("transaction error")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	if err := <-errCh; err != nil {
		return err
	}

	compCh := make(chan error, 2)
	tErrFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- errors.New("transaction commit error")
		return nil
	})
	defer tErrFn.Release()
	tOkFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		compCh <- nil
		return nil
	})
	defer tOkFn.Release()
	t.Set("onerror", tErrFn)
	t.Set("oncomplete", tOkFn)
	if commit := t.Get("commit"); commit.Truthy() {
		t.Call("commit")
	}
	return <-compCh
}

func PrefixRange(p string) js.Value {
	if p == "" || !idbKeyRange.Truthy() {
		return js.Undefined()
	}
	runes := []rune(p)
	runes[len(runes)-1]++
	upper := string(runes)
	return idbKeyRange.Call("bound", p, upper, false, true)
}

func (db *DB) Keys(prefix string) ([]string, error) {
	store := db.db.Call("transaction", db.storeName, "readonly").Call("objectStore", db.storeName)
	var req js.Value
	if prefix != "" {
		req = store.Call("getAllKeys", PrefixRange(prefix))
	} else {
		req = store.Call("getAllKeys")
	}
	errCh := make(chan error, 2)
	errFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- errors.New("transaction error")
		return nil
	})
	defer errFn.Release()
	okFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		errCh <- nil
		return nil
	})
	defer okFn.Release()
	req.Set("onerror", errFn)
	req.Set("onsuccess", okFn)
	if err := <-errCh; err != nil {
		return nil, err
	}
	res := req.Get("result")
	n := res.Length()
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, res.Index(i).String())
	}
	return out, nil
}
