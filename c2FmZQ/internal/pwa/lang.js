/*
 * Copyright 2021-2023 TTBT Enterprises LLC
 *
 * This file is part of c2FmZQ (https://c2FmZQ.org/).
 *
 * c2FmZQ is free software: you can redistribute it and/or modify it under the
 * terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * c2FmZQ is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * c2FmZQ. If not, see <https://www.gnu.org/licenses/>.
 */

/* jshint -W083 */
'use strict';

window.Lang = {
  supported: {
    'en': 'English',
    'ar': 'العربية',
    'es': 'Español',
    'fr': 'Français',
    'gsw': 'Schwiizerdüütsch',
    'he': 'עברית',
    'hi': 'हिन्दी',
    'id': 'Bahasa Indonesia',
    'ja': '日本語',
    'ko': '한국어',
    'pt': 'Português',
    'ru': 'Русский',
    'te': 'తెలుగు',
    'th': 'ไทย',
    'ur': 'اردو',
    'vi': 'Tiếng Việt',
    'zh': '中文'
  },

  init: async () => {
    await Lang.loadLanguage('en');

    let preferredLang = 'en';
    for (let lang of navigator.languages) {
      if (Lang.supported[lang]) {
        preferredLang = lang;
        break;
      }
      const baseLang = lang.split('-')[0];
      if (Lang.supported[baseLang]) {
        preferredLang = baseLang;
        break;
      }
    }

    if (window.localStorage) {
      const saved = window.localStorage.getItem('lang');
      if (saved && Lang.supported[saved]) {
        preferredLang = saved;
      }
    }

    await Lang.setLanguage(preferredLang);
  },

  setLanguage: async (lang) => {
    if (!Lang.supported[lang]) {
      console.error(`Language ${lang} is not supported.`);
      lang = 'en';
    }

    await Lang.loadLanguage(lang);
    const baseLang = lang.split('-')[0];
    if (baseLang !== lang) {
      await Lang.loadLanguage(baseLang);
    }

    Lang.current = lang;
    if (window.localStorage) {
      window.localStorage.setItem('lang', lang);
    }

    if (Lang.dict[lang]) {
      document.documentElement.lang = lang;
      document.documentElement.dir = Lang.dict[lang].direction || 'ltr';
    }
  },

  loadLanguage: async (lang) => {
    if (Lang.dict[lang] || !Lang.supported[lang]) {
      return;
    }
    try {
      const response = await fetch(`lang/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load language file: ${lang}`);
      }
      Lang.dict[lang] = await response.json();
    } catch (error) {
      console.error(error);
      delete Lang.supported[lang];
    }
  },

  current: 'en',

  languages: () => {
    return Lang.supported;
  },

  text: (key, ...args) => {
    if (Lang.dict[Lang.current] && Lang.dict[Lang.current][key] !== undefined) {
      return Lang.sub(Lang.dict[Lang.current][key], args);
    }

    const lang = Lang.current.split('-')[0];
    if (Lang.dict[lang] && Lang.dict[lang][key] !== undefined) {
      return Lang.sub(Lang.dict[lang][key], args);
    }

    if (Lang.dict.en && Lang.dict.en[key] !== undefined) {
      return Lang.sub(Lang.dict.en[key], args);
    }

    console.log('Missing lang key', Lang.current, key);
    return `::${key}:${args.join(' ')}::`;
  },

  sub: (s, args) => {
    for (let i = 0; i < args.length; i++) {
      s = s.replace(`$${i+1}`, args[i]);
    }
    return s;
  },

  dict: {},
};