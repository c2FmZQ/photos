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
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall/js"
	"time"

	"c2FmZQ/internal/pwa/wasm/jsutil"
)

type CacheStorage interface {
	Put(key string, status int, statusText string, headers map[string]string, data []byte) error
	Match(key string) (io.ReadCloser, int, string, map[string]string, bool, error)
	Delete(key string) error
}

type BrowserCache struct {
	cache js.Value
}

func OpenBrowserCache(name string) (*BrowserCache, error) {
	caches := jsutil.Global.Get("caches")
	if !caches.Truthy() {
		return nil, errors.New("CacheStorage unavailable")
	}
	c, err := jsutil.Await(caches.Call("open", name))
	if err != nil {
		return nil, err
	}
	return &BrowserCache{cache: c}, nil
}

func DeleteBrowserCache(name string) error {
	caches := jsutil.Global.Get("caches")
	if !caches.Truthy() {
		return nil
	}
	_, err := jsutil.Await(caches.Call("delete", name))
	return err
}

func (bc *BrowserCache) Put(key string, status int, statusText string, headers map[string]string, data []byte) error {
	if status == 0 {
		status = 200
	}
	if statusText == "" {
		statusText = "OK"
	}
	hdrObj := jsutil.Object.New()
	for k, v := range headers {
		hdrObj.Set(k, v)
	}
	opts := jsutil.NewObject(map[string]any{
		"status":     status,
		"statusText": statusText,
		"headers":    hdrObj,
	})
	u8 := jsutil.Uint8ArrayFromBytes(data)
	resp := jsutil.Response.New(u8, opts)
	_, err := jsutil.Await(bc.cache.Call("put", key, resp))
	return err
}

func (bc *BrowserCache) Match(key string) (io.ReadCloser, int, string, map[string]string, bool, error) {
	resp, err := jsutil.Await(bc.cache.Call("match", key))
	if err != nil {
		return nil, 0, "", nil, false, err
	}
	if resp.IsUndefined() || resp.IsNull() {
		return nil, 0, "", nil, false, nil
	}
	status := resp.Get("status").Int()
	statusText := resp.Get("statusText").String()
	hdrs := make(map[string]string)
	if h := resp.Get("headers"); h.Truthy() {
		var cb js.Func
		cb = js.FuncOf(func(this js.Value, args []js.Value) any {
			if len(args) >= 2 {
				hdrs[args[1].String()] = args[0].String()
			}
			return nil
		})
		h.Call("forEach", cb)
		cb.Release()
	}
	body := resp.Get("body")
	if !body.Truthy() {
		return io.NopCloser(bytes.NewReader(nil)), status, statusText, hdrs, true, nil
	}
	return jsutil.NewStreamReader(body), status, statusText, hdrs, true, nil
}

func (bc *BrowserCache) Delete(key string) error {
	_, err := jsutil.Await(bc.cache.Call("delete", key))
	return err
}

type CacheSummary struct {
	TotalSize    int64 `json:"totalSize"`
	NumEvictable int   `json:"numEvictable"`
}

type CacheItem struct {
	Size      int64 `json:"size"`
	Sticky    bool  `json:"sticky"`
	LastSeen  int64 `json:"lastSeen"`
	NumChunks int   `json:"numChunks"`
	ChunkSize int64 `json:"chunkSize,omitempty"`
}

type CacheOptions struct {
	Add       bool
	Use       bool
	Stick     bool
	Unstick   bool
	Delete    bool
	Size      int64
	NumChunks int
	ChunkSize int64
	Offset    int64
}

type CacheMatchResult struct {
	Body       io.ReadCloser
	Status     int
	StatusText string
	Headers    map[string]string
	Offset     int64
}

type CacheManager struct {
	mu            sync.Mutex
	store         StoreInterface
	cache         CacheStorage
	maxSize       int64
	storePrefix   string
	cachePrefix   string
	summaryKey    string
	summary       CacheSummary
	summaryLoaded bool
	summaryDirty  bool
	saveTimer     *time.Timer
	lastTimestamp int64
}

