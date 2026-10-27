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
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"c2FmZQ/internal/pwa/wasm/jsutil"
	"c2FmZQ/internal/stingle"
)

func toInt64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case json.Number:
		n, _ := x.Int64()
		return n
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	default:
		return 0
	}
}

func anyToString(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return fmt.Sprintf("%.0f", x)
	default:
		return fmt.Sprint(x)
	}
}

type updateAlbum struct {
	AlbumID       string `json:"albumId"`
	PublicKey     string `json:"publicKey"`
	EncPrivateKey string `json:"encPrivateKey"`
	Metadata      string `json:"metadata"`
	Cover         string `json:"cover"`
	Members       string `json:"members"`
	IsOwner       any    `json:"isOwner"`
	IsShared      any    `json:"isShared"`
	Permissions   string `json:"permissions"`
	DateModified  any    `json:"dateModified"`
	DateCreated   any    `json:"dateCreated"`
}

type updateFile struct {
	File         string `json:"file"`
	AlbumID      string `json:"albumId,omitempty"`
	Headers      string `json:"headers"`
	DateCreated  any    `json:"dateCreated"`
	DateModified any    `json:"dateModified"`
}

type updateDelete struct {
	Type    int    `json:"type"`
	File    any    `json:"file"`
	AlbumID string `json:"albumId"`
	Date    int64  `json:"date"`
}

