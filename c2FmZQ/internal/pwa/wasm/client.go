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
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"sync"
	"syscall/js"

	"github.com/tyler-smith/go-bip39"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/nacl/secretbox"

	"c2FmZQ/internal/pwa/wasm/jsutil"
	"c2FmZQ/internal/stingle"
)

var serverMessages = map[string]string{
	"Account is not approved yet":              "server-error-account-not-approved",
	"Adding to this album is not permitted":    "server-error-add-not-permitted",
	"Can only move from trash to gallery":      "server-error-move-from-trash-only",
	"Can only move to trash, not copy":         "server-error-move-to-trash-not-copy",
	"Code is invalid":                          "server-error-invalid-code",
	"Copying from this album is not permitted": "server-error-copy-not-permitted",
	"Data outdated":                            "server-error-data-outdated",
	"Email updated":                            "server-info-email-updated",
	"Invalid credentials":                      "server-error-invalid-credentials",
	"MFA disabled":                             "server-info-mfa-disabled",
	"MFA enabled":                              "server-info-mfa-enabled",
	"MFA failed":                               "server-error-mfa-failed",
	"MFA OK":                                   "server-info-mfa-ok",
	"OTP disabled":                             "server-info-otp-disabled",
	"OTP enabled":                              "server-info-otp-enabled",
	"Password updated":                         "server-info-password-updated",
	"Quota exceeded":                           "server-error-quota-exceeded",
	"Removing items from this album is not permitted":                    "server-error-remove-not-permitted",
	"Security device registered":                                         "server-info-security-device-registered",
	"Security devices updated":                                           "server-info-security-devices-updated",
	"This functionality is not yet implemented in the server":            "server-error-not-implemented",
	"Too many files":                                                     "server-error-too-many-files",
	"You are not allowed to share the album":                             "server-error-sharing-not-allowed",
	"You are not a member of this album":                                 "server-error-not-album-member",
	"You are not logged in":                                              "server-error-not-logged-in",
	"You are not the owner of the album":                                 "server-error-not-album-owner",
	"You can't leave your own album":                                     "server-error-cannot-leave-own-album",
	"Your account hasn't been approved yet. Some features are disabled.": "server-info-account-not-approved",
	"Your app is too far out of sync. Upload your changes, then wipe your data, and login again.": "server-error-app-out-of-sync",
}

func T(key string, args ...any) string {
	fn := jsutil.Global.Get("_T")
	if !fn.Truthy() || fn.Type() != js.TypeFunction {
		if len(args) > 0 {
			return fmt.Sprint(args[0])
		}
		return key
	}
	jsArgs := make([]any, 0, 1+len(args))
	jsArgs = append(jsArgs, key)
	jsArgs = append(jsArgs, args...)
	res := fn.Invoke(jsArgs...)
	if res.Truthy() {
		return res.String()
	}
	return key
}

func translateServerMessage(msg string) string {
	if key, ok := serverMessages[msg]; ok {
		return T(key, msg)
	}
	jsutil.Log("WASM: un-translated server message:", msg)
	return msg
}

type ClientVars struct {
	AlbumsTimeStamp     int64  `json:"albumsTimeStamp"`
	GalleryTimeStamp    int64  `json:"galleryTimeStamp"`
	TrashTimeStamp      int64  `json:"trashTimeStamp"`
	AlbumFilesTimeStamp int64  `json:"albumFilesTimeStamp"`
	ContactsTimeStamp   int64  `json:"contactsTimeStamp"`
	DeletesTimeStamp    int64  `json:"deletesTimeStamp"`
	Server              string `json:"server,omitempty"`
	DecryptPath         string `json:"decryptPath,omitempty"`
	MaxCacheSize        int64  `json:"maxCacheSize,omitempty"`
	CachePref           string `json:"cachePref,omitempty"`
	DownloadOnMobile    bool   `json:"downloadOnMobile"`
	PrefetchThumbnails  bool   `json:"prefetchThumbnails"`
	GalleryOffline      bool   `json:"galleryOffline,omitempty"`
	SpaceUsed           int64  `json:"spaceUsed"`
	SpaceQuota          int64  `json:"spaceQuota"`
	LoginSalt           string `json:"loginSalt,omitempty"`
	EToken              string `json:"etoken,omitempty"`
	ServerPK            string `json:"serverPK,omitempty"`
	PK                  string `json:"pk,omitempty"`
	ESK                 string `json:"esk,omitempty"`
	KeyIsBackedUp       bool   `json:"keyIsBackedUp"`
	Email               string `json:"email,omitempty"`
	UserID              any    `json:"userId,omitempty"`
	IsAdmin             bool   `json:"isAdmin"`
	EnableNotifications bool   `json:"enableNotifications"`
	PasswordSalt        string `json:"passwordSalt,omitempty"`
	Password            string `json:"password,omitempty"`
	IndexVersion        int    `json:"indexVersion,omitempty"`
}

// indexFormatVersion is the format version of the persisted
// index/<collection>/NNNNNN pages. Bump it whenever their content changes in
// a way that requires existing pages to be regenerated, e.g. when the format
// of the decrypt URLs changes. The store is shared with older clients, so
// Init() rebuilds all the indexes when the stored version doesn't match.
//
// Version 0 (unset): pages written by the JavaScript client, with
// <prefix><decryptPath>/... URLs.
// Version 1: <prefix>stream/<decryptPath>/... URLs.
const indexFormatVersion = 1

func (v *ClientVars) UserIDString() string {
	if v.UserID == nil {
		return ""
	}
	switch x := v.UserID.(type) {
	case string:
		return x
	case float64:
		return fmt.Sprintf("%.0f", x)
	default:
		return fmt.Sprint(x)
	}
}

