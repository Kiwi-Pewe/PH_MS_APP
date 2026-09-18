// ==================================================================
// accessibility.js - Saved a11y prefs, CSS variables, and document
// classes. The live preview in settings-accessibility.js reads the
// same object. Density / compact chat / zoom still mainly drive the
// preview until those layouts are swept through the app.
// ==================================================================

function defaultAccessibilityPrefs() {
  return {
    text_size: 15,
    underline_links: false,
    display_name_styles: false,
    ui_density: "default",
    chat_display: "default",
    group_spacing: 20,
    zoom: 100,
    saturation: 100,
    saturation_custom: false,
    high_contrast: false,
    sync_contrast: true,
    role_colors: "names",
    official_messages: "default",
    toggle_indicators: false,
    reduced_motion: false,
    sync_motion: true,
    gifs_when_focused: true,
    animated_emoji: true,
    sticker_anim: "always",
    tts_rate: 1,
    image_descriptions: false,
    legacy_input: false
  };
}

function osWantsReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function osWantsHighContrast() {
  return !!(window.matchMedia && (
    window.matchMedia("(prefers-contrast: more)").matches ||
    window.matchMedia("(prefers-contrast: high)").matches
  ));
}

function effectiveReducedMotion(prefs) {
  if (prefs.sync_motion) return osWantsReducedMotion() || !!prefs.reduced_motion;
  return !!prefs.reduced_motion;
}

function effectiveHighContrast(prefs) {
  if (prefs.sync_contrast) return osWantsHighContrast() || !!prefs.high_contrast;
  return !!prefs.high_contrast;
}

function applyAccessibility(prefs) {
  accessibilityPrefs = Object.assign(defaultAccessibilityPrefs(), prefs || {});
  const root = document.documentElement;
  const size = Number(accessibilityPrefs.text_size) || 15;
  root.style.setProperty("--message-scale", String(size / 15));
  root.style.setProperty("--cluster-gap", (Number(accessibilityPrefs.group_spacing) || 0) + "px");
  root.style.setProperty("--ui-saturate", String((Number(accessibilityPrefs.saturation) || 0) / 100));
  root.classList.toggle("underline-links", !!accessibilityPrefs.underline_links);
  root.classList.toggle("show-toggle-icons", !!accessibilityPrefs.toggle_indicators);
  root.classList.toggle("reduced-motion", effectiveReducedMotion(accessibilityPrefs));
  root.classList.toggle("high-contrast", effectiveHighContrast(accessibilityPrefs));
  root.classList.toggle("chat-compact", accessibilityPrefs.chat_display === "compact");
  root.classList.toggle("ui-density-compact", accessibilityPrefs.ui_density === "compact");
  root.classList.toggle("ui-density-spacious", accessibilityPrefs.ui_density === "spacious");
  applyAccessibilityZoom(accessibilityPrefs.zoom);
  if (typeof refreshAccessibilityPreview === "function") refreshAccessibilityPreview();
}

function applyAccessibilityZoom(percent) {
  const z = (Number(percent) || 100) / 100;
  document.documentElement.style.zoom = z === 1 ? "" : String(z);
}

function hydrateAccessibility(payload) {
  applyAccessibility(Object.assign(defaultAccessibilityPrefs(), payload || {}));
}

if (window.matchMedia) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const contrast = window.matchMedia("(prefers-contrast: more)");
  const onOsChange = () => {
    if (accessibilityPrefs) applyAccessibility(accessibilityPrefs);
  };
  if (motion.addEventListener) motion.addEventListener("change", onOsChange);
  else if (motion.addListener) motion.addListener(onOsChange);
  if (contrast.addEventListener) contrast.addEventListener("change", onOsChange);
  else if (contrast.addListener) contrast.addListener(onOsChange);
}