func (c *Client) GetUpdates() error {
	c.mu.Lock()
	if c.gettingUpdates {
		c.mu.Unlock()
		return nil
	}
	c.gettingUpdates = true
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.gettingUpdates = false
		c.mu.Unlock()
	}()

	data := map[string]string{
		"token":        c.token(),
		"filesST":      strconv.FormatInt(c.vars.GalleryTimeStamp, 10),
		"trashST":      strconv.FormatInt(c.vars.TrashTimeStamp, 10),
		"albumsST":     strconv.FormatInt(c.vars.AlbumsTimeStamp, 10),
		"albumFilesST": strconv.FormatInt(c.vars.AlbumFilesTimeStamp, 10),
		"cntST":        strconv.FormatInt(c.vars.ContactsTimeStamp, 10),
		"delST":        strconv.FormatInt(c.vars.DeletesTimeStamp, 10),
	}
	resp, err := c.sendRequest("v2/sync/getUpdates", data)
	if err != nil {
		return err
	}
	if resp.Status != "ok" {
		return errors.New(resp.Status)
	}

	var parts struct {
		SpaceUsed  any             `json:"spaceUsed"`
		SpaceQuota any             `json:"spaceQuota"`
		Contacts   []ContactRecord `json:"contacts"`
		Albums     []updateAlbum   `json:"albums"`
		Files      []updateFile    `json:"files"`
		Trash      []updateFile    `json:"trash"`
		AlbumFiles []updateFile    `json:"albumFiles"`
		Deletes    []updateDelete  `json:"deletes"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return err
	}

	c.vars.SpaceUsed = toInt64(parts.SpaceUsed)
	c.vars.SpaceQuota = toInt64(parts.SpaceQuota)

	for _, cnt := range parts.Contacts {
		id := anyToString(cnt.UserID)
		cnt.UserID = id
		c.contacts[id] = cnt
		if cnt.DateModified > c.vars.ContactsTimeStamp {
			c.vars.ContactsTimeStamp = cnt.DateModified
		}
	}

	userSK, err := c.secretKey()
	if err != nil {
		return err
	}
	defer userSK.Wipe()

	for _, a := range parts.Albums {
		if err := c.processAlbumUpdate(a, userSK); err != nil {
			jsutil.LogError("getUpdates album error:", a.AlbumID, err)
		}
	}

	changed := make(map[string]bool)

	for _, f := range parts.Files {
		changed["gallery"] = true
		obj, err := c.convertFileUpdate(f, 0, userSK)
		if err != nil {
			jsutil.LogError("getUpdates file error:", f.File, err)
			continue
		}
		_ = c.insertFile("gallery", f.File, obj)
		if dm := toInt64(f.DateModified); dm > c.vars.GalleryTimeStamp {
			c.vars.GalleryTimeStamp = dm
		}
	}

	for _, f := range parts.Trash {
		changed["trash"] = true
		obj, err := c.convertFileUpdate(f, 1, userSK)
		if err != nil {
			jsutil.LogError("getUpdates trash error:", f.File, err)
			continue
		}
		_ = c.insertFile("trash", f.File, obj)
		if dm := toInt64(f.DateModified); dm > c.vars.TrashTimeStamp {
			c.vars.TrashTimeStamp = dm
		}
	}

	for _, f := range parts.AlbumFiles {
		changed[f.AlbumID] = true
		obj, err := c.convertFileUpdate(f, 2, userSK)
		if err != nil {
			jsutil.LogError("getUpdates albumFile error:", f.File, err)
			continue
		}
		obj.AlbumID = f.AlbumID
		_ = c.insertFile(f.AlbumID, f.File, obj)
		if dm := toInt64(f.DateModified); dm > c.vars.AlbumFilesTimeStamp {
			c.vars.AlbumFilesTimeStamp = dm
		}
	}

	for _, d := range parts.Deletes {
		fileStr := ""
		if d.File != nil {
			switch x := d.File.(type) {
			case string:
				fileStr = x
			case float64:
				fileStr = fmt.Sprintf("%.0f", x)
			default:
				fileStr = fmt.Sprint(x)
			}
		}
		switch d.Type {
		case 1: // Gallery file removed
			if f, ok := c.getFile("gallery", fileStr); ok && toInt64(f.DateModified) < d.Date {
				_ = c.deleteFile("gallery", fileStr)
				changed["gallery"] = true
			}
		case 2, 3: // Trash file removed/deleted
			if f, ok := c.getFile("trash", fileStr); ok && toInt64(f.DateModified) < d.Date {
				_ = c.deleteFile("trash", fileStr)
				changed["trash"] = true
			}
		case 4: // Album deleted
			if alb, ok := c.albums[d.AlbumID]; ok && toInt64(alb.DateModified) < d.Date {
				delete(c.albums, d.AlbumID)
				changed[d.AlbumID] = true
			}
		case 5: // Album file removed
			if f, ok := c.getFile(d.AlbumID, fileStr); ok && toInt64(f.DateModified) < d.Date {
				_ = c.deleteFile(d.AlbumID, fileStr)
				changed[d.AlbumID] = true
			}
		case 6: // Contact removed
			if cnt, ok := c.contacts[fileStr]; ok && cnt.DateModified < d.Date {
				delete(c.contacts, fileStr)
			}
		}
		if d.Date > c.vars.DeletesTimeStamp {
			c.vars.DeletesTimeStamp = d.Date
		}
	}

	_ = c.saveVars()
	_ = c.store.Set("albums", c.albums)
	_ = c.store.Set("contacts", c.contacts)
	for col := range changed {
		_ = c.indexCollection(col)
	}
	go func() {
		_, _ = c.checkCachedFiles()
	}()
	return nil
}

func (c *Client) processAlbumUpdate(a updateAlbum, userSK *stingle.SecretKey) error {
	apkBytes, err := base64DecimalOrBase64Decode(a.PublicKey)
	if err != nil || len(apkBytes) != 32 {
		return errors.New("invalid album public key")
	}
	apk := stingle.PublicKeyFromBytes(apkBytes)

	encSKBytes, err := base64DecimalOrBase64Decode(a.EncPrivateKey)
	if err != nil {
		return err
	}
	askBytes, err := userSK.SealBoxOpen(encSKBytes)
	if err != nil {
		return err
	}
	defer wipeBytes(askBytes)
	ask := stingle.SecretKeyFromBytes(askBytes)
	defer ask.Wipe()

	if !bytes.Equal(ask.PublicKey().ToBytes(), apk.ToBytes()) {
		return errors.New("album public/private key mismatch")
	}

	md, err := stingle.DecryptAlbumMetadata(a.Metadata, ask)
	if err != nil {
		return err
	}
	encName, err := c.encryptString(md.Name)
	if err != nil {
		return err
	}

	var members []string
	if a.Members != "" {
		for _, m := range strings.Split(a.Members, ",") {
			if m != "" {
				members = append(members, m)
			}
		}
	}
	isOffline := false
	if existing, ok := c.albums[a.AlbumID]; ok {
		isOffline = existing.IsOffline
	}
	rec := &AlbumRecord{
		AlbumID:      a.AlbumID,
		PK:           base64.StdEncoding.EncodeToString(apk.ToBytes()),
		EncSK:        a.EncPrivateKey,
		EncName:      encName,
		Cover:        a.Cover,
		Members:      members,
		IsOwner:      toInt64(a.IsOwner) == 1,
		IsShared:     toInt64(a.IsShared) == 1,
		IsOffline:    isOffline,
		Permissions:  a.Permissions,
		DateModified: a.DateModified,
		DateCreated:  a.DateCreated,
	}
	if dm := toInt64(a.DateModified); dm > c.vars.AlbumsTimeStamp {
		c.vars.AlbumsTimeStamp = dm
	}
	c.albums[a.AlbumID] = rec
	return nil
}

func (c *Client) decryptAlbumSK(albumID string, userSK *stingle.SecretKey) (*stingle.SecretKey, error) {
	alb, ok := c.albums[albumID]
	if !ok {
		return nil, errors.New("invalid albumId")
	}
	if userSK == nil {
		var err error
		userSK, err = c.secretKey()
		if err != nil {
			return nil, err
		}
		defer userSK.Wipe()
	}
	encSK, err := base64DecimalOrBase64Decode(alb.EncSK)
	if err != nil {
		return nil, err
	}
	askBytes, err := userSK.SealBoxOpen(encSK)
	if err != nil {
		return nil, err
	}
	defer wipeBytes(askBytes)
	return stingle.SecretKeyFromBytes(askBytes), nil
}

const maxChunkSize = 64 << 20

func (c *Client) convertFileUpdate(up updateFile, set int, userSK *stingle.SecretKey) (*FileRecord, error) {
	parts := strings.Split(up.Headers, "*")
	if len(parts) != 2 {
		return nil, errors.New("invalid headers")
	}
	var sk *stingle.SecretKey
	if up.AlbumID == "" {
		sk = userSK
	} else {
		var err error
		sk, err = c.decryptAlbumSK(up.AlbumID, userSK)
		if err != nil {
			return nil, err
		}
		defer sk.Wipe()
	}

	var hdrRecords [2]FileHeaderRecord
	for i := 0; i < 2; i++ {
		rawBytes, err := base64DecimalOrBase64Decode(parts[i])
		if err != nil {
			return nil, err
		}
		hdr, err := stingle.DecryptHeader(bytes.NewReader(rawBytes), sk)
		if err != nil {
			return nil, err
		}
		if hdr.ChunkSize <= 0 || hdr.ChunkSize > maxChunkSize || hdr.DataSize < 0 {
			hdr.Wipe()
			return nil, errors.New("invalid header dimensions")
		}
		encKey, err := c.encryptBytes(hdr.SymmetricKey)
		if err != nil {
			hdr.Wipe()
			return nil, err
		}
		fn := strings.TrimLeft(string(hdr.Filename), " ")
		encFN, err := c.encryptString(fn)
		if err != nil {
			hdr.Wipe()
			return nil, err
		}
		hdrRecords[i] = FileHeaderRecord{
			ChunkSize:   hdr.ChunkSize,
			DataSize:    hdr.DataSize,
			EncKey:      encKey,
			FileType:    hdr.FileType,
			EncFileName: encFN,
			Duration:    hdr.VideoDuration,
			HeaderSize:  len(rawBytes),
		}
		hdr.Wipe()
	}

	return &FileRecord{
		File:         up.File,
		Set:          set,
		AlbumID:      up.AlbumID,
		Headers:      hdrRecords,
		OrigHeaders:  up.Headers,
		DateCreated:  up.DateCreated,
		DateModified: up.DateModified,
	}, nil
}

func (c *Client) insertFile(collection, file string, obj *FileRecord) error {
	return c.store.Set(fmt.Sprintf("files/%s/%s", collection, file), obj)
}

func (c *Client) deleteFile(collection, file string) error {
	return c.store.Del(fmt.Sprintf("files/%s/%s", collection, file))
}

func (c *Client) getFile(collection, file string) (*FileRecord, bool) {
	var f FileRecord
	found, err := c.store.Get(fmt.Sprintf("files/%s/%s", collection, file), &f)
	if err != nil || !found {
		return nil, false
	}
	return &f, true
}

func (c *Client) indexCollection(collection string) error {
	_ = c.store.DelPrefix(fmt.Sprintf("index/%s/", collection))

	prefix := fmt.Sprintf("files/%s/", collection)
	keys, err := c.store.Keys(prefix)
	if err != nil {
		return err
	}
	out := make([]IndexedFile, 0, len(keys))
	for _, k := range keys {
		file := strings.TrimPrefix(k, prefix)
		f, ok := c.getFile(collection, file)
		if !ok {
			continue
		}
		fn, err := c.decryptString(f.Headers[0].EncFileName)
		if err != nil {
			continue
		}
		ext := strings.ToLower(filepath.Ext(fn))
		u, _ := c.getDecryptURL(f, false)
		tu, _ := c.getDecryptURL(f, true)
		idxFile := IndexedFile{
			Collection:   collection,
			File:         f.File,
			IsImage:      f.Headers[0].FileType == stingle.FileTypePhoto,
			IsVideo:      f.Headers[0].FileType == stingle.FileTypeVideo,
			FileName:     fn,
			DateCreated:  f.DateCreated,
			DateModified: f.DateModified,
			Size:         f.Headers[0].DataSize,
			ContentType:  c.contentType(ext),
			URL:          u,
			ThumbURL:     tu,
		}
		if idxFile.IsVideo {
			idxFile.Duration = f.Headers[0].Duration
		}
		out = append(out, idxFile)
	}
	sort.Slice(out, func(i, j int) bool {
		return toInt64(out[i].DateCreated) > toInt64(out[j].DateCreated)
	})
	for i := 0; i < len(out); i += 100 {
		end := i + 100
		if end > len(out) {
			end = len(out)
		}
		page := IndexPage{
			Start: i,
			Total: len(out),
			Files: out[i:end],
		}
		_ = c.store.Set(fmt.Sprintf("index/%s/%06d", collection, i), page)
	}
	return nil
}

func (c *Client) EmptyTrash() (string, error) {
	params, err := c.makeParams(map[string]string{
		"time": strconv.FormatInt(time.Now().UnixMilli(), 10),
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/emptyTrash", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) DeleteFiles(files []string) (string, error) {
	paramsMap := map[string]string{
		"count": strconv.Itoa(len(files)),
	}
	for i, f := range files {
		paramsMap[fmt.Sprintf("filename%d", i)] = f
	}
	params, err := c.makeParams(paramsMap)
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/delete", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) ChangeCover(albumID, cover string) (string, error) {
	params, err := c.makeParams(map[string]string{
		"albumId": albumID,
		"cover":   cover,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/changeAlbumCover", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) reEncryptHeader(encHeader string, fromSK *stingle.SecretKey, toPK stingle.PublicKey) (string, error) {
	raw, err := base64DecimalOrBase64Decode(encHeader)
	if err != nil {
		return "", err
	}
	if len(raw) < 39 || raw[0] != 'S' || raw[1] != 'P' || raw[2] != 1 {
		return "", errors.New("invalid header")
	}
	size := int(raw[35])<<24 | int(raw[36])<<16 | int(raw[37])<<8 | int(raw[38])
	if 39+size > len(raw) {
		return "", errors.New("invalid header size")
	}
	hdrPlain, err := fromSK.SealBoxOpen(raw[39 : 39+size])
	if err != nil {
		return "", err
	}
	defer wipeBytes(hdrPlain)
	newEncHdr := toPK.SealBox(hdrPlain)
	if len(newEncHdr) != size {
		return "", errors.New("re-encrypted header has unexpected size")
	}
	out := make([]byte, len(raw))
	copy(out, raw[:39])
	copy(out[39:], newEncHdr)
	return base64.RawURLEncoding.EncodeToString(out), nil
}

func (c *Client) MoveFiles(from, to string, files []string, isMove bool) (string, error) {
	fromAlbumID := ""
	if from != "gallery" && from != "trash" {
		fromAlbumID = from
	}
	toAlbumID := ""
	if to != "gallery" && to != "trash" {
		toAlbumID = to
	}

	var headers []string
	if fromAlbumID != "" || toAlbumID != "" {
		userSK, err := c.secretKey()
		if err != nil {
			return "", err
		}
		defer userSK.Wipe()

		var fromSK *stingle.SecretKey
		if fromAlbumID == "" {
			fromSK = userSK
		} else {
			fromSK, err = c.decryptAlbumSK(fromAlbumID, userSK)
			if err != nil {
				return "", err
			}
			defer fromSK.Wipe()
		}

		var toPK stingle.PublicKey
		if toAlbumID == "" {
			toPK, err = c.publicKey()
			if err != nil {
				return "", err
			}
		} else {
			alb, ok := c.albums[toAlbumID]
			if !ok {
				return "", errors.New("invalid destination album")
			}
			pkBytes, err := base64DecimalOrBase64Decode(alb.PK)
			if err != nil {
				return "", err
			}
			toPK = stingle.PublicKeyFromBytes(pkBytes)
		}

		headers = make([]string, len(files))
		for i, fn := range files {
			f, ok := c.getFile(from, fn)
			if !ok {
				return "", fmt.Errorf("file not found: %s", fn)
			}
			hdrParts := strings.Split(f.OrigHeaders, "*")
			if len(hdrParts) != 2 {
				return "", errors.New("invalid origHeaders")
			}
			h0, err := c.reEncryptHeader(hdrParts[0], fromSK, toPK)
			if err != nil {
				return "", err
			}
			h1, err := c.reEncryptHeader(hdrParts[1], fromSK, toPK)
			if err != nil {
				return "", err
			}
			headers[i] = h0 + "*" + h1
		}
	}

	setCode := func(col string) string {
		switch col {
		case "gallery":
			return "0"
		case "trash":
			return "1"
		default:
			return "2"
		}
	}
	movingStr := "0"
	if isMove {
		movingStr = "1"
	}
	paramsMap := map[string]string{
		"setFrom":     setCode(from),
		"setTo":       setCode(to),
		"albumIdFrom": fromAlbumID,
		"albumIdTo":   toAlbumID,
		"isMoving":    movingStr,
		"count":       strconv.Itoa(len(files)),
	}
	for i, fn := range files {
		paramsMap[fmt.Sprintf("filename%d", i)] = fn
		if len(headers) > i {
			paramsMap[fmt.Sprintf("headers%d", i)] = headers[i]
		}
	}
	params, err := c.makeParams(paramsMap)
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/moveFile", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) GetContact(email string) (map[string]any, error) {
	params, err := c.makeParams(map[string]string{
		"email": email,
	})
	if err != nil {
		return nil, err
	}
	resp, err := c.sendRequest("v2/sync/getContact", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return nil, err
	}
	if resp.Status != "ok" {
		return nil, errors.New(resp.Status)
	}
	var parts struct {
		Contact ContactRecord `json:"contact"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	uid := anyToString(parts.Contact.UserID)
	parts.Contact.UserID = uid
	c.contacts[uid] = parts.Contact
	_ = c.store.Set("contacts", c.contacts)
	return map[string]any{
		"userId":       uid,
		"email":        parts.Contact.Email,
		"publicKey":    parts.Contact.PublicKey,
		"dateModified": parts.Contact.DateModified,
	}, nil
}

