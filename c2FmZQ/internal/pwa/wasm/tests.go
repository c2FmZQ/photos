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
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/nacl/secretbox"

	"c2FmZQ/internal/pwa/wasm/indexeddb"
	"c2FmZQ/internal/pwa/wasm/jsutil"
	"c2FmZQ/internal/stingle"
)

type TestResult struct {
	Test   string   `json:"test"`
	Result string   `json:"result"`
	Err    string   `json:"err,omitempty"`
	Logs   []string `json:"logs,omitempty"`
}

func RunAllTests() []TestResult {
	tests := []struct {
		name string
		fn   func() error
	}{
		{"testSodium", testSodium},
		{"testSodiumWrapper", testSodiumWrapper},
		{"testCache", testCache},
		{"testStore2", testStore2},
	}

	var results []TestResult
	for _, tc := range tests {
		jsutil.Log("Running test:", tc.name)
		err := tc.fn()
		if err != nil {
			jsutil.LogError(tc.name, "FAIL", err)
			results = append(results, TestResult{
				Test:   tc.name,
				Result: "FAIL",
				Err:    err.Error(),
			})
		} else {
			jsutil.Log(tc.name, "PASS")
			results = append(results, TestResult{
				Test:   tc.name,
				Result: "PASS",
			})
		}
	}
	return results
}

func testSodium() error {
	sk := stingle.MakeSecretKey()
	defer sk.Wipe()
	pk := sk.PublicKey()

	enc := pk.SealBox([]byte("Hello!"))

	type keyObj struct {
		SK []byte `json:"sk"`
		PK []byte `json:"pk"`
	}
	ser, err := json.Marshal(keyObj{
		SK: sk.ToBytes(),
		PK: pk.ToBytes(),
	})
	if err != nil {
		return err
	}
	var obj2 keyObj
	if err := json.Unmarshal(ser, &obj2); err != nil {
		return err
	}
	sk2 := stingle.SecretKeyFromBytes(obj2.SK)
	defer sk2.Wipe()

	dec, err := sk2.SealBoxOpen(enc)
	if err != nil {
		return err
	}
	if string(dec) != "Hello!" {
		return fmt.Errorf("unexpected decrypted message: %q", string(dec))
	}
	return nil
}

func testSodiumWrapper() error {
	// hex2bin
	bin, err := hex.DecodeString("666f6f")
	if err != nil || string(bin) != "foo" {
		return fmt.Errorf("hex2bin failed: %v %q", err, string(bin))
	}

	// secretbox
	var key [32]byte
	if _, err := io.ReadFull(rand.Reader, key[:]); err != nil {
		return err
	}
	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return err
	}
	ct := secretbox.Seal(nil, []byte("Hello"), &nonce, &key)
	pt, ok := secretbox.Open(nil, ct, &nonce, &key)
	if !ok || string(pt) != "Hello" {
		return errors.New("secretbox_open failed")
	}

	// pwhash (OPSLIMIT_MIN = 1, MEMLIMIT_MIN = 8192 bytes = 8 KiB)
	salt := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}
	ph := hex.EncodeToString(argon2.IDKey([]byte("foo"), salt, 1, 8, 1, 16))
	if ph != "5bfd3164e49a0a9f0c1b40e0116fc46b" {
		return fmt.Errorf("pwhash got %q, want 5bfd3164e49a0a9f0c1b40e0116fc46b", ph)
	}

	// box
	sk := stingle.MakeSecretKey()
	defer sk.Wipe()
	pk := sk.PublicKey()
	authCT := stingle.EncryptMessage([]byte("Hello"), pk, sk)
	authPT, err := stingle.DecryptMessage(authCT, pk, sk)
	if err != nil || string(authPT) != "Hello" {
		return fmt.Errorf("box_open failed: %v %q", err, string(authPT))
	}

	// box seal
	anonCT := pk.SealBox([]byte("Hello"))
	anonPT, err := sk.SealBoxOpen(anonCT)
	if err != nil || string(anonPT) != "Hello" {
		return fmt.Errorf("box_seal_open failed: %v %q", err, string(anonPT))
	}

	// kdf
	nullKey := make([]byte, 32)
	dkey := stingle.DeriveKey(nullKey, 32, 1, "__data__")
	dkeyHex := hex.EncodeToString(dkey)
	if dkeyHex != "8ad2b64d1db7c2e933a527dc7ec71f45c5a165555bc27f9076c88c5ca841b6a5" {
		return fmt.Errorf("kdf_derive_from_key got %q", dkeyHex)
	}

	// xchacha20poly1305
	ae, err := chacha20poly1305.NewX(dkey)
	if err != nil {
		return err
	}
	enc := ae.Seal(nil, nonce[:], []byte("Hello"), nil)
	dec, err := ae.Open(nil, nonce[:], enc, nil)
	if err != nil || string(dec) != "Hello" {
		return fmt.Errorf("xchacha20poly1305 decrypt failed: %v %q", err, string(dec))
	}
	return nil
}

