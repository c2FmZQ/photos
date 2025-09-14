# Language and Translations

This directory contains the language files for the application. These files are used to provide internationalization (i18n) for the user interface.

## File Structure

The language files are organized as follows:

-   `en.json`: The base English translation file. This file must contain all the keys used in the application. It serves as the single source of truth.
-   `<lang>.json`: Each supported language has its own JSON file, named with the two-letter language code (e.g., `fr.json`, `de.json`). These files must contain all the keys present in `en.json`.
-   `<lang>-<REGION>.json`: Regional variations of a language are also supported (e.g., `fr-CA.json`, `de-AT.json`). These files should **only** contain the keys that have a different translation than their base language file. For example, `fr-CA.json` would only contain the keys where the Canadian French translation differs from the standard French translation in `fr.json`.

### `filerobot` Subdirectory

The `filerobot` subdirectory contains translations for the Filerobot image editor. The structure of this directory is different from the main language directory.

-   Each file in the `filerobot` directory must contain all the same keys.
-   The English text in `filerobot/en.json` should be used as the reference for all other translations.

## Maintaining Translations

### Adding a New Key

1.  **Add the key to `en.json`:** Add the new key and its English translation to the `en.json` file.
2.  **Add the key to all other base language files:** Add the new key and its proper translation to all other base language files (e.g., `fr.json`, `de.json`, `es.json`). It is important to add the correct translation immediately. Do not use the English text as a placeholder. If a translation is not available, the key should not be added to the other files.
3.  **Update regional files (if necessary):** If the translation for the new key is different in a regional dialect (e.g., Austrian German, Swiss High German), add the key and its specific translation to the corresponding regional file (e.g., `de-AT.json`, `de-CH.json`).

### Adding a New Language

1.  **Create a new base language file:** Create a new JSON file for the language (e.g., `it.json`). Copy the contents of `en.json` into the new file and translate the values.
2.  **Create a `filerobot` translation file:** Create a corresponding translation file in the `filerobot` directory (e.g., `filerobot/it.json`). Translate the keys from `filerobot/en.json`.
3.  **Add the language to `lang.js`:** Add the new language to the `Lang.supported` list in `c2FmZQ/internal/pwa/lang.js`.
4.  **Create regional variations (optional):** If you need to add regional variations, create the corresponding files (e.g., `it-CH.json`) and add only the keys that have different translations from the base language file.

**Important:** Always use the English text in `en.json` and `filerobot/en.json` as the source of truth for all translations. This will ensure consistency across all languages.