func (c *Client) GetContacts() []map[string]any {
	out := make([]map[string]any, 0, len(c.contacts))
	for _, cnt := range c.contacts {
		uid := anyToString(cnt.UserID)
		out = append(out, map[string]any{
			"userId":       uid,
			"email":        cnt.Email,
			"publicKey":    cnt.PublicKey,
			"dateModified": cnt.DateModified,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		ei, _ := out[i]["email"].(string)
		ej, _ := out[j]["email"].(string)
		return ei < ej
	})
	return out
}

func (c *Client) GetFiles(collection string, offset int) (any, error) {
	var page IndexPage
	found, err := c.store.Get(fmt.Sprintf("index/%s/%06d", collection, offset), &page)
	if err != nil || !found {
		return nil, err
	}
	return page, nil
}

func (c *Client) GetCollections() ([]map[string]any, error) {
	galCover, _ := c.GetCover("gallery", nil)
	out := []map[string]any{
		{
			"collection": "gallery",
			"name":       "gallery",
			"cover":      galCover["url"],
			"isOwner":    true,
			"isShared":   false,
			"isOffline":  c.vars.GalleryOffline,
			"canAdd":     true,
			"canCopy":    true,
		},
		{
			"collection": "trash",
			"name":       "trash",
			"cover":      nil,
			"isOwner":    true,
			"isShared":   false,
			"isOffline":  false,
		},
	}

	myUID := c.vars.UserIDString()
	var albums []map[string]any
	for _, a := range c.albums {
		cov, _ := c.GetCover(a.AlbumID, nil)
		name, _ := c.decryptString(a.EncName)
		members := make([]map[string]any, 0, len(a.Members))
		for _, m := range a.Members {
			if m == "" {
				continue
			}
			if m == myUID {
				members = append(members, map[string]any{
					"userId": m,
					"email":  c.vars.Email,
					"myself": true,
				})
			} else if cnt, ok := c.contacts[m]; ok {
				members = append(members, map[string]any{
					"userId": m,
					"email":  cnt.Email,
				})
			} else {
				members = append(members, map[string]any{
					"userId": m,
					"email":  "#" + m,
				})
			}
		}
		canAdd := len(a.Permissions) >= 4 && a.Permissions[0] == '1' && a.Permissions[1] == '1'
		canShare := len(a.Permissions) >= 4 && a.Permissions[0] == '1' && a.Permissions[2] == '1'
		canCopy := len(a.Permissions) >= 4 && a.Permissions[0] == '1' && a.Permissions[3] == '1'
		albums = append(albums, map[string]any{
			"collection": a.AlbumID,
			"name":       name,
			"cover":      cov["url"],
			"members":    members,
			"isOwner":    a.IsOwner,
			"isShared":   a.IsShared,
			"isOffline":  a.IsOffline,
			"canAdd":     canAdd,
			"canShare":   canShare,
			"canCopy":    canCopy,
		})
	}
	sort.Slice(albums, func(i, j int) bool {
		ni, _ := albums[i]["name"].(string)
		nj, _ := albums[j]["name"].(string)
		return ni < nj
	})
	out = append(out, albums...)
	return out, nil
}

func (c *Client) GetCover(collection string, optCode *string) (map[string]any, error) {
	var code any
	var codeStr string
	hasCode := false
	if optCode != nil {
		code = *optCode
		codeStr = *optCode
		hasCode = true
	} else if alb, ok := c.albums[collection]; ok {
		code = alb.Cover
		codeStr = alb.Cover
		hasCode = true
	}
	if !hasCode {
		code = nil
	}
	if codeStr == "__b__" {
		return map[string]any{"url": nil, "code": code}, nil
	}
	file := codeStr
	if file == "" {
		var page IndexPage
		if found, err := c.store.Get(fmt.Sprintf("index/%s/000000", collection), &page); err == nil && found && len(page.Files) > 0 {
			file = page.Files[0].File
		}
	}
	if file == "" {
		return map[string]any{"url": nil, "code": code}, nil
	}
	f, ok := c.getFile(collection, file)
	if !ok {
		return map[string]any{"url": nil, "code": code}, nil
	}
	u, err := c.getDecryptURL(f, true)
	if err != nil {
		return map[string]any{"url": nil, "code": code}, nil
	}
	return map[string]any{"url": u, "code": code}, nil
}

func (c *Client) makeMetadata(pkB64, name string) (string, error) {
	pkBytes, err := base64DecimalOrBase64Decode(pkB64)
	if err != nil {
		return "", err
	}
	pk := stingle.PublicKeyFromBytes(pkBytes)
	return stingle.EncryptAlbumMetadata(stingle.AlbumMetadata{Name: name}, pk), nil
}

func (c *Client) RenameCollection(collection, name string) (string, error) {
	alb, ok := c.albums[collection]
	if !ok {
		return "", errors.New("invalid album")
	}
	md, err := c.makeMetadata(alb.PK, name)
	if err != nil {
		return "", err
	}
	params, err := c.makeParams(map[string]string{
		"albumId":  collection,
		"metadata": md,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/renameAlbum", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) SetCollectionOffline(collection string, isOffline bool) error {
	if collection == "gallery" {
		c.vars.GalleryOffline = isOffline
	} else if alb, ok := c.albums[collection]; ok {
		alb.IsOffline = isOffline
		_ = c.store.Set("albums", c.albums)
	}
	c.cancelCheckCachedFiles()
	if err := c.saveVars(); err != nil {
		return err
	}
	go func() {
		_, _ = c.checkCachedFiles()
	}()
	return nil
}

type PermissionsArg struct {
	CanAdd   bool `json:"canAdd"`
	CanShare bool `json:"canShare"`
	CanCopy  bool `json:"canCopy"`
}

func makePermissionsString(p PermissionsArg) string {
	b := []byte{'1', '0', '0', '0'}
	if p.CanAdd {
		b[1] = '1'
	}
	if p.CanShare {
		b[2] = '1'
	}
	if p.CanCopy {
		b[3] = '1'
	}
	return string(b)
}

func (c *Client) ShareCollection(collection string, perms PermissionsArg, members []string) (string, error) {
	myUID := c.vars.UserIDString()
	allMembers := append([]string{}, members...)
	allMembers = append(allMembers, myUID)

	albumObj := map[string]string{
		"albumId":     collection,
		"isShared":    "1",
		"permissions": makePermissionsString(perms),
		"members":     strings.Join(allMembers, ","),
	}
	sk, err := c.decryptAlbumSK(collection, nil)
	if err != nil {
		return "", err
	}
	defer sk.Wipe()
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)

	sharingKeys := make(map[string]string)
	for _, m := range allMembers {
		if m == myUID {
			continue
		}
		cnt, ok := c.contacts[m]
		if !ok {
			return "", fmt.Errorf("contact %s not found", m)
		}
		pkBytes, err := base64DecimalOrBase64Decode(cnt.PublicKey)
		if err != nil {
			return "", err
		}
		pk := stingle.PublicKeyFromBytes(pkBytes)
		sharingKeys[m] = pk.SealBoxBase64(rawSK)
	}
	albumJSON, _ := json.Marshal(albumObj)
	keysJSON, _ := json.Marshal(sharingKeys)
	params, err := c.makeParams(map[string]string{
		"album":       string(albumJSON),
		"sharingKeys": string(keysJSON),
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/share", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) UnshareCollection(collection string) (string, error) {
	params, err := c.makeParams(map[string]string{
		"albumId": collection,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/unshareAlbum", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) RemoveMembers(collection string, members []string) ([]string, error) {
	albumJSON, _ := json.Marshal(map[string]string{"albumId": collection})
	var out []string
	for _, m := range members {
		params, err := c.makeParams(map[string]string{
			"album":        string(albumJSON),
			"memberUserId": m,
		})
		if err != nil {
			return nil, err
		}
		resp, err := c.sendRequest("v2/sync/removeAlbumMember", map[string]string{
			"token":  c.token(),
			"params": params,
		})
		if err != nil {
			return nil, err
		}
		if resp.Status != "ok" {
			return nil, errors.New(resp.Status)
		}
		out = append(out, resp.Status)
	}
	return out, nil
}

func (c *Client) UpdatePermissions(collection string, perms PermissionsArg) (string, error) {
	albumJSON, _ := json.Marshal(map[string]string{
		"albumId":     collection,
		"permissions": makePermissionsString(perms),
	})
	params, err := c.makeParams(map[string]string{
		"album": string(albumJSON),
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/editPerms", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) LeaveCollection(collection string) (string, error) {
	params, err := c.makeParams(map[string]string{
		"albumId": collection,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/leaveAlbum", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

func (c *Client) CreateCollection(name string) (string, error) {
	sk := stingle.MakeSecretKey()
	defer sk.Wipe()
	pk := sk.PublicKey()

	userPK, err := c.publicKey()
	if err != nil {
		return "", err
	}
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)
	encSK := userPK.SealBoxBase64(rawSK)
	pkB64 := base64.StdEncoding.EncodeToString(pk.ToBytes())

	idBytes := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, idBytes)
	albumID := base64.RawURLEncoding.EncodeToString(idBytes)
	nowStr := strconv.FormatInt(time.Now().UnixMilli(), 10)
	md := stingle.EncryptAlbumMetadata(stingle.AlbumMetadata{Name: name}, pk)

	params, err := c.makeParams(map[string]string{
		"albumId":       albumID,
		"dateCreated":   nowStr,
		"dateModified":  nowStr,
		"metadata":      md,
		"encPrivateKey": encSK,
		"publicKey":     pkB64,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/addAlbum", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	encName, err := c.encryptString(name)
	if err != nil {
		return "", err
	}
	rec := &AlbumRecord{
		AlbumID:      albumID,
		PK:           pkB64,
		EncSK:        encSK,
		EncName:      encName,
		Cover:        "",
		Members:      nil,
		IsOwner:      true,
		IsShared:     false,
		Permissions:  "",
		DateModified: nowStr,
		DateCreated:  nowStr,
	}
	c.albums[albumID] = rec
	_ = c.store.Set("albums", c.albums)
	return albumID, nil
}

func (c *Client) DeleteCollection(collection string) (string, error) {
	prefix := fmt.Sprintf("files/%s/", collection)
	keys, err := c.store.Keys(prefix)
	if err == nil && len(keys) > 0 {
		files := make([]string, len(keys))
		for i, k := range keys {
			files[i] = strings.TrimPrefix(k, prefix)
		}
		if _, err := c.MoveFiles(collection, "trash", files, true); err != nil {
			return "", err
		}
	}
	params, err := c.makeParams(map[string]string{
		"albumId": collection,
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/sync/deleteAlbum", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	return resp.Status, nil
}

type CachePreferenceArg struct {
	Mode      string `json:"mode"`
	AllThumbs bool   `json:"allthumbs"`
	Mobile    bool   `json:"mobile"`
	MaxSize   any    `json:"maxSize"`
}

func (c *Client) SetCachePreference(v CachePreferenceArg) error {
	if v.Mode != "no-store" && v.Mode != "private" && v.Mode != "encrypted" {
		return errors.New("invalid cache option")
	}
	c.vars.CachePref = v.Mode
	c.vars.PrefetchThumbnails = v.AllThumbs
	c.vars.DownloadOnMobile = v.Mobile
	maxMB := toInt64(v.MaxSize)
	if maxMB < 1 {
		maxMB = 1
	}
	c.vars.MaxCacheSize = maxMB * 1024 * 1024
	if c.cm != nil {
		c.cm.SetMaxSize(c.vars.MaxCacheSize)
	}
	c.cancelCheckCachedFiles()
	if v.Mode != "encrypted" {
		_ = c.deleteCache()
	}
	if err := c.saveVars(); err != nil {
		return err
	}
	go func() {
		_, _ = c.checkCachedFiles()
	}()
	return nil
}

func (c *Client) CachePreference() map[string]any {
	var usage int64
	if c.cm != nil {
		usage = c.cm.TotalSize() / 1024 / 1024
	}
	return map[string]any{
		"mode":      c.vars.CachePref,
		"allthumbs": c.vars.PrefetchThumbnails,
		"mobile":    c.vars.DownloadOnMobile,
		"maxSize":   c.vars.MaxCacheSize / 1024 / 1024,
		"usage":     usage,
	}
}

func (c *Client) deleteCache() error {
	_ = DeleteBrowserCache("local")
	if bc, err := OpenBrowserCache("local"); err == nil {
		c.cache = bc
	}
	if c.cm != nil {
		_ = c.cm.Delete()
	}
	if c.cache != nil {
		c.cm = NewCacheManager(c.store, c.cache, c.vars.MaxCacheSize)
	}
	return nil
}

func (c *Client) cancelCheckCachedFiles() {
	c.mu.Lock()
	cancel := c.checkCachedFilesCancel
	done := c.checkCachedFilesDone
	c.mu.Unlock()
	if cancel != nil {
		select {
		case <-cancel:
		default:
			close(cancel)
		}
		if done != nil {
			<-done
		}
	}
}

func (c *Client) checkCachedFiles() (int, error) {
	if c.cm == nil {
		return 0, nil
	}
	c.mu.Lock()
	if c.checkCachedFilesDone != nil {
		done := c.checkCachedFilesDone
		c.mu.Unlock()
		<-done
		return 0, nil
	}
	cancel := make(chan struct{})
	done := make(chan struct{})
	c.checkCachedFilesCancel = cancel
	c.checkCachedFilesDone = done
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.checkCachedFilesCancel = nil
		c.checkCachedFilesDone = nil
		close(done)
		c.mu.Unlock()
	}()

	count, err := c.checkCachedFilesNow(cancel)
	if err != nil {
		if c.callbacks.OnDownloadProgress != nil {
			c.callbacks.OnDownloadProgress(map[string]any{
				"count": 0,
				"total": 0,
				"done":  true,
				"err":   err.Error(),
			})
		}
	}
	_ = c.cm.Flush()
	_ = c.cm.SelfCheck()
	return count, err
}

func (c *Client) checkCachedFilesNow(cancel <-chan struct{}) (int, error) {
	if c.vars.CachePref != "encrypted" || c.cm == nil {
		return 0, nil
	}
	oc := make(map[string]bool)
	if c.vars.GalleryOffline {
		oc["gallery"] = true
	}
	for id, alb := range c.albums {
		if alb.IsOffline {
			oc[id] = true
		}
	}

	allFiles := make(map[string]bool)
	type wantItem struct {
		file       string
		collection string
	}
	var wantTNOrder, wantFSOrder []string
	wantTN := make(map[string]string)
	wantFS := make(map[string]string)

	fileKeys, err := c.store.Keys("files/")
	if err != nil {
		return 0, err
	}
	for _, k := range fileKeys {
		p := strings.LastIndex(k, "/")
		if p <= 6 {
			continue
		}
		col := k[6:p]
		f := k[p+1:]
		allFiles[f] = true
		if c.vars.PrefetchThumbnails || oc[col] {
			if _, exists := wantTN[f]; !exists {
				wantTNOrder = append(wantTNOrder, f)
			}
			wantTN[f] = col
		}
		if oc[col] {
			if _, exists := wantFS[f]; !exists {
				wantFSOrder = append(wantFSOrder, f)
			}
			wantFS[f] = col
		}
	}

	cmKeys, err := c.cm.Keys()
	if err != nil {
		return 0, err
	}
	for _, key := range cmKeys {
		isThumb := strings.HasPrefix(key, "tn/")
		idx := strings.Index(key, "/")
		if idx < 0 {
			continue
		}
		name := key[idx+1:]
		var stick bool
		if isThumb {
			_, stick = wantTN[name]
			delete(wantTN, name)
		} else {
			_, stick = wantFS[name]
			delete(wantFS, name)
		}
		if allFiles[name] {
			if stick {
				_ = c.cm.Update(key, CacheOptions{Stick: true})
			} else {
				_ = c.cm.Update(key, CacheOptions{Unstick: true})
			}
		} else {
			_ = c.cm.Update(key, CacheOptions{Delete: true})
		}
	}

	type queueItem struct {
		f string
		c string
		t bool
	}
	var queue []queueItem
	for _, f := range wantTNOrder {
		if col, ok := wantTN[f]; ok {
			queue = append(queue, queueItem{f: f, c: col, t: true})
		}
	}
	for _, f := range wantFSOrder {
		if col, ok := wantFS[f]; ok {
			queue = append(queue, queueItem{f: f, c: col, t: false})
		}
	}

	total := len(queue)
	count := 0
	ticker := time.NewTicker(500 * time.Millisecond)
	stopTicker := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				if c.callbacks.OnDownloadProgress != nil {
					c.callbacks.OnDownloadProgress(map[string]any{
						"count": count,
						"total": total,
						"done":  false,
					})
				}
			case <-stopTicker:
				return
			}
		}
	}()
	defer func() {
		ticker.Stop()
		close(stopTicker)
	}()

	for _, it := range queue {
		count++
		var fetchErr error
		if c.fetchCachedFileHook != nil {
			fetchErr = c.fetchCachedFileHook(it.f, it.c, it.t)
		} else {
			fetchErr = c.fetchCachedFile(it.f, it.c, it.t, cancel)
		}
		if fetchErr != nil {
			return count, fetchErr
		}
	}
	if count > 0 && c.callbacks.OnDownloadProgress != nil {
		c.callbacks.OnDownloadProgress(map[string]any{
			"count": count,
			"total": total,
			"done":  true,
		})
	}
	return count, nil
}

func (c *Client) saveBandwidth() error {
	conn := jsutil.Navigator.Get("connection")
	if !conn.Truthy() {
		return nil
	}
	if saveData := conn.Get("saveData"); saveData.Truthy() && saveData.Bool() {
		return errors.New(T("data-saving-on"))
	}
	ctype := ""
	if t := conn.Get("type"); t.Truthy() {
		ctype = t.String()
	}
	if ctype == "wifi" || ctype == "ethernet" || ctype == "" {
		return nil
	}
	if c.vars.DownloadOnMobile {
		return nil
	}
	return errors.New(T("no-wifi"))
}