type AlbumRecord struct {
	AlbumID      string     `json:"albumId"`
	PK           string     `json:"pk"`
	EncSK        string     `json:"encSK"`
	EncName      string     `json:"encName"`
	Cover        string     `json:"cover"`
	Members      StringList `json:"members"`
	IsOwner      bool       `json:"isOwner"`
	IsShared     bool       `json:"isShared"`
	IsOffline    bool       `json:"isOffline"`
	Permissions  string     `json:"permissions"`
	DateModified any        `json:"dateModified"`
	DateCreated  any        `json:"dateCreated"`
}

// StringList is a []string that also accepts a comma-separated string when
// decoding JSON. Albums created by the previous (JavaScript) client were
// persisted with members: "" instead of an array.
type StringList []string

func (l *StringList) UnmarshalJSON(b []byte) error {
	var list []string
	if err := json.Unmarshal(b, &list); err == nil {
		*l = list
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("members: expected array or string, got %s", string(b))
	}
	*l = nil
	for _, m := range strings.Split(s, ",") {
		if m != "" {
			*l = append(*l, m)
		}
	}
	return nil
}

type ContactRecord struct {
	UserID       any    `json:"userId"`
	Email        string `json:"email"`
	PublicKey    string `json:"publicKey"`
	DateModified int64  `json:"dateModified,omitempty"`
}

type FileHeaderRecord struct {
	ChunkSize   int32  `json:"chunkSize"`
	DataSize    int64  `json:"dataSize"`
	EncKey      string `json:"encKey"`
	FileType    uint8  `json:"fileType"`
	EncFileName string `json:"encFileName"`
	Duration    int32  `json:"duration"`
	HeaderSize  int    `json:"headerSize"`
}

type FileRecord struct {
	File         string              `json:"file"`
	Set          int                 `json:"set"`
	AlbumID      string              `json:"albumId,omitempty"`
	Headers      [2]FileHeaderRecord `json:"headers"`
	OrigHeaders  string              `json:"origHeaders"`
	DateCreated  any                 `json:"dateCreated"`
	DateModified any                 `json:"dateModified"`
}

type IndexedFile struct {
	Collection   string `json:"collection"`
	File         string `json:"file"`
	IsImage      bool   `json:"isImage"`
	IsVideo      bool   `json:"isVideo"`
	FileName     string `json:"fileName"`
	DateCreated  any    `json:"dateCreated"`
	DateModified any    `json:"dateModified"`
	Size         int64  `json:"size"`
	ContentType  string `json:"contentType"`
	Duration     int32  `json:"duration,omitempty"`
	URL          string `json:"url"`
	ThumbURL     string `json:"thumbUrl"`
}

type IndexPage struct {
	Start int           `json:"start"`
	Total int           `json:"total"`
	Files []IndexedFile `json:"files"`
}

type ClientCallbacks struct {
	OnError            func(msg string)
	OnInfo             func(msg string)
	OnLoggedOut        func()
	OnUploadProgress   func(progress map[string]any)
	OnDownloadProgress func(progress map[string]any)
	GetMFA             func(mfa any) (any, error)
}

type Client struct {
	mu           sync.Mutex
	store        StoreInterface
	cache        CacheStorage
	cm           *CacheManager
	pathPrefix   string
	sameOrigin   bool
	capabilities []string
	callbacks    ClientCallbacks

	vars     ClientVars
	skey     *[32]byte
	albums   map[string]*AlbumRecord
	contacts map[string]ContactRecord

	gettingUpdates         bool
	checkCachedFilesCancel chan struct{}
	checkCachedFilesDone   chan struct{}
	fetchCachedFileHook    func(name, collection string, isThumb bool) error

	uploadMu               sync.Mutex
	uploadBatches          []*uploadBatch
	uploadCancel           bool
	streamingUploadChecked bool
	streamingUploadWorks   bool
}

func NewClient(store StoreInterface, pathPrefix string, sameOrigin bool, capabilities []string, callbacks ClientCallbacks) *Client {
	if pathPrefix == "" {
		pathPrefix = "/"
	}
	c := &Client{
		store:        store,
		pathPrefix:   pathPrefix,
		sameOrigin:   sameOrigin,
		capabilities: capabilities,
		callbacks:    callbacks,
	}
	c.resetDB()
	return c
}

func (c *Client) resetDB() {
	c.albums = make(map[string]*AlbumRecord)
	c.contacts = make(map[string]ContactRecord)
}

func (c *Client) Wipe() {
	if c.skey != nil {
		wipeBytes(c.skey[:])
		c.skey = nil
	}
}

func (c *Client) Init() error {
	if err := c.loadVars(); err != nil {
		return err
	}
	var albums map[string]*AlbumRecord
	if _, err := c.store.Get("albums", &albums); err != nil {
		jsutil.LogError("WASM: loading albums:", err)
	}
	if albums == nil {
		albums = make(map[string]*AlbumRecord)
	}
	c.albums = albums
	var contacts map[string]ContactRecord
	if _, err := c.store.Get("contacts", &contacts); err != nil {
		jsutil.LogError("WASM: loading contacts:", err)
	}
	if contacts == nil {
		contacts = make(map[string]ContactRecord)
	}
	c.contacts = contacts
	if err := c.rebuildIndexesIfNeeded(); err != nil {
		jsutil.LogError("WASM: rebuilding indexes:", err)
	}

	if bc, err := OpenBrowserCache("local"); err == nil {
		c.cache = bc
	}
	if c.vars.MaxCacheSize == 0 {
		c.vars.MaxCacheSize = 10 * 1024 * 1024 * 1024 // Default 10 GB
		if storage := jsutil.Navigator.Get("storage"); storage.Truthy() {
			if estFn := storage.Get("estimate"); estFn.Truthy() && estFn.Type() == js.TypeFunction {
				if est, err := jsutil.Await(storage.Call("estimate")); err == nil && est.Truthy() {
					if q := est.Get("quota"); q.Truthy() {
						c.vars.MaxCacheSize = int64(0.9 * q.Float())
					}
				}
			}
		}
	}
	if c.vars.CachePref == "" {
		c.vars.CachePref = "encrypted"
		c.vars.DownloadOnMobile = false
		c.vars.PrefetchThumbnails = false
	}
	if c.cache != nil {
		c.cm = NewCacheManager(c.store, c.cache, c.vars.MaxCacheSize)
	}
	return nil
}

