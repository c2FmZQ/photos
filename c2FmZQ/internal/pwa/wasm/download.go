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
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall/js"

	"golang.org/x/crypto/chacha20poly1305"

	"c2FmZQ/internal/pwa/wasm/jsutil"
	"c2FmZQ/internal/stingle"
)

const xchacha20Poly1305Overhead = 40 // 24-byte nonce + 16-byte tag

var rangeRegexp = regexp.MustCompile(`^bytes=([0-9]+)-`)

func (c *Client) getDecryptURL(f *FileRecord, isThumb bool) (string, error) {
	if f == nil {
		return "", nil
	}
	collection := f.AlbumID
	if f.Set == 0 {
		collection = "gallery"
	} else if f.Set == 1 {
		collection = "trash"
	}
	fn, err := c.decryptString(f.Headers[0].EncFileName)
	if err != nil {
		return "", err
	}
	u := fmt.Sprintf("%sstream/%s/%s?collection=%s&file=%s",
		c.pathPrefix,
		c.vars.DecryptPath,
		url.PathEscape(fn),
		url.QueryEscape(collection),
		url.QueryEscape(f.File),
	)
	if isThumb {
		u += "&isThumb=1"
	}
	return u, nil
}

func (c *Client) getContentURL(collection, file string, isThumb bool) (string, error) {
	f, ok := c.getFile(collection, file)
	if !ok {
		return "", errors.New("file not found")
	}
	thumbStr := "0"
	if isThumb {
		thumbStr = "1"
	}
	resp, err := c.sendRequest("v2/sync/getUrl", map[string]string{
		"token": c.token(),
		"file":  f.File,
		"set":   strconv.Itoa(f.Set),
		"thumb": thumbStr,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	var parts struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return "", err
	}
	srvURL := jsutil.URL.New(c.vars.Server, jsutil.LocationHref())
	contentURL := jsutil.URL.New(parts.URL, srvURL)
	if contentURL.Get("origin").String() != srvURL.Get("origin").String() {
		return "", errors.New("unexpected content URL origin")
	}
	return contentURL.Call("toString").String(), nil
}

func (c *Client) fetchCachedFile(name, collection string, isThumb bool, cancel <-chan struct{}) error {
	if c.vars.CachePref != "encrypted" || c.cm == nil {
		return errors.New(T("caching-disabled"))
	}
	if cancel != nil {
		select {
		case <-cancel:
			return errors.New(T("canceled"))
		default:
		}
	}
	if err := c.saveBandwidth(); err != nil {
		return err
	}
	prefix := "fs"
	if isThumb {
		prefix = "tn"
	}
	cmName := prefix + "/" + name
	if exists, err := c.cm.Exists(cmName); err == nil && exists {
		return c.cm.Update(cmName, CacheOptions{Stick: true})
	}
	f, ok := c.getFile(collection, name)
	if !ok {
		return nil
	}
	if !c.cm.CanAdd() {
		return errors.New(T("cache-full"))
	}

	hdrIdx := 0
	if isThumb {
		hdrIdx = 1
	}
	hdr := f.Headers[hdrIdx]
	if hdr.ChunkSize <= 0 || hdr.ChunkSize > maxChunkSize || hdr.DataSize < 0 {
		return errors.New("invalid header dimensions")
	}
	startOffset := hdr.HeaderSize
	encChunkSize := int64(hdr.ChunkSize) + xchacha20Poly1305Overhead
	fileSize := hdr.DataSize

	contentURL, err := c.getContentURL(collection, name, isThumb)
	if err != nil {
		return err
	}
	mode := "cors"
	if c.sameOrigin {
		mode = "same-origin"
	}
	opts := jsutil.NewObject(map[string]any{
		"method": "GET",
		"headers": jsutil.NewObject(map[string]any{
			"range": fmt.Sprintf("bytes=%d-", startOffset),
		}),
		"mode":           mode,
		"credentials":    "omit",
		"redirect":       "error",
		"referrerPolicy": "no-referrer",
	})
	if cancel != nil {
		// Abort the fetch when cancel fires, so that a read that is
		// blocked waiting for network data doesn't keep
		// cancelCheckCachedFiles waiting indefinitely.
		ac := jsutil.AbortController.New()
		opts.Set("signal", ac.Get("signal"))
		finished := make(chan struct{})
		defer close(finished)
		go func() {
			select {
			case <-cancel:
				ac.Call("abort")
			case <-finished:
			}
		}()
	}
	respVal, err := jsutil.Await(jsutil.Global.Call("fetch", contentURL, opts))
	if err != nil {
		return err
	}
	if !respVal.Get("ok").Bool() {
		return fmt.Errorf("Status: %d", respVal.Get("status").Int())
	}
	body := respVal.Get("body")
	if !body.Truthy() {
		return errors.New("empty response body")
	}
	sr := jsutil.NewStreamReader(body)
	defer sr.Close()

	cr := &cancelableReader{
		r:      sr,
		cancel: cancel,
	}
	return c.cm.Put(cmName, cr, 200, "OK", nil, CacheOptions{
		Add:       true,
		Stick:     true,
		Size:      fileSize,
		ChunkSize: 25 * encChunkSize,
	})
}

type cancelableReader struct {
	r      io.Reader
	cancel <-chan struct{}
}

func (cr *cancelableReader) Read(p []byte) (int, error) {
	if cr.cancel != nil {
		select {
		case <-cr.cancel:
			return 0, errors.New(T("canceled"))
		default:
		}
	}
	return cr.r.Read(p)
}

func (c *Client) contentType(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".mp4":
		return "video/mp4"
	case ".avi":
		return "video/avi"
	case ".wmv":
		return "video/x-ms-wmv"
	case ".3gp":
		return "video/3gpp"
	case ".m1v", ".m2v", ".mp2", ".mpg", ".mpeg":
		return "video/mpeg"
	case ".qt", ".mov", ".moov":
		return "video/quicktime"
	case ".mjpg":
		return "video/x-motion-jpeg"
	case ".webm":
		return "video/webm"
	case ".aac":
		return "audio/aac"
	case ".mid", ".midi":
		return "audio/midi"
	case ".mp3":
		return "audio/mpeg"
	case ".oga", ".ogg", ".ogv":
		return "audio/ogg"
	case ".opus":
		return "audio/opus"
	case ".wav":
		return "audio/wav"
	case ".weba":
		return "audio/webm"
	case ".pdf":
		return "application/pdf"
	case ".txt", ".text":
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}

func (c *Client) HandleStreamRequest(reqURL, rangeHeader string) (*jsutil.StreamResponse, error) {
	u, err := url.Parse(reqURL)
	if err != nil {
		return &jsutil.StreamResponse{
			Status:     400,
			StatusText: "Bad Request",
			Headers:    map[string]any{"content-type": "text/plain"},
		}, nil
	}
	expectedPrefix := strings.TrimSuffix(c.pathPrefix, "/") + "/stream/" + c.vars.DecryptPath + "/"
	if c.vars.DecryptPath == "" || !strings.HasPrefix(reqURL, expectedPrefix) {
		return &jsutil.StreamResponse{
			Status:     404,
			StatusText: "Not found",
			Headers:    map[string]any{"content-type": "text/plain"},
		}, nil
	}

	ext := strings.ToLower(filepath.Ext(u.Path))
	ctype := c.contentType(ext)
	q := u.Query()
	collection := q.Get("collection")
	file := q.Get("file")
	isThumb := q.Get("isThumb") == "1"

	f, ok := c.getFile(collection, file)
	if !ok {
		return &jsutil.StreamResponse{
			Status:     404,
			StatusText: "Not found",
			Headers:    map[string]any{"content-type": "text/plain"},
		}, nil
	}

	hdrIdx := 0
	if isThumb {
		hdrIdx = 1
	}
	hdr := f.Headers[hdrIdx]
	if hdr.ChunkSize <= 0 || hdr.ChunkSize > maxChunkSize || hdr.DataSize < 0 {
		return &jsutil.StreamResponse{
			Status:     500,
			StatusText: "Internal Server Error",
			Headers:    map[string]any{"content-type": "text/plain"},
		}, nil
	}
	symKey, err := c.decryptBytes(hdr.EncKey)
	if err != nil {
		return nil, err
	}
	wipeSymKey := true
	defer func() {
		if wipeSymKey {
			wipeBytes(symKey)
		}
	}()
	chunkSize := int64(hdr.ChunkSize)
	encChunkSize := chunkSize + xchacha20Poly1305Overhead
	startOffset := int64(hdr.HeaderSize)
	var chunkNum int64
	var chunkOffset int64
	var reqOffset int64
	haveRange := false

	if rangeHeader != "" {
		haveRange = true
		if m := rangeRegexp.FindStringSubmatch(rangeHeader); len(m) > 1 {
			reqOffset, _ = strconv.ParseInt(m[1], 10, 64)
			if reqOffset > 0 {
				chunkNum = reqOffset / chunkSize
				chunkOffset = reqOffset % chunkSize
				startOffset += chunkNum * encChunkSize
			}
		}
	}

	fileSize := hdr.DataSize
	if fileSize <= 0 {
		return &jsutil.StreamResponse{
			Body:       io.NopCloser(bytes.NewReader(nil)),
			Status:     200,
			StatusText: "OK",
			Headers:    map[string]any{"content-type": ctype},
		}, nil
	}
	if reqOffset >= fileSize {
		return &jsutil.StreamResponse{
			Status:     416,
			StatusText: "Range Not Satisfiable",
			Headers:    map[string]any{"content-type": "text/plain"},
		}, nil
	}

	useCache := c.vars.CachePref == "encrypted" && c.cm != nil
	prefix := "fs"
	if isThumb {
		prefix = "tn"
	}
	cmName := prefix + "/" + f.File

	var skipChunks int64
	var cipherReader io.ReadCloser
	var onAbort func()

	if useCache {
		pos := startOffset - int64(hdr.HeaderSize)
		if r, err := c.cm.Match(cmName, CacheOptions{Use: true, Offset: pos}); err == nil && r != nil {
			if r.Offset%encChunkSize == 0 {
				skipChunks = chunkNum - r.Offset/encChunkSize
				cipherReader = r.Body
			} else {
				_ = r.Body.Close()
			}
		}
	}

	if cipherReader == nil {
		addToCache := useCache && reqOffset == 0 && c.cm.CanAdd()
		contentURL, err := c.getContentURL(collection, f.File, isThumb)
		if err != nil {
			return &jsutil.StreamResponse{
				Status:     502,
				StatusText: "network error",
				Headers:    map[string]any{"content-type": "text/plain"},
			}, nil
		}
		mode := "cors"
		if c.sameOrigin {
			mode = "same-origin"
		}
		opts := jsutil.NewObject(map[string]any{
			"method": "GET",
			"headers": jsutil.NewObject(map[string]any{
				"range": fmt.Sprintf("bytes=%d-", startOffset),
			}),
			"mode":           mode,
			"credentials":    "omit",
			"redirect":       "error",
			"referrerPolicy": "no-referrer",
		})
		respVal, err := jsutil.Await(jsutil.Global.Call("fetch", contentURL, opts))
		if err != nil || !respVal.Get("ok").Bool() {
			return &jsutil.StreamResponse{
				Status:     502,
				StatusText: "network error",
				Headers:    map[string]any{"content-type": "text/plain"},
			}, nil
		}
		body := respVal.Get("body")
		if !body.Truthy() {
			return &jsutil.StreamResponse{
				Status:     502,
				StatusText: "network error",
				Headers:    map[string]any{"content-type": "text/plain"},
			}, nil
		}
		if addToCache {
			teed := body.Call("tee")
			rs1 := teed.Index(0)
			rs2 := teed.Index(1)
			abortCh := make(chan struct{})
			onAbort = func() {
				select {
				case <-abortCh:
				default:
					close(abortCh)
				}
			}
			cipherReader = jsutil.NewStreamReader(rs1)
			go func(rs js.Value) {
				sr2 := jsutil.NewStreamReader(rs)
				defer sr2.Close()
				cr := &cancelableReader{r: sr2, cancel: abortCh}
				_ = c.cm.Put(cmName, cr, 200, "OK", nil, CacheOptions{
					Use:       true,
					Size:      fileSize,
					ChunkSize: 25 * encChunkSize,
				})
			}(rs2)
		} else {
			cipherReader = jsutil.NewStreamReader(body)
		}
	}

	wipeSymKey = false
	decReader := &streamDecrypter{
		r:            cipherReader,
		symKey:       symKey,
		chunkSize:    chunkSize,
		encChunkSize: encChunkSize,
		n:            chunkNum,
		offset:       chunkOffset,
		skipChunks:   skipChunks,
		expectedSize: fileSize - reqOffset,
		onAbort:      onAbort,
	}

	respHeaders := map[string]any{
		"accept-ranges":                "bytes",
		"cache-control":                "no-store, immutable",
		"content-type":                 ctype,
		"content-security-policy":      "sandbox;",
		"cross-origin-resource-policy": "same-origin",
		"x-content-type-options":       "nosniff",
	}
	if strings.HasPrefix(ctype, "application/") {
		respHeaders["content-disposition"] = "attachment"
	}
	if c.vars.CachePref == "private" {
		respHeaders["cache-control"] = "private, max-age=3600"
	}
	status := 200
	statusText := "OK"
	if haveRange {
		status = 206
		statusText = "Partial Content"
		respHeaders["content-range"] = fmt.Sprintf("bytes %d-%d/%d", reqOffset, fileSize-1, fileSize)
	} else {
		respHeaders["content-length"] = strconv.FormatInt(fileSize, 10)
	}

	return &jsutil.StreamResponse{
		Body:       decReader,
		Status:     status,
		StatusText: statusText,
		Headers:    respHeaders,
	}, nil
}

type streamDecrypter struct {
	r              io.ReadCloser
	symKey         []byte
	chunkSize      int64
	encChunkSize   int64
	n              int64
	offset         int64
	skipChunks     int64
	expectedSize   int64
	decryptedBytes int64
	onAbort        func()
	buf            []byte
	eof            bool
	closed         bool
}

func (d *streamDecrypter) Read(p []byte) (int, error) {
	if d.closed {
		return 0, io.ErrClosedPipe
	}
	for len(d.buf) == 0 {
		if d.eof {
			if d.decryptedBytes < d.expectedSize {
				return 0, errors.New(T("decryption-error"))
			}
			return 0, io.EOF
		}
		if err := d.nextChunk(); err != nil {
			return 0, err
		}
	}
	n := copy(p, d.buf)
	d.buf = d.buf[n:]
	return n, nil
}

func (d *streamDecrypter) nextChunk() error {
	for d.skipChunks > 0 {
		if _, err := io.CopyN(io.Discard, d.r, d.encChunkSize); err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
				d.eof = true
				return nil
			}
			return err
		}
		d.skipChunks--
	}

	in := make([]byte, d.encChunkSize)
	n, err := io.ReadFull(d.r, in)
	if errors.Is(err, io.EOF) {
		d.eof = true
		return nil
	}
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return err
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		d.eof = true
	}
	if n < xchacha20Poly1305Overhead {
		return errors.New(T("decryption-error"))
	}

	d.n++
	nonce := in[:chacha20poly1305.NonceSizeX]
	enc := in[chacha20poly1305.NonceSizeX:n]
	ck := stingle.DeriveKey(d.symKey, chacha20poly1305.KeySize, uint64(d.n), "__data__")
	defer wipeBytes(ck)
	ae, err := chacha20poly1305.NewX(ck)
	if err != nil {
		return errors.New(T("decryption-error"))
	}
	dec, err := ae.Open(nil, nonce, enc, nil)
	if err != nil {
		return errors.New(T("decryption-error"))
	}
	if d.offset > 0 {
		if d.offset < int64(len(dec)) {
			dec = dec[d.offset:]
		} else {
			dec = nil
		}
		d.offset = 0
	}
	d.decryptedBytes += int64(len(dec))
	d.buf = append(d.buf, dec...)
	return nil
}

func (d *streamDecrypter) Close() error {
	if d.closed {
		return nil
	}
	d.closed = true
	wipeBytes(d.symKey)
	if d.onAbort != nil && d.decryptedBytes < d.expectedSize {
		d.onAbort()
	}
	return d.r.Close()
}
