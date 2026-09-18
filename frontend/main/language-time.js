// ==================================================================
// language-time.js - Locale and clock format. English is the only
// shipped language. Time format hits formatClusterTime in util.js.
// ==================================================================

function defaultLanguageTimePrefs() {
  return {
    language: "en-US",
    time_format: "auto"
  };
}

function applyLanguageTime(prefs) {
  languageTimePrefs = Object.assign(defaultLanguageTimePrefs(), prefs || {});
  document.documentElement.lang = languageTimePrefs.language === "en-US" ? "en" : languageTimePrefs.language;
  if (typeof rerenderOpenChats === "function") rerenderOpenChats();
}

function hydrateLanguageTime(payload) {
  applyLanguageTime(Object.assign(defaultLanguageTimePrefs(), payload || {}));
}
