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

package server

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"c2FmZQ/internal/database"
	"c2FmZQ/internal/log"
)

// The return value of receiveUpload.
type upload struct {
	database.FileSpec
	token   string
	name    string
	set     string
	albumID string
}

func (u *upload) cleanup() {
	if u.FileSpec.StoreFile != "" {
		if err := os.Remove(u.FileSpec.StoreFile); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Errorf("os.Remove(%q): %v", u.FileSpec.StoreFile, err)
		}
		u.FileSpec.StoreFile = ""
	}
	if u.FileSpec.StoreThumb != "" {
		if err := os.Remove(u.FileSpec.StoreThumb); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Errorf("os.Remove(%q): %v", u.FileSpec.StoreThumb, err)
		}
		u.FileSpec.StoreThumb = ""
	}
}

// receiveUpload processes a multipart/form-data.
func (s *Server) receiveUpload(dir string, req *http.Request) (*upload, error) {
	ctx := req.Context()
	mr, err := req.MultipartReader()
	if err != nil {
		return nil, err
	}
	var upload upload

	for {
		s.setDeadline(ctx, time.Now().Add(10*time.Minute))
		p, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			upload.cleanup()
			return nil, err
		}
		if p.FileName() != "" {
			switch p.FormName() {
			case "file":
				if upload.FileSpec.StoreFile != "" {
					p.Close()
					upload.cleanup()
					return nil, errors.New("duplicate file part")
				}
			case "thumb":
				if upload.FileSpec.StoreThumb != "" {
					p.Close()
					upload.cleanup()
					return nil, errors.New("duplicate thumb part")
				}
			default:
				p.Close()
				upload.cleanup()
				return nil, fmt.Errorf("unexpected file part: %q", p.FormName())
			}
			f, name, err := s.db.TempFile(dir)
			if err != nil {
				p.Close()
				upload.cleanup()
				return nil, err
			}
			size, err := s.copyWithCtx(ctx, f, p)
			closeErr := f.Close()
			pCloseErr := p.Close()
			if err != nil {
				if err := os.Remove(name); err != nil {
					log.Errorf("os.Remove(%q): %v", name, err)
				}
				upload.cleanup()
				return nil, err
			}

			upload.name = p.FileName()
			if p.FormName() == "file" {
				upload.FileSpec.StoreFile = name
				upload.FileSpec.StoreFileSize = size
			} else if p.FormName() == "thumb" {
				upload.FileSpec.StoreThumb = name
				upload.FileSpec.StoreThumbSize = size
			}

			if closeErr != nil {
				upload.cleanup()
				return nil, closeErr
			}
			if pCloseErr != nil {
				upload.cleanup()
				return nil, pCloseErr
			}
		} else {
			buf := make([]byte, 2048)
			sz, err := io.ReadFull(p, buf)
			p.Close()
			if err != io.ErrUnexpectedEOF && err != io.EOF {
				upload.cleanup()
				return nil, fmt.Errorf("received input is more than 2KB in size: sz=%d,%q=%q", sz, p.FormName(), string(buf[:sz]))
			}
			slurp := string(buf[:sz])

			switch p.FormName() {
			case "headers":
				upload.FileSpec.Headers = slurp
			case "set":
				upload.set = slurp
			case "dateCreated":
				if upload.FileSpec.DateCreated, err = strconv.ParseInt(slurp, 10, 64); err != nil {
					upload.cleanup()
					return nil, err
				}
			case "albumId":
				upload.albumID = slurp
			case "dateModified":
				if upload.FileSpec.DateModified, err = strconv.ParseInt(slurp, 10, 64); err != nil {
					upload.cleanup()
					return nil, err
				}
			case "version":
				upload.FileSpec.Version = slurp
			case "token":
				upload.token = slurp
			default:
				log.Errorf("receiveUpload: unexpected form input: %q=%q", p.FormName(), slurp)
			}
		}
	}

	if upload.FileSpec.StoreFile == "" || upload.FileSpec.StoreThumb == "" {
		upload.cleanup()
		return nil, errors.New("missing file or thumb part")
	}

	return &upload, nil
}
