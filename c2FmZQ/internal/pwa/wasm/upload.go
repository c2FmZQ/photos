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
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall/js"
	"time"

	"golang.org/x/crypto/chacha20poly1305"

	"c2FmZQ/internal/pwa/wasm/jsutil"
	"c2FmZQ/internal/stingle"
)

type uploadItem struct {
	fileJS        js.Value
	fileSize      int64
	fileTypeStr   string
	fileName      string
	dateCreated   string
	dateModified  string
	duration      int32
	tn            []byte
	tnSize        int64
	uploadedBytes atomic.Int64
	done          atomic.Bool
}

type uploadBatch struct {
	collection string
	files      []*uploadItem
	doneCh     chan error
	done       bool
	err        error
}

func (c *Client) CancelUpload() {
	c.uploadMu.Lock()
	defer c.uploadMu.Unlock()
	c.uploadCancel = true
	cancelErr := errors.New(T("canceled"))
	for _, b := range c.uploadBatches {
		if b.err == nil {
			b.err = cancelErr
		}
	}
}

func (c *Client) isUploadCanceled() bool {
	c.uploadMu.Lock()
	defer c.uploadMu.Unlock()
	return c.uploadCancel
}

func (c *Client) Upload(collection string, filesJS js.Value) error {
	if !filesJS.Truthy() || filesJS.Length() == 0 {
		return nil
	}

	c.uploadMu.Lock()
	if len(c.uploadBatches) > 0 && c.uploadCancel {
		c.uploadMu.Unlock()
		return errors.New(T("canceled"))
	}
	c.uploadCancel = false
	if !c.streamingUploadChecked {
		c.streamingUploadWorks = testUploadStream()
		c.streamingUploadChecked = true
	}
	c.uploadMu.Unlock()

	n := filesJS.Length()
	items := make([]*uploadItem, 0, n)
	for i := 0; i < n; i++ {
		fObj := filesJS.Index(i)
		fBlob := fObj.Get("file")
		fileSize := int64(fBlob.Get("size").Float())
		fileTypeStr := ""
		if ft := fBlob.Get("type"); ft.Truthy() {
			fileTypeStr = ft.String()
		}
		fileName := ""
		if fn := fObj.Get("name"); fn.Truthy() {
			fileName = fn.String()
		} else if fn := fBlob.Get("name"); fn.Truthy() {
			fileName = fn.String()
		}
		nowStr := strconv.FormatInt(time.Now().UnixMilli(), 10)
		dateCreated := nowStr
		if dc := fObj.Get("dateCreated"); dc.Truthy() {
			dateCreated = fmt.Sprintf("%.0f", dc.Float())
		} else if lm := fBlob.Get("lastModified"); lm.Truthy() {
			dateCreated = fmt.Sprintf("%.0f", lm.Float())
		}
		dateModified := nowStr
		if dm := fObj.Get("dateModified"); dm.Truthy() {
			dateModified = fmt.Sprintf("%.0f", dm.Float())
		} else if lm := fBlob.Get("lastModified"); lm.Truthy() {
			dateModified = fmt.Sprintf("%.0f", lm.Float())
		}
		var duration int32
		if dur := fObj.Get("duration"); dur.Truthy() {
			duration = int32(dur.Float())
		}
		var tnBytes []byte
		if tnVal := fObj.Get("thumbnail"); tnVal.Truthy() {
			parts := strings.SplitN(tnVal.String(), ",", 2)
			if len(parts) == 2 {
				tnBytes, _ = base64DecimalOrBase64Decode(parts[1])
			}
		}
		items = append(items, &uploadItem{
			fileJS:       fBlob,
			fileSize:     fileSize,
			fileTypeStr:  fileTypeStr,
			fileName:     fileName,
			dateCreated:  dateCreated,
			dateModified: dateModified,
			duration:     duration,
			tn:           tnBytes,
			tnSize:       int64(len(tnBytes)),
		})
	}

	batch := &uploadBatch{
		collection: collection,
		files:      items,
		doneCh:     make(chan error, 1),
	}

	c.uploadMu.Lock()
	alreadyRunning := len(c.uploadBatches) > 0
	c.uploadBatches = append(c.uploadBatches, batch)
	c.uploadMu.Unlock()

	if !alreadyRunning {
		go c.runUploadBatches()
	}

	return <-batch.doneCh
}

