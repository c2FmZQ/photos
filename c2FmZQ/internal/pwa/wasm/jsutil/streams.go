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

package jsutil

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"sync"
	"sync/atomic"
	"syscall/js"
	"time"
)

var (
	ReadableStream = Global.Get("ReadableStream")
)

func NewStreamReader(stream js.Value) *StreamReader {
	return &StreamReader{
		reader: stream.Call("getReader"),
	}
}

var _ io.ReadCloser = (*StreamReader)(nil)

type StreamReader struct {
	reader js.Value // ReadableStreamDefaultReader
	buf    []byte
	closed bool
}

func (r *StreamReader) Read(b []byte) (int, error) {
	if r.closed {
		return 0, io.ErrClosedPipe
	}
	if len(r.buf) == 0 {
		chunk, err := Await(r.reader.Call("read"))
		if err != nil {
			return 0, err
		}
		if chunk.Get("done").Bool() {
			return 0, io.EOF
		}
		r.buf = Uint8ArrayToBytes(chunk.Get("value"))
	}
	n := copy(b, r.buf)
	r.buf = r.buf[n:]
	return n, nil
}

func (r *StreamReader) Close() error {
	if r.closed {
		return nil
	}
	r.closed = true
	_, _ = Await(r.reader.Call("cancel"))
	return nil
}

func NewReadableStream(r io.Reader, done chan<- error, progress func(int64)) js.Value {
	cancelCh := make(chan struct{})
	var pullCb, cancelCb js.Func
	releaseFuncs := sync.OnceFunc(func() {
		pullCb.Release()
		cancelCb.Release()
		if c, ok := r.(io.Closer); ok {
			_ = c.Close()
		}
	})
	allDone := func(err error) {
		releaseFuncs()
		if done != nil {
			select {
			case done <- err:
			default:
			}
		}
	}
	offset := new(atomic.Int64)
	s := Object.New()
	pullCb = js.FuncOf(func(this js.Value, args []js.Value) any {
		return NewPromise(func() (any, error) {
			controller := args[0]
			size := 65536
			if ds := controller.Get("desiredSize"); !ds.IsUndefined() && !ds.IsNull() {
				if d := ds.Int(); d > size {
					size = d
				}
			}
			buf := make([]byte, size)
			n, err := r.Read(buf)
			if n > 0 {
				select {
				case <-cancelCh:
					return nil, nil
				default:
					controller.Call("enqueue", Uint8ArrayFromBytes(buf[:n]))
					offset.Add(int64(n))
					if progress != nil {
						progress(offset.Load())
					}
				}
			}
			if errors.Is(err, io.EOF) {
				controller.Call("close")
				allDone(nil)
			} else if err != nil {
				controller.Call("error", Error.New(err.Error()))
				allDone(err)
			}
			return nil, nil
		})
	})
	cancelCb = js.FuncOf(func(this js.Value, args []js.Value) any {
		select {
		case <-cancelCh:
		default:
			close(cancelCh)
		}
		allDone(errors.New("canceled"))
		return nil
	})
	s.Set("pull", pullCb)
	s.Set("cancel", cancelCb)
	return ReadableStream.New(s)
}

func StreamToBlob(rs js.Value) (js.Value, error) {
	resp := Response.New(rs)
	return Await(resp.Call("blob"))
}

type StreamResponse struct {
	Body       io.ReadCloser
	Status     int
	StatusText string
	Headers    map[string]any
	Progress   func(int64)
}

type StreamHandler func(reqURL, rangeHeader string) (*StreamResponse, error)

var (
	streamHelperMu      sync.Mutex
	defaultStreamHelper *StreamHelper
)

type StreamHelper struct {
	mu      sync.Mutex
	streams map[string]stream
	handler StreamHandler
}

type stream struct {
	reader   io.Reader
	headers  map[string]any
	done     chan error
	started  chan struct{}
	progress func(int64)
}

