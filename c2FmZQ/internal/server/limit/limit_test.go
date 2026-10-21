//
// Copyright 2021-2022 TTBT Enterprises LLC
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

package limit_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"c2FmZQ/internal/server/limit"
)

func TestTicket(t *testing.T) {
	l := limit.New(1, nil)

	var ch []<-chan struct{}
	for i := 0; i < 5; i++ {
		c, err := l.Ticket()
		if err != nil {
			t.Fatalf("Ticket failed: %v", err)
		}
		ch = append(ch, c)
	}

	var exp [5]bool
	for i := 0; i < 5; i++ {
		exp[i] = true
		t.Logf("Loop %d - Exp %v", i, exp)
		for j := range ch {
			if got, want := ready(ch[j]), exp[j]; got != want {
				t.Errorf("%d: ready(ch[%d]) Got %v, want %v", i, j, got, want)
			}
		}
		l.Done()
	}
}

func ready(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

func TestSecurityConnLimiterCancel(t *testing.T) {
	started := make(chan struct{})
	block := make(chan struct{})
	var first bool
	l := limit.New(1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !first {
			first = true
			close(started)
			<-block
		}
		w.WriteHeader(http.StatusOK)
	}))

	// Start first request that occupies the single slot.
	done1 := make(chan struct{})
	go func() {
		defer close(done1)
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		l.ServeHTTP(w, req)
	}()

	// Wait until req1 holds the ticket, then start req2 with a canceled context.
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req2 := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
	w2 := httptest.NewRecorder()
	l.ServeHTTP(w2, req2)

	// Unblock req1 and verify a subsequent req3 succeeds without deadlocking (SEC-18).
	close(block)
	<-done1

	req3 := httptest.NewRequest("GET", "/", nil)
	w3 := httptest.NewRecorder()
	l.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("Expected status 200 for req3, got %d", w3.Code)
	}
}