func (c *Client) notifyUploadProgress() bool {
	c.uploadMu.Lock()
	batches := append([]*uploadBatch{}, c.uploadBatches...)
	c.uploadMu.Unlock()
	return c.reportUploadProgress(batches)
}

func (c *Client) reportUploadProgress(batches []*uploadBatch) bool {
	if len(batches) == 0 {
		return true
	}

	var numFiles, numFilesDone int
	var numBytes, numBytesDone int64
	allDone := true
	for _, b := range batches {
		if !b.done && b.err == nil {
			allDone = false
		}
		for _, f := range b.files {
			numFiles++
			numBytes += f.fileSize + f.tnSize
			if f.done.Load() {
				numFilesDone++
				numBytesDone += f.fileSize + f.tnSize
			} else {
				numBytesDone += f.uploadedBytes.Load()
			}
		}
	}
	if c.callbacks.OnUploadProgress != nil {
		c.callbacks.OnUploadProgress(map[string]any{
			"numFiles":     numFiles,
			"numBytes":     numBytes,
			"numFilesDone": numFilesDone,
			"numBytesDone": numBytesDone,
			"done":         allDone,
		})
	}
	return allDone
}

func (c *Client) runUploadBatches() {
	ticker := time.NewTicker(500 * time.Millisecond)
	stopCh := make(chan struct{})
	go func() {
		c.notifyUploadProgress()
		for {
			select {
			case <-ticker.C:
				c.notifyUploadProgress()
			case <-stopCh:
				return
			}
		}
	}()

	for {
		c.uploadMu.Lock()
		var nextBatch *uploadBatch
		for _, b := range c.uploadBatches {
			if !b.done {
				nextBatch = b
				break
			}
		}
		if nextBatch == nil {
			// Clear the queue in the same critical section as the
			// "nothing left to do" check. Otherwise, an Upload()
			// call that appends a batch in between would see a
			// non-empty queue, not start a new runner, and its
			// batch would be dropped when the queue is cleared.
			finished := c.uploadBatches
			c.uploadBatches = nil
			c.uploadMu.Unlock()

			close(stopCh)
			ticker.Stop()
			c.reportUploadProgress(finished)
			return
		}
		c.uploadMu.Unlock()

		for _, item := range nextBatch.files {
			if nextBatch.err != nil || c.isUploadCanceled() {
				if nextBatch.err == nil {
					nextBatch.err = errors.New(T("canceled"))
				}
				break
			}
			item.uploadedBytes.Store(0)
			if err := c.uploadFile(nextBatch.collection, item, false); err != nil {
				jsutil.LogError("Upload failed:", item.fileName, err)
				nextBatch.err = err
				break
			}
			item.tn = nil
		}
		nextBatch.done = true
		nextBatch.doneCh <- nextBatch.err
	}
}

