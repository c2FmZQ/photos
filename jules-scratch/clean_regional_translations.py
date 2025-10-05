import json
import os

def clean_regional_files():
    lang_dir = "c2FmZQ/internal/pwa/lang/"
    regional_variants = {
        'de': ['de-AT', 'de-CH'],
        'en': ['en-AU', 'en-CA', 'en-UK'],
        'es': ['es-AR', 'es-ES', 'es-MX'],
        'fr': ['fr-BE', 'fr-CA', 'fr-CH'],
        'nl': ['nl-BE']
    }

    for base_lang, variants in regional_variants.items():
        base_file_path = os.path.join(lang_dir, f"{base_lang}.json")
        try:
            with open(base_file_path, 'r', encoding='utf-8') as f:
                base_translations = json.load(f)
        except FileNotFoundError:
            print(f"Base language file not found for {base_lang}, skipping variants.")
            continue

        for variant_code in variants:
            variant_file_path = os.path.join(lang_dir, f"{variant_code}.json")
            try:
                with open(variant_file_path, 'r', encoding='utf-8') as f:
                    variant_translations = json.load(f)

                new_variant_translations = {
                    "LANG": variant_translations.get("LANG", ""),
                    "direction": variant_translations.get("direction", "ltr")
                }

                for key, value in variant_translations.items():
                    if key not in ["LANG", "direction"]:
                        if key not in base_translations or base_translations[key] != value:
                            new_variant_translations[key] = value

                with open(variant_file_path, 'w', encoding='utf-8') as f:
                    json.dump(new_variant_translations, f, ensure_ascii=False, indent=2)

                print(f"Cleaned up {variant_file_path}")

            except FileNotFoundError:
                print(f"Variant file not found: {variant_file_path}, skipping.")
            except json.JSONDecodeError:
                print(f"Error decoding JSON from {variant_file_path}, skipping.")

if __name__ == "__main__":
    clean_regional_files()