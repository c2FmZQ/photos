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
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"sync"

	"golang.org/x/crypto/nacl/secretbox"

	"c2FmZQ/internal/pwa/wasm/indexeddb"
)

type StoreInterface interface {
	Get(key string, target any) (bool, error)
	Set(key string, value any) error
	Del(key string) error
	DelPrefix(prefix string) error
	Clear() error
	Keys(prefix string) ([]string, error)
}

type Store struct {
	mu         sync.Mutex
	name       string
	passphrase string
	key        *[32]byte
	db         *indexeddb.DB
	refs       int
}

func NewStore(name string) *Store {
	if name == "" {
		name = "c2FmZQ"
	}
	return &Store{
		name: name,
	}
}

func wipeBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

func (s *Store) Lock() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.key != nil {
		wipeBytes(s.key[:])
	}
	s.key = nil
	s.passphrase = ""
	if s.db != nil {
		s.db.Close()
		s.db = nil
	}
	s.refs = 0
}

func (s *Store) Locked() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.passphrase == "" || s.key == nil
}

func (s *Store) Passphrase() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.passphrase
}

func (s *Store) Name() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.name
}

func (s *Store) SetPassphrase(pp string) {
	if pp == "" {
		s.Lock()
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.passphrase = pp
	s.updateKeyLocked()
}

func (s *Store) SetName(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil && s.name != name {
		s.db.Close()
		s.db = nil
	}
	s.name = name
	s.updateKeyLocked()
}

func (s *Store) updateKeyLocked() {
	if s.key != nil {
		wipeBytes(s.key[:])
		s.key = nil
	}
	if s.passphrase == "" || s.name == "" {
		return
	}
	h := sha256.Sum256([]byte(s.name + "##" + s.passphrase))
	s.key = &h
}

func (s *Store) Open() error {
	s.mu.Lock()
	if s.key == nil {
		s.mu.Unlock()
		return errors.New("locked")
	}
	s.refs++
	if s.db != nil {
		s.mu.Unlock()
		return nil
	}
	name := s.name
	s.mu.Unlock()

	db, err := indexeddb.Open(name, indexeddb.DefaultStoreName, indexeddb.DefaultDBVersion)
	if err != nil {
		s.mu.Lock()
		s.refs--
		if s.refs < 0 {
			s.refs = 0
		}
		s.mu.Unlock()
		return err
	}

	s.mu.Lock()
	if s.db != nil {
		db.Close()
	} else {
		s.db = db
	}
	s.mu.Unlock()
	return nil
}

func (s *Store) Release() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refs--
	if s.refs < 0 {
		s.refs = 0
	}
	if s.db != nil && s.refs == 0 {
		s.db.Close()
		s.db = nil
	}
}

func (s *Store) Check() bool {
	var sentinel string
	found, err := s.Get("__sentinel", &sentinel)
	if err != nil {
		return false
	}
	if found && sentinel != "" {
		return true
	}
	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return false
	}
	if err := s.Set("__sentinel", hex.EncodeToString(nonce[:])); err != nil {
		return false
	}
	return true
}

func (s *Store) encrypt(data any) ([]byte, error) {
	s.mu.Lock()
	if s.key == nil {
		s.mu.Unlock()
		return nil, errors.New("locked")
	}
	var key [32]byte
	copy(key[:], s.key[:])
	s.mu.Unlock()
	defer wipeBytes(key[:])

	payload, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	defer wipeBytes(payload)

	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return nil, err
	}
	out := make([]byte, 24, 24+len(payload)+secretbox.Overhead)
	copy(out, nonce[:])
	out = secretbox.Seal(out, payload, &nonce, &key)
	return out, nil
}

func (s *Store) decrypt(data []byte, target any) error {
	s.mu.Lock()
	if s.key == nil {
		s.mu.Unlock()
		return errors.New("locked")
	}
	var key [32]byte
	copy(key[:], s.key[:])
	s.mu.Unlock()
	defer wipeBytes(key[:])

	if len(data) < 24+secretbox.Overhead {
		return errors.New("ciphertext too short")
	}
	var nonce [24]byte
	copy(nonce[:], data[:24])
	pt, ok := secretbox.Open(nil, data[24:], &nonce, &key)
	if !ok {
		return errors.New("decryption failed")
	}
	defer wipeBytes(pt)

	if target == nil {
		return nil
	}
	return json.Unmarshal(pt, target)
}

func (s *Store) withDB(fn func(db *indexeddb.DB) error) error {
	if err := s.Open(); err != nil {
		return err
	}
	defer s.Release()
	s.mu.Lock()
	db := s.db
	s.mu.Unlock()
	if db == nil {
		return errors.New("database closed")
	}
	return fn(db)
}

func (s *Store) Get(key string, target any) (bool, error) {
	var raw []byte
	err := s.withDB(func(db *indexeddb.DB) error {
		var err error
		raw, err = db.GetRaw(key)
		return err
	})
	if errors.Is(err, indexeddb.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := s.decrypt(raw, target); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) Set(key string, value any) error {
	enc, err := s.encrypt(value)
	if err != nil {
		return err
	}
	return s.withDB(func(db *indexeddb.DB) error {
		return db.SetRaw(key, enc)
	})
}

func (s *Store) Del(key string) error {
	return s.withDB(func(db *indexeddb.DB) error {
		return db.Del(key)
	})
}

func (s *Store) DelPrefix(prefix string) error {
	return s.withDB(func(db *indexeddb.DB) error {
		return db.DelPrefix(prefix)
	})
}

func (s *Store) Clear() error {
	return s.withDB(func(db *indexeddb.DB) error {
		return db.Clear()
	})
}

func (s *Store) Keys(prefix string) ([]string, error) {
	var keys []string
	err := s.withDB(func(db *indexeddb.DB) error {
		var err error
		keys, err = db.Keys(prefix)
		return err
	})
	return keys, err
}