func (c *Client) makeUploadHeaders(pk stingle.PublicKey, item *uploadItem) ([2]*stingle.Header, [2][]byte, string, error) {
	var hdrs [2]*stingle.Header
	var binHdrs [2][]byte
	var b64Hdrs [2]string

	fileID := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, fileID); err != nil {
		return hdrs, binHdrs, "", err
	}
	fileType := uint8(stingle.FileTypeGeneral)
	if strings.HasPrefix(item.fileTypeStr, "image/") {
		fileType = stingle.FileTypePhoto
	} else if strings.HasPrefix(item.fileTypeStr, "video/") {
		fileType = stingle.FileTypeVideo
	}

	sizes := [2]int64{item.fileSize, item.tnSize}
	for i := 0; i < 2; i++ {
		symKey := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, symKey); err != nil {
			return hdrs, binHdrs, "", err
		}
		h := &stingle.Header{
			FileID:        fileID,
			Version:       1,
			ChunkSize:     1 << 20,
			DataSize:      sizes[i],
			SymmetricKey:  symKey,
			FileType:      fileType,
			Filename:      []byte(item.fileName),
			VideoDuration: item.duration,
		}
		var buf bytes.Buffer
		if err := stingle.EncryptHeader(&buf, h, pk); err != nil {
			return hdrs, binHdrs, "", err
		}
		hdrs[i] = h
		binHdrs[i] = buf.Bytes()
		b64Hdrs[i] = base64.RawURLEncoding.EncodeToString(binHdrs[i])
	}
	return hdrs, binHdrs, b64Hdrs[0] + "*" + b64Hdrs[1], nil
}

