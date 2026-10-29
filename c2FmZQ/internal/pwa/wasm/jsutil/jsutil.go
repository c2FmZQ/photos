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
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"syscall/js"
	"time"
)

var (
	Global          = js.Global()
	ArrayBuffer     = Global.Get("ArrayBuffer")
	Uint8Array      = Global.Get("Uint8Array")
	Error           = Global.Get("Error")
	Array           = Global.Get("Array")
	Object          = Global.Get("Object")
	Promise         = Global.Get("Promise")
	Blob            = Global.Get("Blob")
	URL             = Global.Get("URL")
	JSON            = Global.Get("JSON")
	Response        = Global.Get("Response")
	Request         = Global.Get("Request")
	Headers         = Global.Get("Headers")
	AbortController = Global.Get("AbortController")
	Document        = Global.Get("document")
	Navigator       = Global.Get("navigator")
	Console         = Global.Get("console")
)

func Log(args ...any) {
	jsArgs := make([]any, len(args))
	for i, a := range args {
		jsArgs[i] = fmt.Sprint(a)
	}
	Console.Call("log", jsArgs...)
}

func LogError(args ...any) {
	jsArgs := make([]any, len(args))
	for i, a := range args {
		jsArgs[i] = fmt.Sprint(a)
	}
	Console.Call("error", jsArgs...)
}

func TryCatch(try func(), catch func(any)) {
	defer func() {
		if e := recover(); e != nil {
			catch(e)
		}
	}()
	try()
}

func NewObject(m map[string]any) js.Value {
	obj := Object.New()
	for k, v := range m {
		obj.Set(k, ToJSValue(v))
	}
	return obj
}

func NewArray(a []any) js.Value {
	arr := Array.New()
	for _, v := range a {
		arr.Call("push", ToJSValue(v))
	}
	return arr
}

func ToJSValue(v any) js.Value {
	if v == nil {
		return js.Undefined()
	}
	switch x := v.(type) {
	case js.Value:
		return x
	case js.Func:
		return x.Value
	case bool, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, string:
		return js.ValueOf(x)
	case []byte:
		return Uint8ArrayFromBytes(x)
	case map[string]any:
		return NewObject(x)
	case map[string]string:
		obj := Object.New()
		for k, val := range x {
			obj.Set(k, val)
		}
		return obj
	case []any:
		return NewArray(x)
	case []string:
		arr := Array.New()
		for _, s := range x {
			arr.Call("push", s)
		}
		return arr
	case error:
		return js.ValueOf(x.Error())
	default:
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Pointer && rv.IsNil() {
			return js.Null()
		}
		b, err := json.Marshal(v)
		if err != nil {
			return js.ValueOf(fmt.Sprint(v))
		}
		return JSON.Call("parse", string(b))
	}
}

func FromJSValue(v js.Value, target any) error {
	if v.IsUndefined() || v.IsNull() {
		return nil
	}
	s := JSON.Call("stringify", v)
	if s.IsUndefined() {
		return nil
	}
	return json.Unmarshal([]byte(s.String()), target)
}

func NewResolvedPromise(v any) js.Value {
	return Promise.Call("resolve", ToJSValue(v))
}

func NewRejectedPromise(err error) js.Value {
	return Promise.Call("reject", js.ValueOf(err.Error()))
}

func NewPromise(f func() (any, error)) js.Value {
	var cb js.Func
	cb = js.FuncOf(
		func(this js.Value, args []js.Value) any {
			defer cb.Release()
			resolve := args[0]
			reject := args[1]
			go func() {
				var v any
				var err error
				TryCatch(
					func() {
						v, err = f()
					},
					func(p any) {
						err = fmt.Errorf("panic: %v", p)
					},
				)
				if err != nil {
					reject.Invoke(js.ValueOf(err.Error()))
					return
				}
				resolve.Invoke(ToJSValue(v))
			}()
			return nil
		},
	)
	return Promise.New(cb)
}

func Await(p js.Value) (js.Value, error) {
	if !p.Truthy() {
		return p, nil
	}
	if then := p.Get("then"); then.IsUndefined() || then.Type() != js.TypeFunction {
		return p, nil
	}
	v := make(chan js.Value, 1)
	e := make(chan error, 1)
	resolveFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		var val js.Value
		if len(args) > 0 {
			val = args[0]
		}
		v <- val
		return nil
	})
	defer resolveFn.Release()
	rejectFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 || args[0].IsUndefined() || args[0].IsNull() {
			e <- errors.New("promise rejected")
			return nil
		}
		arg := args[0]
		if arg.Type() == js.TypeString {
			e <- errors.New(arg.String())
			return nil
		}
		if msg := arg.Get("message"); msg.Truthy() && msg.Type() == js.TypeString {
			e <- errors.New(msg.String())
			return nil
		}
		if toStr := arg.Get("toString"); toStr.Truthy() && toStr.Type() == js.TypeFunction {
			e <- errors.New(arg.Call("toString").String())
			return nil
		}
		e <- fmt.Errorf("%v", arg)
		return nil
	})
	defer rejectFn.Release()
	p.Call("then", resolveFn).Call("catch", rejectFn)
	select {
	case value := <-v:
		return value, nil
	case err := <-e:
		return js.Value{}, err
	}
}

func Uint8ArrayFromBytes(in []byte) js.Value {
	out := Uint8Array.New(js.ValueOf(len(in)))
	js.CopyBytesToJS(out, in)
	return out
}

func Uint8ArrayToBytes(v js.Value) []byte {
	if !v.Truthy() {
		return nil
	}
	if v.Get("byteLength").IsUndefined() {
		return nil
	}
	if !v.InstanceOf(Uint8Array) {
		v = Uint8Array.New(v)
	}
	buf := make([]byte, v.Get("byteLength").Int())
	js.CopyBytesToGo(buf, v)
	return buf
}

func BlobToBytes(blob js.Value) ([]byte, error) {
	ab, err := Await(blob.Call("arrayBuffer"))
	if err != nil {
		return nil, err
	}
	return Uint8ArrayToBytes(Uint8Array.New(ab)), nil
}

func Hostname() string {
	if !Document.Truthy() {
		return ""
	}
	return Document.Get("location").Get("hostname").String()
}

func LocationHref() string {
	if Document.Truthy() {
		return Document.Get("location").Get("href").String()
	}
	return Global.Get("location").Get("href").String()
}

func PathPrefix() string {
	href := LocationHref()
	for i := len(href) - 1; i >= 0; i-- {
		if href[i] == '#' || href[i] == '?' {
			href = href[:i]
		}
	}
	for i := len(href) - 1; i >= 0; i-- {
		if href[i] == '/' {
			return href[:i+1]
		}
	}
	return href
}

func Sleep(d time.Duration) {
	time.Sleep(d)
}
