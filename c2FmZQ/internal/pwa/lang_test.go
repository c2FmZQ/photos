package pwa

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

var (
	placeholderRE = regexp.MustCompile(`\$\d+`)
	htmlTagRE     = regexp.MustCompile(`</?[a-zA-Z0-9]+>`)
)

// TestLangFiles validates all the language JSON files according to the rules
// specified in the lang/README.md file.
func TestLangFiles(t *testing.T) {
	t.Run("PWA_Translations", func(t *testing.T) {
		baseDir := "lang"
		englishFile := filepath.Join(baseDir, "en.json")
		enMap := readAndUnmarshal(t, englishFile)

		err := filepath.Walk(baseDir, func(path string, info fs.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				if info.Name() == "filerobot" {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(info.Name(), ".json") || path == englishFile {
				return nil
			}

			// For PWA translations, all non-regional language files must contain all keys
			// from en.json. Regional files (e.g., 'en-AU') only need to contain keys that
			// differ from their base language. No file should contain keys that are not
			// present in en.json.
			t.Run(info.Name(), func(t *testing.T) {
				langMap := readAndUnmarshal(t, path)
				langCode := strings.TrimSuffix(info.Name(), ".json")
				baseLang := strings.Split(langCode, "-")[0]
				baseFile := filepath.Join(baseDir, baseLang+".json")
				_, baseErr := os.Stat(baseFile)
				isRegional := strings.Contains(langCode, "-") && baseErr == nil

				// For non-regional files, all keys from en.json must be present.
				if !isRegional {
					for key := range enMap {
						if _, ok := langMap[key]; !ok {
							t.Errorf("Missing key '%s' in %s", key, info.Name())
						}
					}
				} else {
					baseMap := readAndUnmarshal(t, baseFile)
					for key, val := range langMap {
						if key == "direction" {
							continue
						}
						if baseVal, ok := baseMap[key]; ok && baseVal == val {
							t.Errorf("Key '%s' in regional file %s has the same value as in %s.json", key, info.Name(), baseLang)
						}
					}
				}

				// All files should not have keys that are not in en.json, and
				// placeholders / HTML tags must match en.json.
				for key, val := range langMap {
					enVal, ok := enMap[key]
					if !ok {
						t.Errorf("Key '%s' in %s does not exist in en.json", key, info.Name())
						continue
					}
					valStr, ok1 := val.(string)
					enStr, ok2 := enVal.(string)
					if ok1 && ok2 {
						if !reflect.DeepEqual(placeholderRE.FindAllString(enStr, -1), placeholderRE.FindAllString(valStr, -1)) {
							t.Errorf("Placeholder mismatch for key '%s' in %s: got %q, want placeholders from %q", key, info.Name(), valStr, enStr)
						}
						if !reflect.DeepEqual(htmlTagRE.FindAllString(enStr, -1), htmlTagRE.FindAllString(valStr, -1)) {
							t.Errorf("HTML tag mismatch for key '%s' in %s: got %q, want tags from %q", key, info.Name(), valStr, enStr)
						}
					}
				}
			})
			return nil
		})
		if err != nil {
			t.Fatalf("Error walking through directory %s: %v", baseDir, err)
		}
	})

	t.Run("Filerobot_Translations", func(t *testing.T) {
		baseDir := "lang/filerobot"
		englishFile := filepath.Join(baseDir, "en.json")
		enMap := readAndUnmarshal(t, englishFile)

		err := filepath.Walk(baseDir, func(path string, info fs.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() || !strings.HasSuffix(info.Name(), ".json") || path == englishFile {
				return nil
			}

			// For Filerobot translations, all files must contain all keys from en.json.
			t.Run(info.Name(), func(t *testing.T) {
				langMap := readAndUnmarshal(t, path)
				for key := range enMap {
					if _, ok := langMap[key]; !ok {
						t.Errorf("Missing key '%s' in %s", key, info.Name())
					}
				}
				for key := range langMap {
					if _, ok := enMap[key]; !ok {
						t.Errorf("Key '%s' in %s does not exist in en.json", key, info.Name())
					}
				}
			})
			return nil
		})
		if err != nil {
			t.Fatalf("Error walking through directory %s: %v", baseDir, err)
		}
	})
}

// readAndUnmarshal is a helper function to read and unmarshal a JSON file.
func readAndUnmarshal(t *testing.T, filePath string) map[string]interface{} {
	t.Helper()
	fileBytes, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("Failed to read file %s: %v", filePath, err)
	}

	var data map[string]interface{}
	if err := json.Unmarshal(fileBytes, &data); err != nil {
		t.Fatalf("%s is not a valid JSON: %v", filePath, err)
	}
	return data
}
