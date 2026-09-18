// ==================================================================
// appearance.js - Theme presets, brightness, and live CSS variables.
// Four colors per theme: background, surface, accent, highlight.
// Status greens/oranges/reds stay locked in tokens.css.
// ==================================================================

const THEME_PRESETS = [
  { id: "midnight-purple", name: "Midnight Purple", colors: ["#0f0a1a", "#1c1430", "#8b5cf6", "#d946ef"] },
  { id: "light", name: "Light", colors: ["#f4efe8", "#fffaf4", "#c4a07a", "#8a6244"] },
  { id: "midnight", name: "Midnight", colors: ["#0d0d10", "#1a1b20", "#e06c62", "#c8c9ce"] },
  { id: "paper", name: "Paper", colors: ["#f7f1e4", "#fffaf0", "#c9a227", "#5c3d2e"] },
  { id: "cyberpunk", name: "Cyberpunk", colors: ["#0a0a12", "#151528", "#00e5ff", "#ff2bd6"] },
  { id: "retrowave", name: "Retro Wave", colors: ["#140c18", "#2a1814", "#ff7a18", "#e23d3d"] },
  { id: "forest", name: "Forest", colors: ["#0c1610", "#16301c", "#3d8b4a", "#8fd99a"] },
  { id: "ocean", name: "Ocean", colors: ["#061422", "#0c2a44", "#1e90ff", "#7ec8ff"] },
  { id: "ume", name: "Ume", colors: ["#1a1020", "#3a2048", "#f0a0c8", "#ffd0e4"] },
  { id: "copper", name: "Copper", colors: ["#1a100c", "#3a2418", "#d4783a", "#e8b080"] },
  { id: "terminal", name: "Terminal", colors: ["#050805", "#101410", "#22c55e", "#86efac"] },
  { id: "organs", name: "Organs", colors: ["#0c0808", "#2a1810", "#d4a574", "#c23b3b"] },
  { id: "lavender", name: "Lavender", colors: ["#f4f0fa", "#ffffff", "#b8a0d8", "#7c5cbf"] },
  { id: "gpt", name: "GPT", colors: ["#212121", "#2f2f2f", "#10a37f", "#ececec"] },
  { id: "claude", name: "Claude", colors: ["#1a1614", "#2a2420", "#d97757", "#c4a484"] },
  { id: "cute", name: "Cute", colors: ["#fff5f8", "#ffffff", "#ff8ab5", "#ffc0d4"] },
  { id: "ash", name: "Ash", colors: ["#ececee", "#f7f7f8", "#f5c400", "#a8a8b0"] }
];

function defaultAppearancePrefs() {
  return {
    theme: "midnight-purple",
    brightness: "dark",
    color_bg: "",
    color_surface: "",
    color_accent: "",
    color_highlight: "",
    show_link_media: true,
    show_uploads: true,
    show_embeds: true,
    show_reactions: true,
    show_send: false,
    show_bubbles: true,
    self_side: "right",
    search_style: "auto"
  };
}

function appearanceHex(value) {
  const text = String(value || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text.toLowerCase() : "";
}

function hexToRgb(hex) {
  const clean = appearanceHex(hex);
  if (!clean) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

function mixHex(a, b, amount) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    left.r + (right.r - left.r) * t,
    left.g + (right.g - left.g) * t,
    left.b + (right.b - left.b) * t
  );
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function shadeHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 + amount), g * (1 + amount), b * (1 + amount));
}

function themeSaturationAmount() {
  if (typeof accessibilityPrefs === "undefined" || !accessibilityPrefs) return 1;
  const n = Number(accessibilityPrefs.saturation);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(100, n)) / 100;
}

function desaturateHex(hex, sat) {
  const t = Math.max(0, Math.min(1, Number(sat)));
  if (t >= 0.999) return appearanceHex(hex) || String(hex || "");
  const { r, g, b } = hexToRgb(hex);
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return rgbToHex(gray + (r - gray) * t, gray + (g - gray) * t, gray + (b - gray) * t);
}