func (c *Client) rebuildIndexesIfNeeded() error {
	if c.vars.IndexVersion == indexFormatVersion {
		return nil
	}
	jsutil.Log("WASM: rebuilding indexes, version", c.vars.IndexVersion, "->", indexFormatVersion)
	if err := c.store.DelPrefix("index/"); err != nil {
		return err
	}
	keys, err := c.store.Keys("files/")
	if err != nil {
		return err
	}
	collections := make(map[string]bool)
	for _, k := range keys {
		rest := strings.TrimPrefix(k, "files/")
		if i := strings.IndexByte(rest, '/'); i > 0 {
			collections[rest[:i]] = true
		}
	}
	for col := range collections {
		if err := c.indexCollection(col); err != nil {
			return err
		}
	}
	c.vars.IndexVersion = indexFormatVersion
	return c.saveVars()
}

func (c *Client) saveVars() error {
	return c.store.Set("vars", c.vars)
}

func (c *Client) clearVars() error {
	c.vars = ClientVars{}
	c.Wipe()
	_ = c.saveVars()
	return c.store.Clear()
}

func (c *Client) loadVars() error {
	var v ClientVars
	_, _ = c.store.Get("vars", &v)
	c.vars = v
	if c.vars.Server == "" {
		c.vars.Server = c.pathPrefix
	}
	if c.vars.DecryptPath == "" {
		b := make([]byte, 16)
		_, _ = io.ReadFull(rand.Reader, b)
		c.vars.DecryptPath = hex.EncodeToString(b)
		return c.saveVars()
	}
	return nil
}

func (c *Client) setSessionKey(reset bool) error {
	if !reset && c.skey != nil {
		return nil
	}
	var skeyB64 string
	if !reset {
		_, _ = c.store.Get("skey", &skeyB64)
	}
	var keyBytes []byte
	if skeyB64 != "" {
		keyBytes, _ = base64.StdEncoding.DecodeString(skeyB64)
	}
	defer func() {
		wipeBytes(keyBytes)
	}()
	if len(keyBytes) != 32 {
		keyBytes = make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, keyBytes); err != nil {
			return err
		}
		skeyB64 = base64.StdEncoding.EncodeToString(keyBytes)
		if err := c.store.Set("skey", skeyB64); err != nil {
			return err
		}
	}
	c.Wipe()
	var k [32]byte
	copy(k[:], keyBytes)
	c.skey = &k
	return nil
}

func (c *Client) encryptBytes(data []byte) (string, error) {
	if err := c.setSessionKey(false); err != nil {
		return "", err
	}
	var nonce [24]byte
	if _, err := io.ReadFull(rand.Reader, nonce[:]); err != nil {
		return "", err
	}
	out := make([]byte, 24, 24+len(data)+secretbox.Overhead)
	copy(out, nonce[:])
	out = secretbox.Seal(out, data, &nonce, c.skey)
	return base64.StdEncoding.EncodeToString(out), nil
}

func (c *Client) decryptBytes(encB64 string) ([]byte, error) {
	if err := c.setSessionKey(false); err != nil {
		return nil, err
	}
	raw, err := base64DecimalOrBase64Decode(encB64)
	if err != nil {
		return nil, err
	}
	if len(raw) < 24+secretbox.Overhead {
		return nil, errors.New("ciphertext too short")
	}
	var nonce [24]byte
	copy(nonce[:], raw[:24])
	pt, ok := secretbox.Open(nil, raw[24:], &nonce, c.skey)
	if !ok {
		return nil, errors.New("session decryption failed")
	}
	return pt, nil
}

func (c *Client) encryptString(s string) (string, error) {
	return c.encryptBytes([]byte(s))
}

func (c *Client) decryptString(encB64 string) (string, error) {
	b, err := c.decryptBytes(encB64)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) secretKey() (*stingle.SecretKey, error) {
	if c.vars.ESK == "" {
		_ = c.Logout()
		return nil, errors.New("not logged in")
	}
	b, err := c.decryptBytes(c.vars.ESK)
	if err != nil {
		return nil, err
	}
	defer wipeBytes(b)
	return stingle.SecretKeyFromBytes(b), nil
}

func (c *Client) publicKey() (stingle.PublicKey, error) {
	b, err := base64DecimalOrBase64Decode(c.vars.PK)
	if err != nil {
		return stingle.PublicKey{}, err
	}
	return stingle.PublicKeyFromBytes(b), nil
}

func (c *Client) serverPublicKey() (stingle.PublicKey, error) {
	b, err := base64DecimalOrBase64Decode(c.vars.ServerPK)
	if err != nil {
		return stingle.PublicKey{}, err
	}
	return stingle.PublicKeyFromBytes(b), nil
}

func (c *Client) token() string {
	if c.vars.EToken == "" {
		return ""
	}
	t, err := c.decryptString(c.vars.EToken)
	if err != nil {
		return ""
	}
	return t
}

func (c *Client) makeParams(obj any) (string, error) {
	b, err := json.Marshal(obj)
	if err != nil {
		return "", err
	}
	defer wipeBytes(b)
	sk, err := c.secretKey()
	if err != nil {
		return "", err
	}
	defer sk.Wipe()
	spk, err := c.serverPublicKey()
	if err != nil {
		return "", err
	}
	return stingle.EncryptMessage(b, spk, sk), nil
}

func base64DecimalOrBase64Decode(s string) ([]byte, error) {
	s = strings.ReplaceAll(s, "-", "+")
	s = strings.ReplaceAll(s, "_", "/")
	if m := len(s) % 4; m != 0 {
		s += strings.Repeat("=", 4-m)
	}
	return base64.StdEncoding.DecodeString(s)
}

func (c *Client) passwordForLogin(salt []byte, password string) string {
	return stingle.PasswordHashForLogin([]byte(password), salt)
}