func InitStreamHelper(handler StreamHandler) *StreamHelper {
	streamHelperMu.Lock()
	defer streamHelperMu.Unlock()

	if defaultStreamHelper != nil {
		defaultStreamHelper.mu.Lock()
		defaultStreamHelper.handler = handler
		defaultStreamHelper.mu.Unlock()
		return defaultStreamHelper
	}

	container := Navigator.Get("serviceWorker")
	if !container.Truthy() {
		return nil
	}

	h := &StreamHelper{
		streams: make(map[string]stream),
		handler: handler,
	}

	msgFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 {
			return nil
		}
		event := args[0]
		data := event.Get("data")
		if !data.Truthy() {
			return nil
		}
		sid := data.Get("streamId")
		if !sid.Truthy() {
			return nil
		}
		id := sid.String()
		target := event.Get("source")
		if !target.Truthy() {
			target = container.Get("controller")
		}
		if !target.Truthy() {
			return nil
		}

		h.mu.Lock()
		s, exists := h.streams[id]
		if exists {
			delete(h.streams, id)
		}
		reqHandler := h.handler
		h.mu.Unlock()

		if exists {
			close(s.started)
			TryCatch(
				func() {
					rs := NewReadableStream(s.reader, s.done, s.progress)
					target.Call("postMessage",
						NewObject(map[string]any{
							"streamId": id,
							"body":     rs,
							"options": NewObject(map[string]any{
								"status":     200,
								"statusText": "OK",
								"headers":    NewObject(s.headers),
							}),
						}),
						Array.New(rs),
					)
				},
				func(e any) {
					err, ok := e.(error)
					if !ok {
						err = fmt.Errorf("panic: %T %v", e, e)
					}
					s.done <- err
					LogError("stream helper failed:", err.Error())
					target.Call("postMessage",
						NewObject(map[string]any{
							"streamId": id,
							"body":     "Internal Server Error",
							"options": NewObject(map[string]any{
								"status":     500,
								"statusText": "Internal Server Error",
								"headers": NewObject(map[string]any{
									"Content-Type": "text/plain",
								}),
							}),
						}),
					)
				},
			)
			return nil
		}

		if reqHandler == nil {
			target.Call("postMessage",
				NewObject(map[string]any{
					"streamId": id,
				}),
			)
			return nil
		}

		var reqURL, rangeHdr string
		if u := data.Get("url"); u.Truthy() {
			reqURL = u.String()
		}
		if r := data.Get("range"); r.Truthy() {
			rangeHdr = r.String()
		}

		go func() {
			TryCatch(
				func() {
					resp, err := reqHandler(reqURL, rangeHdr)
					if err != nil {
						LogError("stream handler error:", reqURL, err)
						target.Call("postMessage",
							NewObject(map[string]any{
								"streamId": id,
								"body":     err.Error(),
								"options": NewObject(map[string]any{
									"status":     500,
									"statusText": "Internal Server Error",
									"headers": NewObject(map[string]any{
										"Content-Type": "text/plain",
									}),
								}),
							}),
						)
						return
					}
					if resp.Body == nil {
						target.Call("postMessage",
							NewObject(map[string]any{
								"streamId": id,
								"body":     "",
								"options": NewObject(map[string]any{
									"status":     resp.Status,
									"statusText": resp.StatusText,
									"headers":    NewObject(resp.Headers),
								}),
							}),
						)
						return
					}
					rs := NewReadableStream(resp.Body, nil, resp.Progress)
					target.Call("postMessage",
						NewObject(map[string]any{
							"streamId": id,
							"body":     rs,
							"options": NewObject(map[string]any{
								"status":     resp.Status,
								"statusText": resp.StatusText,
								"headers":    NewObject(resp.Headers),
							}),
						}),
						Array.New(rs),
					)
				},
				func(e any) {
					err := fmt.Errorf("panic: %T %v", e, e)
					LogError("stream handler panic:", err.Error())
					target.Call("postMessage",
						NewObject(map[string]any{
							"streamId": id,
							"body":     "Internal Server Error",
							"options": NewObject(map[string]any{
								"status":     500,
								"statusText": "Internal Server Error",
								"headers": NewObject(map[string]any{
									"Content-Type": "text/plain",
								}),
							}),
						}),
					)
				},
			)
		}()
		return nil
	})

	container.Call("addEventListener", "message", msgFn)
	if startMessages := container.Get("startMessages"); startMessages.Truthy() {
		container.Call("startMessages")
	}

	defaultStreamHelper = h
	return h
}

func (h *StreamHelper) addStream(rc io.Reader, headers map[string]any, progress func(int64)) (string, <-chan struct{}, <-chan error, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	b := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", nil, nil, err
	}
	id := hex.EncodeToString(b)
	s := stream{
		reader:   rc,
		headers:  headers,
		done:     make(chan error, 1),
		started:  make(chan struct{}),
		progress: progress,
	}
	h.streams[id] = s
	return id, s.started, s.done, nil
}

func (h *StreamHelper) removeStream(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, exists := h.streams[id]
	delete(h.streams, id)
	return exists
}

func (h *StreamHelper) Download(rc io.ReadCloser, filename string, size int64, progress func(int64), hook func(string) error) (err error) {
	defer rc.Close()
	if h == nil {
		return errors.New("streaming download unavailable")
	}
	hdr := map[string]any{
		"Content-Disposition":          mime.FormatMediaType("attachment", map[string]string{"filename": filename}),
		"Cache-Control":                "no-store",
		"Content-Type":                 "application/octet-stream",
		"Content-Security-Policy":      "sandbox;",
		"Cross-Origin-Resource-Policy": "same-origin",
		"X-Content-Type-Options":       "nosniff",
	}
	if size > 0 {
		hdr["Content-Length"] = fmt.Sprintf("%d", size)
	}
	id, started, done, err := h.addStream(rc, hdr, progress)
	if err != nil {
		return err
	}
	url := "./stream/" + id
	if hook != nil {
		if err := hook(url); err != nil {
			h.removeStream(id)
			return err
		}
	} else {
		body := Document.Get("body")
		anchor := Document.Call("createElement", "a")
		anchor.Set("href", url)
		body.Call("appendChild", anchor)
		anchor.Call("click")
		body.Call("removeChild", anchor)
	}
	timer := time.NewTimer(10 * time.Second)
	defer timer.Stop()
	select {
	case <-started:
	case <-timer.C:
		if h.removeStream(id) {
			return errors.New("download did not start")
		}
	}
	return <-done
}
