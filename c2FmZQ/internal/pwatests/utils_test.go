//
// Copyright 2021-2023 TTBT Enterprises LLC
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

//go:build chromedp
// +build chromedp

package pwa_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/c2FmZQ/storage"
	"github.com/c2FmZQ/storage/crypto"
	"github.com/chromedp/cdproto/webauthn"
	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/remote"

	"c2FmZQ/internal/client"
	"c2FmZQ/internal/database"
	"c2FmZQ/internal/log"
	"c2FmZQ/internal/server"
)

var (
	tlsOnce sync.Once
	tlsCert tls.Certificate
)

func initTLS(t *testing.T) {
	t.Helper()
	tlsOnce.Do(func() {
		caPriv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			t.Fatalf("ecdsa.GenerateKey(CA): %v", err)
		}
		caTemplate := x509.Certificate{
			SerialNumber:          big.NewInt(1),
			Subject:               pkix.Name{CommonName: "Test CA"},
			NotBefore:             time.Now().Add(-time.Hour),
			NotAfter:              time.Now().Add(24 * time.Hour),
			KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
			ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
			BasicConstraintsValid: true,
			IsCA:                  true,
		}
		caDER, err := x509.CreateCertificate(rand.Reader, &caTemplate, &caTemplate, &caPriv.PublicKey, caPriv)
		if err != nil {
			t.Fatalf("x509.CreateCertificate(CA): %v", err)
		}
		caCert, err := x509.ParseCertificate(caDER)
		if err != nil {
			t.Fatalf("x509.ParseCertificate(CA): %v", err)
		}
		caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})
		if err := os.WriteFile("/etc/pki/tls/certs/ca.pem", caPEM, 0o644); err != nil {
			t.Fatalf("WriteFile(/etc/pki/tls/certs/ca.pem): %v", err)
		}

		srvPriv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			t.Fatalf("ecdsa.GenerateKey(Server): %v", err)
		}
		srvTemplate := x509.Certificate{
			SerialNumber: big.NewInt(2),
			Subject:      pkix.Name{CommonName: "devtest.local"},
			NotBefore:    time.Now().Add(-time.Hour),
			NotAfter:     time.Now().Add(24 * time.Hour),
			KeyUsage:     x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
			ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
			DNSNames:     []string{"devtest", "devtest.local"},
		}
		srvDER, err := x509.CreateCertificate(rand.Reader, &srvTemplate, caCert, &srvPriv.PublicKey, caPriv)
		if err != nil {
			t.Fatalf("x509.CreateCertificate(Server): %v", err)
		}
		srvCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srvDER})
		srvKeyBytes, err := x509.MarshalECPrivateKey(srvPriv)
		if err != nil {
			t.Fatalf("x509.MarshalECPrivateKey: %v", err)
		}
		srvKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: srvKeyBytes})
		tlsCert, err = tls.X509KeyPair(srvCertPEM, srvKeyPEM)
		if err != nil {
			t.Fatalf("tls.X509KeyPair: %v", err)
		}
	})
}