func (c *Client) passwordForValidation(saltHex, password string) (string, error) {
	salt, err := hex.DecodeString(saltHex)
	if err != nil {
		return "", err
	}
	// opsLimit = PWHASH_OPSLIMIT_INTERACTIVE (2), memLimit = PWHASH_MEMLIMIT_MODERATE (262144 KiB), len = 128
	dk := argon2.IDKey([]byte(password), salt, 2, 262144, 1, 128)
	return strings.ToUpper(hex.EncodeToString(dk)), nil
}

func (c *Client) checkPassword(password string) bool {
	if c.vars.PasswordSalt == "" || c.vars.Password == "" {
		return false
	}
	h, err := c.passwordForValidation(c.vars.PasswordSalt, password)
	if err != nil {
		return false
	}
	return h == c.vars.Password
}

func (c *Client) makeKeyBundle(password string, pk stingle.PublicKey, sk *stingle.SecretKey) string {
	if sk == nil {
		return stingle.MakeKeyBundle(pk)
	}
	return stingle.MakeSecretKeyBundle([]byte(password), sk)
}

func (c *Client) decodeKeyBundle(password, bundle string) (stingle.PublicKey, *stingle.SecretKey, error) {
	pk, hasSK, err := stingle.DecodeKeyBundle(bundle)
	if err != nil {
		return stingle.PublicKey{}, nil, err
	}
	if !hasSK {
		return pk, nil, nil
	}
	sk, err := stingle.DecodeSecretKeyBundle([]byte(password), bundle)
	if err != nil {
		return stingle.PublicKey{}, nil, err
	}
	return pk, sk, nil
}

type serverResponse struct {
	Status string          `json:"status"`
	Parts  json.RawMessage `json:"parts"`
	Infos  []string        `json:"infos"`
	Errors []string        `json:"errors"`
}

func (c *Client) sendRequest(endpoint string, data map[string]string) (*serverResponse, error) {
	vals := url.Values{}
	for k, v := range data {
		vals.Set(k, v)
	}
	mode := "cors"
	if c.sameOrigin {
		mode = "same-origin"
	}
	hdrs := jsutil.NewObject(map[string]any{
		"Content-Type":          "application/x-www-form-urlencoded",
		"X-c2FmZQ-capabilities": strings.Join(c.capabilities, ","),
	})
	opts := jsutil.NewObject(map[string]any{
		"method":         "POST",
		"mode":           mode,
		"headers":        hdrs,
		"redirect":       "error",
		"referrerPolicy": "no-referrer",
		"body":           vals.Encode(),
	})
	respVal, err := jsutil.Await(jsutil.Global.Call("fetch", c.vars.Server+endpoint, opts))
	if err != nil {
		return nil, errors.New(T("network-error"))
	}
	if !respVal.Get("ok").Bool() {
		return nil, fmt.Errorf("%d %s", respVal.Get("status").Int(), respVal.Get("statusText").String())
	}
	textVal, err := jsutil.Await(respVal.Call("text"))
	if err != nil {
		return nil, err
	}
	var sr serverResponse
	if err := json.Unmarshal([]byte(textVal.String()), &sr); err != nil {
		return nil, err
	}
	if len(sr.Infos) > 0 && c.callbacks.OnInfo != nil {
		msgs := make([]string, len(sr.Infos))
		for i, info := range sr.Infos {
			msgs[i] = translateServerMessage(info)
		}
		c.callbacks.OnInfo(strings.Join(msgs, "\n"))
	}
	if len(sr.Errors) > 0 && c.callbacks.OnError != nil {
		msgs := make([]string, len(sr.Errors))
		for i, e := range sr.Errors {
			msgs[i] = translateServerMessage(e)
		}
		c.callbacks.OnError(strings.Join(msgs, "\n"))
	}

	var partsMap map[string]any
	if len(sr.Parts) > 0 {
		_ = json.Unmarshal(sr.Parts, &partsMap)
	}

	if data["mfa"] == "" && sr.Status == "nok" && partsMap != nil && partsMap["mfa"] != nil && c.callbacks.GetMFA != nil {
		mfaRes, err := c.callbacks.GetMFA(partsMap["mfa"])
		if err != nil {
			return nil, err
		}
		if mfaRes == nil {
			mfaRes = map[string]any{}
		}
		mfaJSON, err := json.Marshal(mfaRes)
		if err != nil {
			return nil, err
		}
		data["mfa"] = string(mfaJSON)
		return c.sendRequest(endpoint, data)
	}

	if partsMap != nil && endpoint != "v2/login/logout" {
		if logout, ok := partsMap["logout"].(string); ok && logout == "1" {
			c.vars = ClientVars{}
			c.Wipe()
			c.resetDB()
			_ = c.store.Clear()
			if c.callbacks.OnLoggedOut != nil {
				c.callbacks.OnLoggedOut()
			}
		}
	}
	return &sr, nil
}

func (c *Client) IsLoggedIn() map[string]any {
	tok := c.token()
	loggedIn := ""
	if tok != "" {
		loggedIn = c.vars.Email
	}
	return map[string]any{
		"account": loggedIn,
		"isAdmin": c.vars.IsAdmin,
		"needKey": c.vars.ESK == "",
		"server":  c.vars.Server,
	}
}

func (c *Client) Quota() map[string]any {
	return map[string]any{
		"usage": c.vars.SpaceUsed,
		"quota": c.vars.SpaceQuota,
	}
}

type LoginArgs struct {
	Email               string `json:"email"`
	Password            string `json:"password"`
	EnableBackup        bool   `json:"enableBackup"`
	BackupPhrase        string `json:"backupPhrase"`
	Server              string `json:"server"`
	EnableNotifications bool   `json:"enableNotifications"`
	ResetSkey           *bool  `json:"resetSkey"`
}

func (c *Client) setServerURL(server string) {
	if !c.sameOrigin && server != "" {
		if !strings.HasSuffix(server, "/") {
			server += "/"
		}
		c.vars.Server = server
	}
}

