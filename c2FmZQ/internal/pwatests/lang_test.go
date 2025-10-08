package pwa_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLangFiles validates all the language JSON files in internal/pwa/lang.
// It checks for two things:
// 1. That every .json file is a valid JSON.
// 2. That every .json file contains all the keys present in the base en.json file.
func TestLangFiles(t *testing.T) {
	langDir := "../pwa/lang"

	// First, read en.json to get the base set of keys.
	enPath := filepath.Join(langDir, "en.json")
	enBytes, err := os.ReadFile(enPath)
	if err != nil {
		t.Fatalf("Failed to read en.json: %v", err)
	}

	var enMap map[string]interface{}
	if err := json.Unmarshal(enBytes, &enMap); err != nil {
		t.Fatalf("en.json is not a valid JSON: %v", err)
	}

	// Walk through the directory and test each .json file.
	err = filepath.Walk(langDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// We only care about .json files, and ignore directories.
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".json") {
			return nil
		}

		// We can skip regional variations, as they inherit from the base language.
		// Base languages have short names like "en.json", "fr.json".
		// Regional variations have names like "en-AU.json", "fr-CA.json".
		if strings.Contains(info.Name(), "-") {
			return nil
		}
		// gsw is a regional variation of de
		if info.Name() == "gsw.json" {
			return nil
		}

		t.Run(info.Name(), func(t *testing.T) {
			fileBytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("Failed to read %s: %v", path, err)
			}

			// 1. Check if the file is valid JSON.
			var langMap map[string]interface{}
			if err := json.Unmarshal(fileBytes, &langMap); err != nil {
				t.Fatalf("%s is not a valid JSON: %v", info.Name(), err)
			}

			// 2. Check if all keys from en.json are present.
			for key := range enMap {
				if _, ok := langMap[key]; !ok {
					t.Errorf("Missing key '%s' in %s", key, info.Name())
				}
			}
		})

		return nil
	})

	if err != nil {
		t.Fatalf("Error walking through lang directory: %v", err)
	}
}