func startServer(t *testing.T) (*wrapper, func()) {
	initTLS(t)
	testdir := t.TempDir()
	log.Record = t.Log
	log.Level = 3
	db := database.New(filepath.Join(testdir, "data"), []byte("secret"))
	s := server.New(db, "", "", "")
	s.AllowCreateAccount = true
	s.AutoApproveNewAccounts = true
	s.EnableWebApp = true
	l, err := net.Listen("tcp", "devtest.local:0")
	if err != nil {
		t.Fatalf("net.Listen failed: %v", err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l = tls.NewListener(l, &tls.Config{
		Certificates: []tls.Certificate{tlsCert},
		MinVersion:   tls.VersionTLS12,
	})
	url := fmt.Sprintf("https://devtest.local:%d/", port)
	s.BaseURL = url
	go s.RunWithListener(l)
	t.Logf("Server running on %s", url)
	wd := newBrowser(t, url)
	if err := chromedp.Do(wd.ctx,
		chromedp.EmulateViewport(1000, 800),
		chromedp.Navigate(url+"?tests"),
	); err != nil {
		t.Fatalf("chromedp initial navigate: %v", err)
	}
	return wd, func() {
		log.Record = nil
		wd.sleep(time.Second)
		wd.Quit()
		s.Shutdown()
		db.Wipe()
	}
}

func newClient(t *testing.T) *client.Client {
	dir := t.TempDir()
	masterKey, err := crypto.CreateAESMasterKeyForTest()
	if err != nil {
		t.Fatalf("crypto.CreateAESMasterKeyForTest: %v", err)
	}
	storage := storage.New(dir, masterKey)
	c, err := client.Create(masterKey, storage)
	if err != nil {
		t.Fatalf("client.Create: %v", err)
	}
	return c
}

func newBrowser(t *testing.T, url string) *wrapper {
	allocCtx, allocCancel := remote.NewAllocator(t.Context(), "ws://chrome:9222")
	ctx, cancel := chromedp.NewContext(allocCtx,
		chromedp.WithErrorf(t.Logf),
		chromedp.WithLogf(t.Logf),
	)
	w := &wrapper{
		t:           t,
		ctx:         ctx,
		cancel:      cancel,
		allocCancel: allocCancel,
		serverURL:   url,
	}
	console := chromedp.Console(ctx)
	w.eventWG.Add(1)
	go func() {
		defer w.eventWG.Done()
		for m, err := range console {
			if err != nil {
				return
			}
			msg := strings.Replace(m.Text, url, "", 1)
			t.Logf("browser.%.4s: %s", strings.ToUpper(string(m.Type)), msg)
		}
	}()
	return w
}

type wrapper struct {
	t               *testing.T
	ctx             context.Context
	cancel          context.CancelFunc
	allocCancel     context.CancelFunc
	eventWG         sync.WaitGroup
	serverURL       string
	authenticatorID webauthn.AuthenticatorID
}

func (w *wrapper) Quit() {
	w.cancel()
	w.allocCancel()
	w.eventWG.Wait()
}

func (w *wrapper) ServerURL() string {
	return w.serverURL
}

func (w *wrapper) enableWebauthn() error {
	if _, err := chromedp.Call(w.ctx, webauthn.Enable, webauthn.EnableParams{EnableUI: new(false)}); err != nil {
		return err
	}
	res, err := chromedp.Call(w.ctx, webauthn.AddVirtualAuthenticator, webauthn.AddVirtualAuthenticatorParams{
		Options: &webauthn.VirtualAuthenticatorOptions{
			Protocol:                    webauthn.AuthenticatorProtocolCtap2,
			Ctap2version:                webauthn.Ctap2versionCtap21,
			Transport:                   webauthn.AuthenticatorTransportInternal,
			HasResidentKey:              true,
			HasUserVerification:         true,
			AutomaticPresenceSimulation: true,
			IsUserVerified:              true,
		},
	})
	if err != nil {
		return err
	}
	w.authenticatorID = res.AuthenticatorID
	log.Infof("Authenticator ID: %s", w.authenticatorID)
	return nil
}

func (w *wrapper) disableWebauthn() error {
	if _, err := chromedp.Call(w.ctx, webauthn.RemoveVirtualAuthenticator, webauthn.RemoveVirtualAuthenticatorParams{
		AuthenticatorID: w.authenticatorID,
	}); err != nil {
		return err
	}
	log.Infof("disableWebauthn: %s", w.authenticatorID)
	return nil
}

func (w *wrapper) currentURL() string {
	u, err := chromedp.Run(w.ctx, chromedp.Location())
	if err != nil {
		w.t.Fatalf("currentURL: %v", err)
	}
	return u
}

func (w *wrapper) navigate(u string) {
	if err := chromedp.Do(w.ctx, chromedp.Navigate(u)); err != nil {
		w.t.Fatalf("navigate(%q): %v", u, err)
	}
}

func (w *wrapper) waitFor(sel string) {
	w.t.Logf("Waiting for %s", sel)
	expr := fmt.Sprintf(`(function() {
		const el = document.querySelector(%q);
		if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
		return el;
	})()`, sel)
	delay := time.Minute
	for try := 0; try <= 5; try++ {
		ctx, cancel := context.WithTimeout(w.ctx, delay)
		err := chromedp.Do(ctx, chromedp.WaitVisible(chromedp.JSPath(expr)))
		cancel()
		if err != nil {
			w.t.Logf("waitFor(%q): %v", sel, err)
			w.sleep(time.Second)
			delay = 10 * time.Second
			continue
		}
		return
	}
	w.t.Fatalf("waitFor(%q): failed too many times", sel)
}

func (w *wrapper) waitGone(sel string) {
	ctx, cancel := context.WithTimeout(w.ctx, 2*time.Minute)
	defer cancel()
	if err := chromedp.Do(ctx, chromedp.WaitNotPresent(chromedp.CSS(sel))); err != nil {
		w.t.Fatalf("waitGone(%q): %v", sel, err)
	}
}

func (w *wrapper) sendKeys(sel, keys string) {
	w.sleep(250 * time.Millisecond)
	for try := 0; try <= 5; try++ {
		w.waitFor(sel)
		ctx, cancel := context.WithTimeout(w.ctx, 10*time.Second)
		err := chromedp.Do(ctx, chromedp.SendKeys(chromedp.CSS(sel), keys))
		cancel()
		if err != nil {
			w.t.Logf("%s: %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		return
	}
	w.t.Fatalf("%s: failed too many times", sel)
}

func (w *wrapper) waitUnobscured(sel string) error {
	expr := fmt.Sprintf(`(function() {
		const el = document.querySelector(%q);
		if (!el) return false;
		for (let p = el; p; p = p.parentElement) {
			if (p.getAnimations().some(a => a instanceof CSSAnimation)) return false;
		}
		el.scrollIntoViewIfNeeded();
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return false;
		const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return top !== null && (el === top || el.contains(top));
	})()`, sel)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(w.ctx, 5*time.Second)
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](expr))
		cancel()
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		w.sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("element %q is obscured", sel)
}

func (w *wrapper) click(sel string) {
	w.sleep(250 * time.Millisecond)
	for try := 0; try <= 5; try++ {
		w.waitFor(sel)
		if err := w.waitUnobscured(sel); err != nil {
			w.t.Logf("%s: %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		ctx, cancel := context.WithTimeout(w.ctx, 10*time.Second)
		err := chromedp.Do(ctx, chromedp.Click(chromedp.CSS(sel)))
		cancel()
		if err != nil {
			w.t.Logf("%s: %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		return
	}
	w.t.Fatalf("%s: failed too many times", sel)
}

func (w *wrapper) rightClick(sel string) {
	w.sleep(250 * time.Millisecond)
	for try := 0; try <= 5; try++ {
		w.waitFor(sel)
		if err := w.waitUnobscured(sel); err != nil {
			w.t.Logf("rightClick(%s): %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		ctx, cancel := context.WithTimeout(w.ctx, 10*time.Second)
		_, err := chromedp.Run(ctx, chromedp.QueryAfter(chromedp.CSS(sel), func(ctx context.Context, t *chromedp.Target, nodes []*chromedp.Node) (chromedp.Void, error) {
			if len(nodes) == 0 {
				return chromedp.Void{}, fmt.Errorf("no nodes for %s", sel)
			}
			return chromedp.MouseClickNode(nodes[0], chromedp.ButtonRight)(ctx, t)
		}, chromedp.NodeVisible))
		cancel()
		if err != nil {
			w.t.Logf("rightClick(%s): %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		return
	}
	w.t.Fatalf("rightClick(%s): failed too many times", sel)
}

func (w *wrapper) clear(sel string) {
	w.sleep(250 * time.Millisecond)
	expr := fmt.Sprintf(`(function() {
		const el = document.querySelector(%q);
		if (!el) return false;
		el.value = '';
		el.dispatchEvent(new Event('input', {bubbles: true}));
		el.dispatchEvent(new Event('change', {bubbles: true}));
		el.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true}));
		return true;
	})()`, sel)
	for try := 0; try <= 5; try++ {
		w.waitFor(sel)
		ctx, cancel := context.WithTimeout(w.ctx, 10*time.Second)
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](expr))
		cancel()
		if err != nil || !ok {
			w.t.Logf("%s: %v", sel, err)
			w.sleep(time.Second)
			continue
		}
		return
	}
	w.t.Fatalf("%s: failed too many times", sel)
}

func (w *wrapper) text(sel string) string {
	w.waitFor(sel)
	ctx, cancel := context.WithTimeout(w.ctx, 10*time.Second)
	defer cancel()
	v, err := chromedp.Run(ctx, chromedp.Text(chromedp.CSS(sel), chromedp.NodeVisible))
	if err != nil {
		w.t.Fatalf("text(%q): %v", sel, err)
	}
	return v
}

func (w *wrapper) waitNonEmptyText(sel string) string {
	w.waitFor(sel)
	deadline := time.Now().Add(time.Minute)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(w.ctx, 5*time.Second)
		v, err := chromedp.Run(ctx, chromedp.Text(chromedp.CSS(sel), chromedp.NodeVisible))
		cancel()
		if err == nil && v != "" {
			return v
		}
		w.sleep(100 * time.Millisecond)
	}
	w.t.Fatalf("waitNonEmptyText(%q): timed out", sel)
	return ""
}

func (w *wrapper) waitPopupMessage(messages ...string) {
	want := make(map[string]bool)
	for _, m := range messages {
		want[m] = true
	}
	deadline := time.Now().Add(time.Minute)
	matched := false
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(w.ctx, 5*time.Second)
		got, err := chromedp.Run(ctx, chromedp.Evaluate[[]string](`Array.from(document.querySelectorAll('.popup-message')).map(e => e.innerText.trim())`))
		cancel()
		if err == nil && len(got) == len(want) {
			allMatch := true
			for _, t := range got {
				if !want[t] {
					allMatch = false
					break
				}
			}
			if allMatch {
				matched = true
				break
			}
		}
		w.sleep(100 * time.Millisecond)
	}
	if !matched {
		w.t.Fatalf("waitPopupMessage(%v): timed out", messages)
	}
	w.waitGone(".popup-message")
}

func (w *wrapper) waitText(sel, value string) {
	deadline := time.Now().Add(time.Minute)
	expr := fmt.Sprintf(`Array.from(document.querySelectorAll(%q)).map(e => e.innerText.trim())`, sel)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(w.ctx, 5*time.Second)
		got, err := chromedp.Run(ctx, chromedp.Evaluate[[]string](expr))
		cancel()
		if err == nil && slices.Contains(got, value) {
			return
		}
		w.sleep(100 * time.Millisecond)
	}
	w.t.Fatalf("waitText(%q, %q): timed out", sel, value)
}

func (w *wrapper) sleep(d time.Duration) {
	time.Sleep(d)
}

func (w *wrapper) setPassphrase(pp string) {
	w.t.Log("Setting passphrase")
	w.sendKeys("#passphrase-input", pp+"\n")
	w.sendKeys("#passphrase-input2", pp+"\n")
}

func (w *wrapper) createAccount(email, pass string) {
	w.t.Log("Creating new account")
	w.click("#register-tab")
	w.sendKeys("#email-input", email)
	w.sendKeys("#password-input", pass)
	w.sendKeys("#password-input2", pass)
	w.click("#login-button")
	w.waitFor("#gallery")
}

func (w *wrapper) logout() {
	w.t.Log("Logging out")
	w.click("#account-button")
	w.click("#account-menu-logout")
	w.sleep(2 * time.Second)
}