func (c *Client) uploadFile(collection string, item *uploadItem, noStreaming bool) error {
	var pk stingle.PublicKey
	if collection == "gallery" {
		var err error
		pk, err = c.publicKey()
		if err != nil {
			return err
		}
	} else {
		alb, ok := c.albums[collection]
		if !ok {
			return fmt.Errorf("invalid album %s", collection)
		}
		pkBytes, err := base64DecimalOrBase64Decode(alb.PK)
		if err != nil {
			return err
		}
		pk = stingle.PublicKeyFromBytes(pkBytes)
	}

	hdrs, binHdrs, hdrBase64, err := c.makeUploadHeaders(pk, item)
	if err != nil {
		return err
	}
	defer func() {
		hdrs[0].Wipe()
		hdrs[1].Wipe()
	}()

	if c.isUploadCanceled() {
		return errors.New(T("canceled"))
	}

	boundaryBytes := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, boundaryBytes)
	boundary := hex.EncodeToString(boundaryBytes)

	fnBytes := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, fnBytes)
	filename := base64.RawURLEncoding.EncodeToString(fnBytes) + ".sp"

	setStr := "0"
	albumID := ""
	if collection != "gallery" {
		setStr = "2"
		albumID = collection
	}
	tok := c.token()

	pr, pw := io.Pipe()
	go func() {
		var writeErr error
		defer func() {
			if writeErr != nil {
				_ = pw.CloseWithError(writeErr)
			} else {
				_ = pw.Close()
			}
		}()

		fields := [][2]string{
			{"headers", hdrBase64},
			{"set", setStr},
			{"albumId", albumID},
			{"dateCreated", item.dateCreated},
			{"dateModified", item.dateModified},
			{"version", "1"},
			{"token", tok},
		}
		var sb strings.Builder
		for _, kv := range fields {
			fmt.Fprintf(&sb, "--%s\r\nContent-Disposition: form-data; name=%q\r\n\r\n%s\r\n", boundary, kv[0], kv[1])
		}
		if _, writeErr = io.WriteString(pw, sb.String()); writeErr != nil {
			return
		}

		writeEncryptedPart := func(partName string, hdr *stingle.Header, hdrBin []byte, src io.ReadCloser) error {
			defer src.Close()
			partHdr := fmt.Sprintf("--%s\r\nContent-Disposition: form-data; name=%q; filename=%q\r\nContent-Type: application/octet-stream\r\n\r\n", boundary, partName, filename)
			if _, err := io.WriteString(pw, partHdr); err != nil {
				return err
			}
			if _, err := pw.Write(hdrBin); err != nil {
				return err
			}

			chunkSize := int(hdr.ChunkSize)
			buf := make([]byte, chunkSize)
			var chunkNum uint64
			for {
				if c.isUploadCanceled() {
					return errors.New(T("canceled"))
				}
				n, rErr := io.ReadFull(src, buf)
				if n > 0 {
					if c.isUploadCanceled() {
						return errors.New(T("canceled"))
					}
					chunkNum++
					item.uploadedBytes.Add(int64(n))
					encChunk, err := encryptUploadChunk(chunkNum, buf[:n], hdr.SymmetricKey)
					if err != nil {
						return err
					}
					if _, err := pw.Write(encChunk); err != nil {
						return err
					}
				}
				if errors.Is(rErr, io.EOF) || errors.Is(rErr, io.ErrUnexpectedEOF) {
					break
				}
				if rErr != nil {
					return rErr
				}
			}
			_, err := io.WriteString(pw, "\r\n")
			return err
		}

		fileStream := jsutil.NewStreamReader(item.fileJS.Call("stream"))
		if writeErr = writeEncryptedPart("file", hdrs[0], binHdrs[0], fileStream); writeErr != nil {
			return
		}

		tnStream := io.NopCloser(bytes.NewReader(item.tn))
		if writeErr = writeEncryptedPart("thumb", hdrs[1], binHdrs[1], tnStream); writeErr != nil {
			return
		}

		_, writeErr = fmt.Fprintf(pw, "--%s--\r\n", boundary)
	}()

	rs := jsutil.NewReadableStream(pr, nil, nil)
	var body js.Value = rs
	if !c.streamingUploadWorks || noStreaming {
		blob, err := jsutil.StreamToBlob(rs)
		if err != nil {
			if c.isUploadCanceled() {
				return errors.New(T("canceled"))
			}
			return err
		}
		body = blob
	}

	if c.isUploadCanceled() {
		return errors.New(T("canceled"))
	}

	mode := "cors"
	if c.sameOrigin {
		mode = "same-origin"
	}
	opts := jsutil.NewObject(map[string]any{
		"method": "POST",
		"mode":   mode,
		"headers": jsutil.NewObject(map[string]any{
			"Content-Type": "multipart/form-data; boundary=" + boundary,
		}),
		"redirect":       "error",
		"referrerPolicy": "no-referrer",
		"credentials":    "omit",
		"body":           body,
		"duplex":         "half",
	})

	t1 := time.Now()
	respVal, err := jsutil.Await(jsutil.Global.Call("fetch", c.vars.Server+"v2/sync/upload", opts))
	if err != nil {
		if c.isUploadCanceled() {
			return errors.New(T("canceled"))
		}
		if time.Since(t1) < 50*time.Millisecond && c.streamingUploadWorks && !noStreaming {
			item.uploadedBytes.Store(0)
			return c.uploadFile(collection, item, true)
		}
		return err
	}
	if !respVal.Get("ok").Bool() {
		respText, err := jsutil.Await(respVal.Call("text"))
		if err == nil && respText.Truthy() {
			return errors.New(respText.String())
		}
		return fmt.Errorf("%d %s", respVal.Get("status").Int(), respVal.Get("statusText").String())
	}
	item.done.Store(true)
	return nil
}

func encryptUploadChunk(n uint64, data, symKey []byte) ([]byte, error) {
	nonce := make([]byte, chacha20poly1305.NonceSizeX)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ck := stingle.DeriveKey(symKey, chacha20poly1305.KeySize, n, "__data__")
	defer wipeBytes(ck)
	ae, err := chacha20poly1305.NewX(ck)
	if err != nil {
		return nil, err
	}
	out := make([]byte, chacha20poly1305.NonceSizeX, chacha20poly1305.NonceSizeX+len(data)+16)
	copy(out, nonce)
	out = ae.Seal(out, nonce, data, nil)
	return out, nil
}

func testUploadStream() (supported bool) {
	jsutil.TryCatch(
		func() {
			rs := jsutil.ReadableStream.New()
			opts := jsutil.NewObject(map[string]any{
				"body":   rs,
				"method": "POST",
				"duplex": "half",
			})
			req := jsutil.Request.New("", opts)
			hasCT := req.Get("headers").Call("has", "Content-Type").Bool()
			supported = !hasCT
		},
		func(any) {
			supported = false
		},
	)
	return supported
}
