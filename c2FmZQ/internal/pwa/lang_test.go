package pwa

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
				isRegional := strings.Contains(info.Name(), "-")

				// For non-regional files, all keys from en.json must be present.
				if !isRegional {
					for key := range enMap {
						if _, ok := langMap[key]; !ok {
							t.Errorf("Missing key '%s' in %s", key, info.Name())
						}
					}
				}

				// All files should not have keys that are not in en.json.
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