function themePresetById(id) {
  return THEME_PRESETS.find(row => row.id === id) || THEME_PRESETS[0];
}

function nativeThemeColors(prefs) {
  if (prefs.theme === "custom") {
    const custom = [
      appearanceHex(prefs.color_bg),
      appearanceHex(prefs.color_surface),
      appearanceHex(prefs.color_accent),
      appearanceHex(prefs.color_highlight)
    ];
    if (custom.every(Boolean)) return custom;
  }
  return themePresetById(prefs.theme).colors.slice();
}

function brightnessAdjustedColors(colors, brightness) {
  const [bg, surface, accent, highlight] = colors;
  const lightNative = luminance(bg) >= 0.55;
  if (brightness === "light") {
    if (lightNative) return [bg, surface, accent, highlight];
    return [mixHex(bg, "#f4f0fa", 0.84), mixHex(surface, "#ffffff", 0.86), accent, highlight];
  }
  if (!lightNative) return [bg, surface, accent, highlight];
  return [mixHex(bg, "#0e0c14", 0.78), mixHex(surface, "#161320", 0.72), accent, highlight];
}

function applyThemeTokens(colors) {
  const sat = themeSaturationAmount();
  const [bg, surface, accent, highlight] = colors.map(c => desaturateHex(c, sat));
  const light = luminance(bg) >= 0.45;
  const text = light ? "#1c1528" : "#ece7f7";
  const textDim = light ? "#6b627a" : "#a89bc4";
  const root = document.documentElement;
  const highContrast = typeof effectiveHighContrast === "function"
    && accessibilityPrefs
    && effectiveHighContrast(accessibilityPrefs);
  root.style.setProperty("--bg", bg);
  root.style.setProperty("--rail", mixHex(bg, surface, 0.38));
  root.style.setProperty("--panel", surface);
  root.style.setProperty("--panel-alt", mixHex(surface, accent, 0.12));
  root.style.setProperty("--border", highContrast ? mixHex(surface, text, 0.58) : mixHex(surface, text, 0.16));
  root.style.setProperty("--text", text);
  root.style.setProperty("--text-dim", highContrast ? mixHex(textDim, text, 0.7) : textDim);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-hover", shadeHex(accent, light ? -0.12 : -0.08));
  root.style.setProperty("--accent-submenu", highlight);
  root.style.setProperty("--accent-submenu-hover", shadeHex(highlight, -0.1));
}

function appearancePref(name, fallback) {
  if (!appearancePrefs || appearancePrefs[name] === undefined || appearancePrefs[name] === null) return fallback;
  return appearancePrefs[name];
}

function applyAppearanceChrome(prefs) {
  document.documentElement.classList.toggle("show-send-btn", !!prefs.show_send);
  document.documentElement.classList.toggle("hide-reactions", !prefs.show_reactions);
  document.documentElement.classList.toggle("no-chat-bubbles", !prefs.show_bubbles);
  const selfRight = prefs.self_side !== "left";
  ["chat-messages", "channel-messages"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("self-right", selfRight);
  });
}

function rerenderOpenChats() {
  if (typeof renderMessages === "function") renderMessages({ preserveScroll: true });
  if (typeof renderChannelMessages === "function") renderChannelMessages({ preserveScroll: true });
}

let appearanceLastPreset = "midnight-purple";

function applyAppearance(prefs) {
  appearancePrefs = prefs;
  if (prefs.theme && prefs.theme !== "custom") appearanceLastPreset = prefs.theme;
  applyThemeTokens(brightnessAdjustedColors(nativeThemeColors(prefs), prefs.brightness === "light" ? "light" : "dark"));
  applyAppearanceChrome(prefs);
}

function hydrateAppearance(payload) {
  const next = defaultAppearancePrefs();
  if (payload && typeof payload === "object") {
    Object.keys(next).forEach(key => {
      if (payload[key] !== undefined && payload[key] !== null) next[key] = payload[key];
    });
  }
  applyAppearance(next);
}