func NewCacheManager(store StoreInterface, cache CacheStorage, maxSize int64) *CacheManager {
	storePrefix := "cachedata/"
	return &CacheManager{
		store:       store,
		cache:       cache,
		maxSize:     maxSize,
		storePrefix: storePrefix,
		cachePrefix: "local/",
		summaryKey:  storePrefix + "summary",
	}
}

func (cm *CacheManager) nextTimestampLocked() int64 {
	now := time.Now().UnixMilli()
	if now <= cm.lastTimestamp {
		now = cm.lastTimestamp + 1
	}
	cm.lastTimestamp = now
	return now
}

func (cm *CacheManager) CanAdd() bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.summary.NumEvictable > 0 || float64(cm.summary.TotalSize) < float64(cm.maxSize)*0.95
}

func (cm *CacheManager) SetMaxSize(v int64) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.maxSize = v
}

func (cm *CacheManager) TotalSize() int64 {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.summary.TotalSize
}

func (cm *CacheManager) Delete() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if cm.saveTimer != nil {
		cm.saveTimer.Stop()
		cm.saveTimer = nil
	}
	cm.summaryLoaded = false
	cm.summaryDirty = false
	cm.summary = CacheSummary{}
	cm.maxSize = 0
	return cm.store.DelPrefix(cm.storePrefix)
}

func (cm *CacheManager) populateCacheDataLocked() error {
	if cm.summaryLoaded {
		return nil
	}
	var s CacheSummary
	found, err := cm.store.Get(cm.summaryKey, &s)
	if err != nil {
		return err
	}
	if found {
		cm.summary = s
	}
	cm.summaryLoaded = true
	return nil
}

func (cm *CacheManager) SelfCheck() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if err := cm.populateCacheDataLocked(); err != nil {
		return err
	}
	keys, err := cm.store.Keys(cm.storePrefix)
	if err != nil {
		return err
	}
	var totalSize int64
	var numEvictable int
	var savedSummary CacheSummary
	for _, k := range keys {
		if k == cm.summaryKey {
			_, _ = cm.store.Get(k, &savedSummary)
			continue
		}
		var item CacheItem
		found, err := cm.store.Get(k, &item)
		if err != nil || !found {
			continue
		}
		totalSize += item.Size
		if !item.Sticky {
			numEvictable++
		}
	}
	if cm.summary.TotalSize != totalSize || cm.summary.NumEvictable != numEvictable ||
		cm.summary.TotalSize != savedSummary.TotalSize || cm.summary.NumEvictable != savedSummary.NumEvictable {
		cm.summary.TotalSize = totalSize
		cm.summary.NumEvictable = numEvictable
		cm.summaryDirty = true
		cm.delayedSaveLocked()
	}
	return nil
}

func (cm *CacheManager) delayedSaveLocked() {
	if !cm.summaryDirty {
		return
	}
	if cm.saveTimer != nil {
		cm.saveTimer.Stop()
	}
	cm.saveTimer = time.AfterFunc(500*time.Millisecond, func() {
		_ = cm.Flush()
	})
}

func (cm *CacheManager) saveLocked() error {
	if cm.saveTimer != nil {
		cm.saveTimer.Stop()
		cm.saveTimer = nil
	}
	cm.summaryDirty = false
	return cm.store.Set(cm.summaryKey, cm.summary)
}

func (cm *CacheManager) Flush() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.saveLocked()
}

func (cm *CacheManager) Keys() ([]string, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	keys, err := cm.store.Keys(cm.storePrefix)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		if k == cm.summaryKey {
			continue
		}
		out = append(out, strings.TrimPrefix(k, cm.storePrefix))
	}
	return out, nil
}

func (cm *CacheManager) Exists(name string) (bool, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	var item CacheItem
	return cm.store.Get(cm.storePrefix+name, &item)
}