func (c *Client) Login(args LoginArgs) (map[string]any, error) {
	c.setServerURL(args.Server)
	preResp, err := c.sendRequest("v2/login/preLogin", map[string]string{
		"email": args.Email,
	})
	if err != nil {
		return nil, err
	}
	var preParts struct {
		Salt string `json:"salt"`
	}
	if err := json.Unmarshal(preResp.Parts, &preParts); err != nil || preParts.Salt == "" {
		if preResp.Status != "" && preResp.Status != "ok" {
			return nil, errors.New(preResp.Status)
		}
		return nil, errors.New("nok")
	}
	c.vars.LoginSalt = preParts.Salt
	salt, err := hex.DecodeString(preParts.Salt)
	if err != nil {
		return nil, err
	}
	hashed := c.passwordForLogin(salt, args.Password)
	loginResp, err := c.sendRequest("v2/login/login", map[string]string{
		"email":    args.Email,
		"password": hashed,
	})
	if err != nil {
		return nil, err
	}
	if loginResp.Status != "ok" {
		return nil, errors.New(loginResp.Status)
	}
	var loginParts struct {
		Token           string `json:"token"`
		ServerPublicKey string `json:"serverPublicKey"`
		KeyBundle       string `json:"keyBundle"`
		UserID          any    `json:"userId"`
		Admin           string `json:"_admin"`
	}
	if err := json.Unmarshal(loginResp.Parts, &loginParts); err != nil {
		return nil, err
	}
	resetSkey := true
	if args.ResetSkey != nil && !*args.ResetSkey {
		resetSkey = false
	}
	if err := c.setSessionKey(resetSkey); err != nil {
		return nil, err
	}
	etoken, err := c.encryptString(loginParts.Token)
	if err != nil {
		return nil, err
	}
	c.vars.EToken = etoken
	c.vars.ServerPK = loginParts.ServerPublicKey

	pk, sk, err := c.decodeKeyBundle(args.Password, loginParts.KeyBundle)
	if err != nil {
		return nil, err
	}
	c.vars.PK = base64.StdEncoding.EncodeToString(pk.ToBytes())
	if sk != nil {
		defer sk.Wipe()
		rawSK := sk.ToBytes()
		defer wipeBytes(rawSK)
		esk, err := c.encryptBytes(rawSK)
		if err != nil {
			return nil, err
		}
		c.vars.ESK = esk
		c.vars.KeyIsBackedUp = true
	} else {
		c.vars.KeyIsBackedUp = false
	}

	c.vars.Email = args.Email
	c.vars.UserID = loginParts.UserID
	c.vars.IsAdmin = loginParts.Admin == "1"
	c.vars.EnableNotifications = args.EnableNotifications

	pwSalt := make([]byte, 16)
	_, _ = io.ReadFull(rand.Reader, pwSalt)
	c.vars.PasswordSalt = hex.EncodeToString(pwSalt)
	c.vars.Password, err = c.passwordForValidation(c.vars.PasswordSalt, args.Password)
	if err != nil {
		return nil, err
	}
	if err := c.saveVars(); err != nil {
		return nil, err
	}
	if c.vars.KeyIsBackedUp {
		_, _ = c.EnableNotifications(c.vars.EnableNotifications)
	}
	return map[string]any{
		"account": args.Email,
		"isAdmin": c.vars.IsAdmin,
		"needKey": c.vars.ESK == "",
	}, nil
}

