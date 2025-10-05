import os

langs = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'de-AT', 'de-CH', 'el', 'en-AU', 'en-CA', 'en-UK', 'es', 'es-AR', 'es-ES', 'es-MX', 'fa', 'fi', 'fr', 'fr-BE', 'fr-CA', 'fr-CH', 'gsw', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'mr', 'ms', 'nl', 'nl-BE', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sv', 'te', 'th', 'tl', 'tr', 'ug', 'uk', 'ur', 'vi', 'zh-CN', 'zh-TW']

base_dir = "c2FmZQ/internal/pwa/lang/filerobot/"
en_file_path = os.path.join(base_dir, "en.json")

try:
    with open(en_file_path, "r", encoding="utf-8") as f:
        en_content = f.read()

    for lang in langs:
        lang_file_path = os.path.join(base_dir, f"{lang}.json")
        with open(lang_file_path, "w", encoding="utf-8") as f:
            f.write(en_content)

    print("Created placeholder translation files.")
except FileNotFoundError:
    print(f"Error: Could not find the base translation file at {en_file_path}")
    print(f"Current directory: {os.getcwd()}")
    exit(1)
except Exception as e:
    print(f"An error occurred: {e}")
    exit(1)