func (cm *CacheManager) Put(name string, r io.Reader, status int, statusText string, headers map[string]string, opt CacheOptions) error {
	chunkSize := opt.ChunkSize
	if chunkSize <= 0 {
		chunkSize = 5 * 1024 * 1024
	}
	chunkKey := func(i int) string {
		return cm.cachePrefix + name + "/" + strconv.Itoa(i)
	}
	count := 0
	buf := make([]byte, chunkSize)
	for {
		n, err := io.ReadFull(r, buf)
		if errors.Is(err, io.EOF) {
			if count == 0 {
				if putErr := cm.cache.Put(chunkKey(0), status, statusText, headers, nil); putErr != nil {
					return putErr
				}
				count = 1
			}
			break
		}
		if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
			for i := 0; i < count; i++ {
				_ = cm.cache.Delete(chunkKey(i))
			}
			return err
		}
		if putErr := cm.cache.Put(chunkKey(count), status, statusText, headers, buf[:n]); putErr != nil {
			for i := 0; i < count; i++ {
				_ = cm.cache.Delete(chunkKey(i))
			}
			return putErr
		}
		count++
		if errors.Is(err, io.ErrUnexpectedEOF) {
			break
		}
	}
	opt.Add = true
	opt.NumChunks = count
	opt.ChunkSize = chunkSize
	return cm.Update(name, opt)
}

func (cm *CacheManager) Match(name string, opt CacheOptions) (*CacheMatchResult, error) {
	cm.mu.Lock()
	var item CacheItem
	found, err := cm.store.Get(cm.storePrefix+name, &item)
	cm.mu.Unlock()
	if err != nil || !found {
		return nil, err
	}
	_ = cm.Update(name, opt)

	startChunk := 0
	if opt.Offset > 0 && item.ChunkSize > 0 {
		startChunk = int(opt.Offset / item.ChunkSize)
	}
	numChunks := item.NumChunks
	if numChunks <= 0 {
		numChunks = 1
	}
	if startChunk >= numChunks {
		return nil, nil
	}

	chunkKey := func(i int) string {
		return cm.cachePrefix + name + "/" + strconv.Itoa(i)
	}
	firstRC, status, statusText, headers, ok, err := cm.cache.Match(chunkKey(startChunk))
	if err != nil || !ok {
		return nil, err
	}

	cr := &chunkedCacheReader{
		cm:        cm,
		name:      name,
		curChunk:  startChunk,
		numChunks: numChunks,
		curReader: firstRC,
	}
	return &CacheMatchResult{
		Body:       cr,
		Status:     status,
		StatusText: statusText,
		Headers:    headers,
		Offset:     int64(startChunk) * item.ChunkSize,
	}, nil
}

type chunkedCacheReader struct {
	cm        *CacheManager
	name      string
	curChunk  int
	numChunks int
	curReader io.ReadCloser
	closed    bool
}

func (r *chunkedCacheReader) Read(p []byte) (int, error) {
	if r.closed {
		return 0, io.ErrClosedPipe
	}
	for {
		if r.curReader == nil {
			r.curChunk++
			if r.curChunk >= r.numChunks {
				return 0, io.EOF
			}
			key := fmt.Sprintf("%s%s/%d", r.cm.cachePrefix, r.name, r.curChunk)
			rc, _, _, _, ok, err := r.cm.cache.Match(key)
			if err != nil {
				return 0, err
			}
			if !ok {
				return 0, io.ErrUnexpectedEOF
			}
			r.curReader = rc
		}
		n, err := r.curReader.Read(p)
		if errors.Is(err, io.EOF) {
			_ = r.curReader.Close()
			r.curReader = nil
			if n > 0 {
				return n, nil
			}
			continue
		}
		return n, err
	}
}

func (r *chunkedCacheReader) Close() error {
	r.closed = true
	if r.curReader != nil {
		err := r.curReader.Close()
		r.curReader = nil
		return err
	}
	return nil
}