func (c *Client) checkKey(email string, sk *stingle.SecretKey) (bool, error) {
	resp, err := c.sendRequest("v2/login/checkKey", map[string]string{
		"email": email,
	})
	if err != nil {
		return false, err
	}
	if resp.Status != "ok" {
		return false, errors.New(resp.Status)
	}
	var parts struct {
		ServerPK  string `json:"serverPK"`
		Challenge string `json:"challenge"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return false, err
	}
	c.vars.ServerPK = parts.ServerPK
	challenge, err := base64DecimalOrBase64Decode(parts.Challenge)
	if err != nil {
		return false, err
	}
	dec, err := sk.SealBoxOpen(challenge)
	if err != nil {
		return false, nil
	}
	defer wipeBytes(dec)
	return strings.HasPrefix(string(dec), "validkey_"), nil
}

func (c *Client) CreateAccount(args LoginArgs) (map[string]any, error) {
	c.setServerURL(args.Server)
	sk := stingle.MakeSecretKey()
	defer sk.Wipe()
	pk := sk.PublicKey()

	var bundleSK *stingle.SecretKey
	if args.EnableBackup {
		bundleSK = sk
	}
	bundle := c.makeKeyBundle(args.Password, pk, bundleSK)
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	hashed := c.passwordForLogin(salt, args.Password)
	isBackup := "0"
	if args.EnableBackup {
		isBackup = "1"
	}
	resp, err := c.sendRequest("v2/register/createAccount", map[string]string{
		"email":     args.Email,
		"password":  hashed,
		"salt":      strings.ToUpper(hex.EncodeToString(salt)),
		"keyBundle": bundle,
		"isBackup":  isBackup,
	})
	if err != nil {
		return nil, err
	}
	if resp.Status != "ok" {
		return nil, errors.New(resp.Status)
	}
	if err := c.setSessionKey(true); err != nil {
		return nil, err
	}
	noReset := false
	args.ResetSkey = &noReset
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)
	esk, err := c.encryptBytes(rawSK)
	if err != nil {
		return nil, err
	}
	c.vars.ESK = esk
	c.vars.PK = base64.StdEncoding.EncodeToString(pk.ToBytes())
	if err := c.saveVars(); err != nil {
		return nil, err
	}
	res, err := c.Login(args)
	if err != nil {
		return nil, err
	}
	if !args.EnableBackup && c.callbacks.OnInfo != nil {
		c.callbacks.OnInfo(T("no-key-backup-warning"))
	}
	return res, nil
}

func (c *Client) RecoverAccount(args LoginArgs) (map[string]any, error) {
	c.setServerURL(args.Server)
	skBytes, err := bip39.EntropyFromMnemonic(strings.TrimSpace(args.BackupPhrase))
	if err != nil || len(skBytes) != 32 {
		return nil, errors.New(T("incorrect-backup-phrase"))
	}
	defer wipeBytes(skBytes)
	sk := stingle.SecretKeyFromBytes(skBytes)
	defer sk.Wipe()
	pk := sk.PublicKey()

	ok, err := c.checkKey(args.Email, sk)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New(T("incorrect-backup-phrase"))
	}
	if err := c.setSessionKey(true); err != nil {
		return nil, err
	}
	noReset := false
	args.ResetSkey = &noReset
	c.vars.PK = base64.StdEncoding.EncodeToString(pk.ToBytes())
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)
	esk, err := c.encryptBytes(rawSK)
	if err != nil {
		return nil, err
	}
	c.vars.ESK = esk
	if err := c.saveVars(); err != nil {
		return nil, err
	}
	var bundleSK *stingle.SecretKey
	if args.EnableBackup {
		bundleSK = sk
	}
	bundle := c.makeKeyBundle(args.Password, pk, bundleSK)
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	hashed := c.passwordForLogin(salt, args.Password)
	isBackup := "0"
	if args.EnableBackup {
		isBackup = "1"
	}
	params, err := c.makeParams(map[string]string{
		"newPassword": hashed,
		"newSalt":     strings.ToUpper(hex.EncodeToString(salt)),
		"keyBundle":   bundle,
		"isBackup":    isBackup,
	})
	if err != nil {
		return nil, err
	}
	resp, err := c.sendRequest("v2/login/recoverAccount", map[string]string{
		"email":  args.Email,
		"params": params,
	})
	if err != nil {
		return nil, err
	}
	if resp.Status != "ok" {
		return nil, errors.New(resp.Status)
	}
	res, err := c.Login(args)
	if err != nil {
		return nil, err
	}
	if !args.EnableBackup && c.callbacks.OnInfo != nil {
		c.callbacks.OnInfo(T("no-key-backup-warning"))
	}
	return res, nil
}

func (c *Client) KeyBackupEnabled() bool {
	return c.vars.KeyIsBackedUp
}

func (c *Client) ChangeKeyBackup(password string, doBackup bool) (string, error) {
	if !c.checkPassword(password) {
		return "", errors.New(T("incorrect-password"))
	}
	pk, err := c.publicKey()
	if err != nil {
		return "", err
	}
	var sk *stingle.SecretKey
	if doBackup {
		sk, err = c.secretKey()
		if err != nil {
			return "", err
		}
		defer sk.Wipe()
	}
	params, err := c.makeParams(map[string]string{
		"keyBundle": c.makeKeyBundle(password, pk, sk),
	})
	if err != nil {
		return "", err
	}
	resp, err := c.sendRequest("v2/keys/reuploadKeys", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return "", err
	}
	if resp.Status != "ok" {
		return "", errors.New(resp.Status)
	}
	c.vars.KeyIsBackedUp = doBackup
	if err := c.saveVars(); err != nil {
		return "", err
	}
	return resp.Status, nil
}

func (c *Client) RestoreSecretKey(backupPhrase string) error {
	skBytes, err := bip39.EntropyFromMnemonic(strings.TrimSpace(backupPhrase))
	if err != nil || len(skBytes) != 32 {
		return errors.New(T("incorrect-backup-phrase"))
	}
	defer wipeBytes(skBytes)
	sk := stingle.SecretKeyFromBytes(skBytes)
	defer sk.Wipe()
	ok, err := c.checkKey(c.vars.Email, sk)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New(T("incorrect-backup-phrase"))
	}
	_, _ = c.EnableNotifications(c.vars.EnableNotifications)
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)
	esk, err := c.encryptBytes(rawSK)
	if err != nil {
		return err
	}
	c.vars.ESK = esk
	return c.saveVars()
}

func (c *Client) BackupPhrase(password string) (string, error) {
	if !c.checkPassword(password) {
		return "", errors.New(T("incorrect-password"))
	}
	sk, err := c.secretKey()
	if err != nil {
		return "", err
	}
	defer sk.Wipe()
	rawSK := sk.ToBytes()
	defer wipeBytes(rawSK)
	return bip39.NewMnemonic(rawSK)
}

type UpdateProfileArgs struct {
	Password    string `json:"password"`
	Email       string `json:"email"`
	NewPassword string `json:"newPassword"`
	SetMFA      bool   `json:"setMFA"`
	PassKey     bool   `json:"passKey"`
	SetOTP      bool   `json:"setOTP"`
	OTPKey      string `json:"otpKey"`
	OTPCode     string `json:"otpCode"`
	KeyChanges  []any  `json:"keyChanges"`
}

func (c *Client) UpdateProfile(args UpdateProfileArgs) error {
	if !c.checkPassword(args.Password) {
		return errors.New("incorrect password")
	}
	curr, err := c.MfaStatus()
	if err != nil {
		return err
	}
	currMFA, _ := curr["mfaEnabled"].(bool)
	currPassKey, _ := curr["passKey"].(bool)
	currOTP, _ := curr["otpEnabled"].(bool)

	maybeSetMFA := func() error {
		if args.SetMFA != currMFA || args.PassKey != currPassKey {
			reqMFA := "0"
			if args.SetMFA {
				reqMFA = "1"
			}
			pk := "0"
			if args.PassKey {
				pk = "1"
			}
			params, err := c.makeParams(map[string]string{
				"requireMFA": reqMFA,
				"passKey":    pk,
			})
			if err != nil {
				return err
			}
			resp, err := c.sendRequest("v2x/mfa/enable", map[string]string{
				"token":  c.token(),
				"params": params,
			})
			if err != nil || resp.Status != "ok" {
				return errors.New(T("mfa-update-failed"))
			}
		}
		return nil
	}

	if !args.SetMFA {
		if err := maybeSetMFA(); err != nil {
			return err
		}
	}
	if args.SetOTP != currOTP {
		params, err := c.makeParams(map[string]string{
			"key":  args.OTPKey,
			"code": args.OTPCode,
		})
		if err != nil {
			return err
		}
		resp, err := c.sendRequest("v2x/config/setOTP", map[string]string{
			"token":  c.token(),
			"params": params,
		})
		if err != nil || resp.Status != "ok" {
			return errors.New(T("otp-update-failed"))
		}
	}
	if c.vars.Email != args.Email {
		params, err := c.makeParams(map[string]string{
			"newEmail": args.Email,
		})
		if err != nil {
			return err
		}
		resp, err := c.sendRequest("v2/login/changeEmail", map[string]string{
			"token":  c.token(),
			"params": params,
		})
		if err != nil || resp.Status != "ok" {
			return errors.New(T("email-update-failed"))
		}
		c.vars.Email = args.Email
	}
	if args.NewPassword != "" {
		salt := make([]byte, 16)
		if _, err := io.ReadFull(rand.Reader, salt); err != nil {
			return err
		}
		pk, err := c.publicKey()
		if err != nil {
			return err
		}
		var sk *stingle.SecretKey
		if c.vars.KeyIsBackedUp {
			sk, err = c.secretKey()
			if err != nil {
				return err
			}
			defer sk.Wipe()
		}
		bundle := c.makeKeyBundle(args.NewPassword, pk, sk)
		hashed := c.passwordForLogin(salt, args.NewPassword)
		saltHex := strings.ToUpper(hex.EncodeToString(salt))
		params, err := c.makeParams(map[string]string{
			"keyBundle":   bundle,
			"newPassword": hashed,
			"newSalt":     saltHex,
		})
		if err != nil {
			return err
		}
		resp, err := c.sendRequest("v2/login/changePass", map[string]string{
			"token":  c.token(),
			"params": params,
		})
		if err != nil || resp.Status != "ok" {
			return errors.New(T("password-update-failed"))
		}
		var parts struct {
			Token string `json:"token"`
		}
		_ = json.Unmarshal(resp.Parts, &parts)
		c.vars.LoginSalt = saltHex
		if etoken, err := c.encryptString(parts.Token); err == nil {
			c.vars.EToken = etoken
		}
		salt2 := make([]byte, 16)
		_, _ = io.ReadFull(rand.Reader, salt2)
		c.vars.PasswordSalt = hex.EncodeToString(salt2)
		c.vars.Password, _ = c.passwordForValidation(c.vars.PasswordSalt, args.NewPassword)
	}
	if len(args.KeyChanges) > 0 {
		updJSON, err := json.Marshal(args.KeyChanges)
		if err != nil {
			return err
		}
		params, err := c.makeParams(map[string]string{
			"updates": string(updJSON),
		})
		if err != nil {
			return err
		}
		resp, err := c.sendRequest("v2x/config/webauthn/updateKeys", map[string]string{
			"token":  c.token(),
			"params": params,
		})
		if err != nil || resp.Status != "ok" {
			return errors.New(T("key-update-failed"))
		}
	}
	if args.SetMFA {
		if err := maybeSetMFA(); err != nil {
			return err
		}
	}
	return c.saveVars()
}

func (c *Client) ListSecurityKeys() (any, error) {
	resp, err := c.sendRequest("v2x/config/webauthn/keys", map[string]string{
		"token": c.token(),
	})
	if err != nil || resp.Status != "ok" {
		return nil, errors.New(T("list-security-keys-failed"))
	}
	var parts struct {
		Keys any `json:"keys"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	return parts.Keys, nil
}

func (c *Client) AddSecurityKey(argsVal js.Value) (any, error) {
	if !argsVal.Truthy() {
		return nil, errors.New(T("incorrect-password"))
	}
	pwVal := argsVal.Get("password")
	if !pwVal.Truthy() {
		return nil, errors.New(T("incorrect-password"))
	}
	password := pwVal.String()
	attObjVal := argsVal.Get("attestationObject")
	if attObjVal.Truthy() && !c.checkPassword(password) {
		return nil, errors.New(T("incorrect-password"))
	}
	paramsMap := make(map[string]string)
	if keyNameVal := argsVal.Get("keyName"); keyNameVal.Truthy() {
		paramsMap["keyName"] = keyNameVal.String()
		if argsVal.Get("discoverable").Bool() {
			paramsMap["discoverable"] = "1"
		} else {
			paramsMap["discoverable"] = "0"
		}
		cdBytes := jsutil.Uint8ArrayToBytes(argsVal.Get("clientDataJSON"))
		aoBytes := jsutil.Uint8ArrayToBytes(attObjVal)
		paramsMap["clientDataJSON"] = base64.RawURLEncoding.EncodeToString(cdBytes)
		paramsMap["attestationObject"] = base64.RawURLEncoding.EncodeToString(aoBytes)
		var transports []string
		_ = jsutil.FromJSValue(argsVal.Get("transports"), &transports)
		tb, _ := json.Marshal(transports)
		paramsMap["transports"] = string(tb)
	} else {
		if argsVal.Get("usePassKey").Bool() {
			paramsMap["passKey"] = "1"
		} else {
			paramsMap["passKey"] = "0"
		}
	}
	params, err := c.makeParams(paramsMap)
	if err != nil {
		return nil, err
	}
	resp, err := c.sendRequest("v2x/config/webauthn/register", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil || resp.Status != "ok" {
		return nil, errors.New(T("add-security-key-failed"))
	}
	if len(resp.Parts) == 0 || resp.Parts[0] != '{' {
		return nil, nil
	}
	var parts struct {
		AttestationOptions any `json:"attestationOptions"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	return parts.AttestationOptions, nil
}

func (c *Client) MfaStatus() (map[string]any, error) {
	resp, err := c.sendRequest("v2x/mfa/status", map[string]string{
		"token": c.token(),
	})
	if err != nil || resp.Status != "ok" {
		return nil, errors.New(T("mfa-status-failed"))
	}
	var parts map[string]any
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	return parts, nil
}

func (c *Client) MfaCheck(passKey bool) (bool, error) {
	pk := "0"
	if passKey {
		pk = "1"
	}
	params, err := c.makeParams(map[string]string{
		"passKey": pk,
	})
	if err != nil {
		return false, err
	}
	resp, err := c.sendRequest("v2x/mfa/check", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil || resp.Status != "ok" {
		return false, errors.New(T("mfa-check-failed"))
	}
	return true, nil
}

func (c *Client) GenerateOTP() (map[string]any, error) {
	resp, err := c.sendRequest("v2x/config/generateOTP", map[string]string{
		"token": c.token(),
	})
	if err != nil {
		return nil, err
	}
	if resp.Status != "ok" {
		return nil, errors.New(resp.Status)
	}
	var parts struct {
		Key string `json:"key"`
		Img string `json:"img"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	return map[string]any{
		"key": parts.Key,
		"img": parts.Img,
	}, nil
}

func (c *Client) AdminUsers(changes any) (any, error) {
	paramsMap := make(map[string]string)
	if changes != nil {
		b, err := json.Marshal(changes)
		if err != nil {
			return nil, err
		}
		paramsMap["changes"] = string(b)
	}
	params, err := c.makeParams(paramsMap)
	if err != nil {
		return nil, err
	}
	resp, err := c.sendRequest("v2x/admin/users", map[string]string{
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
		Users string `json:"users"`
	}
	if err := json.Unmarshal(resp.Parts, &parts); err != nil {
		return nil, err
	}
	enc, err := base64DecimalOrBase64Decode(parts.Users)
	if err != nil {
		return nil, err
	}
	sk, err := c.secretKey()
	if err != nil {
		return nil, err
	}
	defer sk.Wipe()
	dec, err := sk.SealBoxOpen(enc)
	if err != nil {
		return nil, err
	}
	defer wipeBytes(dec)
	var out any
	if err := json.Unmarshal(dec, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) DeleteAccount(password string) error {
	if !c.checkPassword(password) {
		return errors.New(T("incorrect-password"))
	}
	salt, err := hex.DecodeString(c.vars.LoginSalt)
	if err != nil {
		return err
	}
	params, err := c.makeParams(map[string]string{
		"password": c.passwordForLogin(salt, password),
	})
	if err != nil {
		return err
	}
	resp, err := c.sendRequest("v2/login/deleteUser", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return err
	}
	if resp.Status != "ok" {
		return errors.New(resp.Status)
	}
	c.resetDB()
	_ = c.clearVars()
	_ = c.deleteCache()
	return nil
}

func (c *Client) Logout() error {
	_, _ = c.EnableNotifications(false)
	if tok := c.token(); tok != "" {
		_, _ = c.sendRequest("v2/login/logout", map[string]string{
			"token": tok,
		})
	}
	c.resetDB()
	_ = c.clearVars()
	_ = c.deleteCache()
	return nil
}

func (c *Client) EnableNotifications(onoff bool) (bool, error) {
	swContainer := jsutil.Navigator.Get("serviceWorker")
	if !swContainer.Truthy() {
		return false, nil
	}
	reg, err := jsutil.Await(swContainer.Call("getRegistration"))
	if err != nil || !reg.Truthy() {
		return false, nil
	}
	pm := reg.Get("pushManager")
	if !pm.Truthy() || pm.Get("getSubscription").IsUndefined() {
		return false, nil
	}
	if !onoff {
		sub, err := jsutil.Await(pm.Call("getSubscription"))
		if err != nil || sub.IsNull() || sub.IsUndefined() {
			return false, nil
		}
		ep := sub.Get("endpoint").String()
		_, _ = jsutil.Await(sub.Call("unsubscribe"))
		if params, err := c.makeParams(map[string]string{"endpoint": ep}); err == nil {
			_, _ = c.sendRequest("v2x/config/push", map[string]string{
				"token":  c.token(),
				"params": params,
			})
		}
		return false, nil
	}
	sub, err := jsutil.Await(pm.Call("getSubscription"))
	if err != nil {
		return false, err
	}
	if sub.IsNull() || sub.IsUndefined() {
		resp, err := c.sendRequest("v2x/config/push", map[string]string{
			"token": c.token(),
		})
		if err != nil {
			return false, err
		}
		if resp.Status != "ok" {
			return false, errors.New(resp.Status)
		}
		var parts struct {
			ApplicationServerKey string `json:"applicationServerKey"`
		}
		_ = json.Unmarshal(resp.Parts, &parts)
		options := jsutil.NewObject(map[string]any{
			"userVisibleOnly":      true,
			"applicationServerKey": parts.ApplicationServerKey,
		})
		state, err := jsutil.Await(pm.Call("permissionState", options))
		if err != nil {
			return false, err
		}
		if state.String() != "granted" {
			return false, fmt.Errorf("permission state: %s", state.String())
		}
		sub, err = jsutil.Await(pm.Call("subscribe", options))
		if err != nil {
			return false, err
		}
	}
	authBytes := jsutil.Uint8ArrayToBytes(sub.Call("getKey", "auth"))
	p256dhBytes := jsutil.Uint8ArrayToBytes(sub.Call("getKey", "p256dh"))
	params, err := c.makeParams(map[string]string{
		"endpoint": sub.Get("endpoint").String(),
		"auth":     base64.RawURLEncoding.EncodeToString(authBytes),
		"p256dh":   base64.RawURLEncoding.EncodeToString(p256dhBytes),
	})
	if err != nil {
		return false, err
	}
	resp, err := c.sendRequest("v2x/config/push", map[string]string{
		"token":  c.token(),
		"params": params,
	})
	if err != nil {
		return false, err
	}
	if resp.Status != "ok" {
		return false, errors.New(resp.Status)
	}
	return true, nil
}