type mockStore struct {
	order []string
	data  map[string][]byte
}

func newMockStore() *mockStore {
	return &mockStore{
		data: make(map[string][]byte),
	}
}

func (m *mockStore) Get(key string, target any) (bool, error) {
	b, ok := m.data[key]
	if !ok {
		return false, nil
	}
	if target != nil {
		if err := json.Unmarshal(b, target); err != nil {
			return false, err
		}
	}
	return true, nil
}

func (m *mockStore) Set(key string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if _, exists := m.data[key]; !exists {
		m.order = append(m.order, key)
	}
	m.data[key] = b
	return nil
}

func (m *mockStore) Del(key string) error {
	delete(m.data, key)
	for i, k := range m.order {
		if k == key {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
	return nil
}

func (m *mockStore) DelPrefix(prefix string) error {
	var keep []string
	for _, k := range m.order {
		if strings.HasPrefix(k, prefix) {
			delete(m.data, k)
		} else {
			keep = append(keep, k)
		}
	}
	m.order = keep
	return nil
}

func (m *mockStore) Clear() error {
	m.order = nil
	m.data = make(map[string][]byte)
	return nil
}

func (m *mockStore) Keys(prefix string) ([]string, error) {
	var out []string
	for _, k := range m.order {
		if prefix == "" || strings.HasPrefix(k, prefix) {
			out = append(out, k)
		}
	}
	return out, nil
}

type mockCache struct {
	keys map[string][]byte
}

func newMockCache() *mockCache {
	return &mockCache{
		keys: make(map[string][]byte),
	}
}

func (mc *mockCache) Add(key string) {
	mc.keys[key] = []byte{}
}

func (mc *mockCache) Put(key string, status int, statusText string, headers map[string]string, data []byte) error {
	mc.keys[key] = append([]byte{}, data...)
	return nil
}

func (mc *mockCache) Match(key string) (io.ReadCloser, int, string, map[string]string, bool, error) {
	b, ok := mc.keys[key]
	if !ok {
		return nil, 0, "", nil, false, nil
	}
	return io.NopCloser(bytes.NewReader(b)), 200, "OK", nil, true, nil
}

func (mc *mockCache) Delete(key string) error {
	delete(mc.keys, key)
	return nil
}

func testCache() error {
	store := newMockStore()
	cache := newMockCache()
	app := NewClient(store, "/", true, nil, ClientCallbacks{})
	app.cache = cache
	app.albums = map[string]*AlbumRecord{
		"FOO": {
			AlbumID:   "FOO",
			IsOffline: false,
		},
	}
	app.vars = ClientVars{
		MaxCacheSize: 1000,
		CachePref:    "encrypted",
	}
	app.cm = NewCacheManager(store, cache, app.vars.MaxCacheSize)
	app.fetchCachedFileHook = func(name, collection string, isThumb bool) error {
		prefix := "fs"
		if isThumb {
			prefix = "tn"
		}
		cache.Add(fmt.Sprintf("local/%s/%s/0", prefix, name))
		return app.cm.Update(fmt.Sprintf("%s/%s", prefix, name), CacheOptions{
			Add:   true,
			Stick: true,
			Size:  100,
		})
	}

	expectCacheData := func(want string) error {
		keys, err := store.Keys("cachedata/")
		if err != nil {
			return err
		}
		type itemInfo struct {
			name   string
			time   int64
			sticky bool
		}
		var items []itemInfo
		for _, k := range keys {
			if k == "cachedata/summary" {
				continue
			}
			var val CacheItem
			found, err := store.Get(k, &val)
			if err != nil || !found {
				continue
			}
			name := strings.TrimPrefix(k, "cachedata/")
			if val.Sticky {
				name = strings.ToUpper(name)
			}
			items = append(items, itemInfo{
				name:   name,
				time:   val.LastSeen,
				sticky: val.Sticky,
			})
		}
		sort.Slice(items, func(i, j int) bool {
			if items[i].time == items[j].time {
				return items[i].name < items[j].name
			}
			return items[i].time < items[j].time
		})
		names := make([]string, len(items))
		for i, it := range items {
			names[i] = it.name
		}
		got := strings.Join(names, ",")
		if got != want {
			return fmt.Errorf("unexpected cachedata: %q want %q", got, want)
		}
		return nil
	}

	expectCacheSet := func(want string) error {
		var items []string
		for k := range cache.keys {
			items = append(items, strings.TrimPrefix(k, "local/"))
		}
		sort.Strings(items)
		got := strings.Join(items, ",")
		if got != want {
			return fmt.Errorf("unexpected cacheset: %q want %q", got, want)
		}
		return nil
	}

	for i := 0; i < 20; i++ {
		_ = store.Set(fmt.Sprintf("files/gallery/file%d", i), fmt.Sprintf("%d", i))
		if i < 4 {
			_ = store.Set(fmt.Sprintf("files/FOO/file%d", i), fmt.Sprintf("%d", i))
		}
	}
	if err := expectCacheData(""); err != nil {
		return err
	}
	if err := expectCacheSet(""); err != nil {
		return err
	}

	for i := 0; i < 9; i++ {
		cache.Add(fmt.Sprintf("local/tn/file%d/0", i))
		_ = app.cm.Update(fmt.Sprintf("tn/file%d", i), CacheOptions{Use: true, Size: 100})
	}
	if err := expectCacheData("tn/file0,tn/file1,tn/file2,tn/file3,tn/file4,tn/file5,tn/file6,tn/file7,tn/file8"); err != nil {
		return err
	}
	if err := expectCacheSet("tn/file0/0,tn/file1/0,tn/file2/0,tn/file3/0,tn/file4/0,tn/file5/0,tn/file6/0,tn/file7/0,tn/file8/0"); err != nil {
		return err
	}

	_ = app.cm.Update("tn/file0", CacheOptions{Use: true, Size: 100})
	cache.Add("local/tn/file9/0")
	_ = app.cm.Update("tn/file9", CacheOptions{Use: true, Size: 100})

	if err := expectCacheData("tn/file2,tn/file3,tn/file4,tn/file5,tn/file6,tn/file7,tn/file8,tn/file0,tn/file9"); err != nil {
		return err
	}
	if err := expectCacheSet("tn/file0/0,tn/file2/0,tn/file3/0,tn/file4/0,tn/file5/0,tn/file6/0,tn/file7/0,tn/file8/0,tn/file9/0"); err != nil {
		return err
	}

	_ = app.cm.Update("tn/file5", CacheOptions{Delete: true})
	if err := expectCacheData("tn/file2,tn/file3,tn/file4,tn/file6,tn/file7,tn/file8,tn/file0,tn/file9"); err != nil {
		return err
	}
	if err := expectCacheSet("tn/file0/0,tn/file2/0,tn/file3/0,tn/file4/0,tn/file6/0,tn/file7/0,tn/file8/0,tn/file9/0"); err != nil {
		return err
	}

	_ = app.cm.Update("tn/file2", CacheOptions{Stick: true, Size: 100})
	cache.Add("local/tn/file11/0")
	_ = app.cm.Update("tn/file11", CacheOptions{Add: true, Stick: true, Size: 100})
	cache.Add("local/tn/file12/0")
	_ = app.cm.Update("tn/file12", CacheOptions{Use: true, Size: 100})
	cache.Add("local/tn/file13/0")
	_ = app.cm.Update("tn/file13", CacheOptions{Use: true, Size: 100})

	if err := expectCacheData("TN/FILE11,TN/FILE2,tn/file6,tn/file7,tn/file8,tn/file0,tn/file9,tn/file12,tn/file13"); err != nil {
		return err
	}
	if err := expectCacheSet("tn/file0/0,tn/file11/0,tn/file12/0,tn/file13/0,tn/file2/0,tn/file6/0,tn/file7/0,tn/file8/0,tn/file9/0"); err != nil {
		return err
	}

	if _, err := app.checkCachedFiles(); err != nil {
		return err
	}
	if err := expectCacheData("tn/file11,tn/file2,tn/file6,tn/file7,tn/file8,tn/file0,tn/file9,tn/file12,tn/file13"); err != nil {
		return err
	}
	if err := expectCacheSet("tn/file0/0,tn/file11/0,tn/file12/0,tn/file13/0,tn/file2/0,tn/file6/0,tn/file7/0,tn/file8/0,tn/file9/0"); err != nil {
		return err
	}

	app.albums["FOO"].IsOffline = true
	if _, err := app.checkCachedFiles(); err != nil {
		return err
	}
	if err := expectCacheData("FS/FILE0,FS/FILE1,FS/FILE2,FS/FILE3,TN/FILE1,TN/FILE3,TN/FILE2,TN/FILE0,tn/file13"); err != nil {
		return err
	}
	if err := expectCacheSet("fs/file0/0,fs/file1/0,fs/file2/0,fs/file3/0,tn/file0/0,tn/file1/0,tn/file13/0,tn/file2/0,tn/file3/0"); err != nil {
		return err
	}

	return app.cm.Delete()
}

func testStore2() error {
	_ = indexeddb.DeleteDatabase("test")
	st := NewStore("test")
	st.SetPassphrase("Hello world")

	if err := st.Open(); err != nil {
		return err
	}
	defer st.Release()

	if err := st.Clear(); err != nil {
		return err
	}
	if err := st.Set("test", "value 1 2 3"); err != nil {
		return err
	}
	if err := st.Set("arr", []int{0, 1, 2}); err != nil {
		return err
	}

	var gotStr string
	if found, err := st.Get("test", &gotStr); err != nil || !found || gotStr != "value 1 2 3" {
		return fmt.Errorf("st.Get(test) = %v, %q, %v", found, gotStr, err)
	}
	var gotArr []int
	if found, err := st.Get("arr", &gotArr); err != nil || !found || !reflect.DeepEqual(gotArr, []int{0, 1, 2}) {
		return fmt.Errorf("st.Get(arr) = %v, %v, %v", found, gotArr, err)
	}

	checkKeys := func(prefix string, want []string) error {
		got, err := st.Keys(prefix)
		if err != nil {
			return err
		}
		if len(got) == 0 && len(want) == 0 {
			return nil
		}
		if !reflect.DeepEqual(got, want) {
			return fmt.Errorf("st.Keys(%q) = %v, want %v", prefix, got, want)
		}
		return nil
	}

	if err := checkKeys("", []string{"arr", "test"}); err != nil {
		return err
	}
	if err := checkKeys("ar", []string{"arr"}); err != nil {
		return err
	}
	if err := checkKeys("t", []string{"test"}); err != nil {
		return err
	}
	if err := checkKeys("blah", []string{}); err != nil {
		return err
	}
	return nil
}