func (cm *CacheManager) Update(name string, opt CacheOptions) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if err := cm.populateCacheDataLocked(); err != nil {
		return err
	}
	err := cm.updateInternalLocked(name, opt)
	cm.delayedSaveLocked()
	return err
}

func (cm *CacheManager) updateInternalLocked(name string, opt CacheOptions) error {
	cacheKey := cm.cachePrefix + name
	storeKey := cm.storePrefix + name

	var item CacheItem
	found, err := cm.store.Get(storeKey, &item)
	if err != nil {
		return err
	}
	if opt.Delete {
		if found {
			cm.summary.TotalSize -= item.Size
			cm.summaryDirty = true
			if !item.Sticky {
				cm.summary.NumEvictable--
			}
			_ = cm.store.Del(storeKey)
			for i := 0; i < item.NumChunks; i++ {
				_ = cm.cache.Delete(fmt.Sprintf("%s/%d", cacheKey, i))
			}
		}
	} else {
		var changed bool
		if !found && (opt.Add || opt.Use) {
			numChunks := opt.NumChunks
			if numChunks <= 0 {
				numChunks = 1
			}
			item = CacheItem{
				Size:      opt.Size,
				Sticky:    false,
				LastSeen:  0,
				NumChunks: numChunks,
				ChunkSize: opt.ChunkSize,
			}
			found = true
			changed = true
			cm.summary.TotalSize += item.Size
			cm.summary.NumEvictable++
			cm.summaryDirty = true
		}
		if found {
			if opt.Stick && !item.Sticky {
				cm.summary.NumEvictable--
				cm.summaryDirty = true
				item.Sticky = true
				changed = true
			}
			if opt.Unstick && item.Sticky {
				cm.summary.NumEvictable++
				cm.summaryDirty = true
				item.Sticky = false
				changed = true
			}
			if opt.Use {
				item.LastSeen = cm.nextTimestampLocked()
				changed = true
			}
			if changed {
				if err := cm.store.Set(storeKey, item); err != nil {
					return err
				}
			}
		}
	}
	if cm.summary.NumEvictable > 0 && float64(cm.summary.TotalSize) > float64(cm.maxSize)*0.95 {
		return cm.reclaimCacheLocked()
	}
	return nil
}

func (cm *CacheManager) reclaimCacheLocked() error {
	keys, err := cm.store.Keys(cm.storePrefix)
	if err != nil {
		return err
	}
	type entry struct {
		key   string
		value CacheItem
	}
	var nonSticky []entry
	for _, k := range keys {
		if k == cm.summaryKey || !strings.HasPrefix(k, cm.storePrefix) {
			continue
		}
		var item CacheItem
		found, err := cm.store.Get(k, &item)
		if err != nil || !found {
			continue
		}
		if !item.Sticky {
			nonSticky = append(nonSticky, entry{
				key:   strings.TrimPrefix(k, cm.storePrefix),
				value: item,
			})
		}
	}
	sort.Slice(nonSticky, func(i, j int) bool {
		if nonSticky[i].value.LastSeen == nonSticky[j].value.LastSeen {
			return nonSticky[i].key < nonSticky[j].key
		}
		return nonSticky[i].value.LastSeen < nonSticky[j].value.LastSeen
	})
	for _, it := range nonSticky {
		if float64(cm.summary.TotalSize) <= float64(cm.maxSize)*0.9 {
			break
		}
		storeKey := cm.storePrefix + it.key
		cacheKey := cm.cachePrefix + it.key
		_ = cm.store.Del(storeKey)
		for i := 0; i < it.value.NumChunks; i++ {
			_ = cm.cache.Delete(fmt.Sprintf("%s/%d", cacheKey, i))
		}
		cm.summary.TotalSize -= it.value.Size
		cm.summary.NumEvictable--
	}
	return cm.saveLocked()
}
