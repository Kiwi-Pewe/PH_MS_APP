// ==================================================================
// language-time.js - Locale and clock format. English is the only
// shipped language. Time format hits formatClusterTime in util.js.
// ==================================================================

const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English, US", flag: "\u{1F1FA}\u{1F1F8}" },
  { value: "en-GB", label: "English, UK", flag: "\u{1F1EC}\u{1F1E7}" },
  { value: "es-ES", label: "Espa\u00f1ol", flag: "\u{1F1EA}\u{1F1F8}" },
  { value: "es-419", label: "Espa\u00f1ol, LATAM", flag: "\u{1F1F2}\u{1F1FD}" },
  { value: "fr", label: "Fran\u00e7ais", flag: "\u{1F1EB}\u{1F1F7}" },
  { value: "de", label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { value: "it", label: "Italiano", flag: "\u{1F1EE}\u{1F1F9}" },
  { value: "pt-BR", label: "Portugu\u00eas do Brasil", flag: "\u{1F1E7}\u{1F1F7}" },
  { value: "nl", label: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}" },
  { value: "pl", label: "Polski", flag: "\u{1F1F5}\u{1F1F1}" },
  { value: "sv-SE", label: "Svenska", flag: "\u{1F1F8}\u{1F1EA}" },
  { value: "da", label: "Dansk", flag: "\u{1F1E9}\u{1F1F0}" },
  { value: "fi", label: "Suomi", flag: "\u{1F1EB}\u{1F1EE}" },
  { value: "no", label: "Norsk", flag: "\u{1F1F3}\u{1F1F4}" },
  { value: "cs", label: "\u010ce\u0161tina", flag: "\u{1F1E8}\u{1F1FF}" },
  { value: "hu", label: "Magyar", flag: "\u{1F1ED}\u{1F1FA}" },
  { value: "ro", label: "Rom\u00e2n\u0103", flag: "\u{1F1F7}\u{1F1F4}" },
  { value: "bg", label: "\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438", flag: "\u{1F1E7}\u{1F1EC}" },
  { value: "el", label: "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac", flag: "\u{1F1EC}\u{1F1F7}" },
  { value: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", flag: "\u{1F1F7}\u{1F1FA}" },
  { value: "uk", label: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430", flag: "\u{1F1FA}\u{1F1E6}" },
  { value: "tr", label: "T\u00fcrk\u00e7e", flag: "\u{1F1F9}\u{1F1F7}" },
  { value: "vi", label: "Ti\u1ebfng Vi\u1ec7t", flag: "\u{1F1FB}\u{1F1F3}" },
  { value: "th", label: "\u0e44\u0e17\u0e22", flag: "\u{1F1F9}\u{1F1ED}" },
  { value: "hi", label: "\u0939\u093f\u0928\u094d\u0926\u0940", flag: "\u{1F1EE}\u{1F1F3}" },
  { value: "id", label: "Bahasa Indonesia", flag: "\u{1F1EE}\u{1F1E9}" },
  { value: "ja", label: "\u65e5\u672c\u8a9e", flag: "\u{1F1EF}\u{1F1F5}" },
  { value: "ko", label: "\ud55c\uad6d\uc5b4", flag: "\u{1F1F0}\u{1F1F7}" },
  { value: "zh-CN", label: "\u4e2d\u6587\uff08\u7b80\u4f53\uff09", flag: "\u{1F1E8}\u{1F1F3}" },
  { value: "zh-TW", label: "\u4e2d\u6587\uff08\u7e41\u9ad4\uff09", flag: "\u{1F1F9}\u{1F1FC}" }
];

const LANGUAGE_CODES = {};
LANGUAGE_OPTIONS.forEach((row) => { LANGUAGE_CODES[row.value] = row; });

function localLanguageCode() {
  const raw = String((typeof navigator !== "undefined" && (navigator.language || navigator.userLanguage)) || "en-US").replace("_", "-").trim();
  const lower = raw.toLowerCase();
  const keys = Object.keys(LANGUAGE_CODES);
  const exact = keys.find((key) => key.toLowerCase() === lower);
  if (exact) return exact;
  const aliases = {
    nb: "no",
    nn: "no",
    "nb-no": "no",
    "nn-no": "no",
    pt: "pt-BR",
    "pt-pt": "pt-BR",
    "zh-hans": "zh-CN",
    "zh-sg": "zh-CN",
    "zh-my": "zh-CN",
    "zh-hant": "zh-TW",
    "zh-hk": "zh-TW",
    "zh-mo": "zh-TW"
  };
  if (aliases[lower]) return aliases[lower];
  const lang = lower.split("-")[0];
  if (lang === "es" && lower !== "es-es") return "es-419";
  if (lang === "en") return lower === "en-gb" || lower.indexOf("en-gb") === 0 ? "en-GB" : "en-US";
  if (lang === "zh") return /tw|hk|mo|hant/.test(lower) ? "zh-TW" : "zh-CN";
  if (LANGUAGE_CODES[lang]) return lang;
  const starts = keys.find((key) => key.toLowerCase().indexOf(lang + "-") === 0);
  if (starts) return starts;
  return "en-US";
}

function defaultLanguageTimePrefs() {
  return {
    language: localLanguageCode(),
    time_format: "auto"
  };
}

function languageTimeLocale() {
  const code = typeof languageTimePrefs !== "undefined" && languageTimePrefs && languageTimePrefs.language;
  if (code && LANGUAGE_CODES[code]) return code;
  return localLanguageCode();
}

function languageTimeFlag(code) {
  const row = LANGUAGE_CODES[code] || LANGUAGE_CODES[languageTimeLocale()] || LANGUAGE_CODES["en-US"];
  return row ? row.flag : "\u{1F1FA}\u{1F1F8}";
}

function applyLanguageTime(prefs) {
  const incoming = prefs ? Object.assign({}, prefs) : {};
  languageTimePrefs = Object.assign(defaultLanguageTimePrefs(), incoming);
  if (!LANGUAGE_CODES[incoming.language]) languageTimePrefs.language = localLanguageCode();
  document.documentElement.lang = languageTimeLocale();
  if (typeof rerenderOpenChats === "function") rerenderOpenChats();
}

function hydrateLanguageTime(payload) {
  applyLanguageTime(Object.assign(defaultLanguageTimePrefs(), payload || {}));
}
