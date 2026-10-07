// ==================================================================
// profile-board.js - 32-column snap grid, collision, and tile paint.
// Identity tiles sit on the Guilded seam with CSS, not shared cells.
// ==================================================================

const PROFILE_COLS = 32;
const PROFILE_ROW_H = 36;
const PROFILE_GAP = 0;
let profileBoardScale = 1;

function profileCellSize() {
  return PROFILE_ROW_H;
}

function profileBoardPad() {
  const board = document.getElementById("profile-board");
  if (!board) return { x: 40, y: 16 };
  const styles = window.getComputedStyle(board);
  return {
    x: (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0),
    y: parseFloat(styles.paddingTop) || 0
  };
}

function syncProfileBoardScale() {
  const scroll = document.getElementById("profile-board-scroll");
  const fit = document.getElementById("profile-board-fit");
  const board = document.getElementById("profile-board");
  if (!scroll || !board) return;
  if (board.classList.contains("is-mini-profile-page")) {
    board.style.transform = "none";
    profileBoardScale = 1;
    if (fit) {
      fit.style.width = "100%";
      fit.style.height = "100%";
    }
    return;
  }
  const pad = profileBoardPad();
  const designW = PROFILE_COLS * PROFILE_ROW_H + pad.x;
  board.style.transform = "none";
  const designH = Math.max(board.offsetHeight, 1);
  const availW = Math.max(1, scroll.clientWidth);
  profileBoardScale = availW / designW;
  board.style.transformOrigin = "top left";
  board.style.transform = "scale(" + profileBoardScale + ")";
  if (fit) {
    fit.style.width = Math.round(designW * profileBoardScale) + "px";
    fit.style.height = Math.round(designH * profileBoardScale) + "px";
  }
}

function bindProfileBoardScale() {
  const scroll = document.getElementById("profile-board-scroll");
  if (!scroll || scroll.dataset.scaleBound === "1") return;
  scroll.dataset.scaleBound = "1";
  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", () => syncProfileBoardScale());
    return;
  }
  const observer = new ResizeObserver(() => syncProfileBoardScale());
  observer.observe(scroll);
}
// Kiwi lists min/max as (Height, Width). Fields below are minH/minW, maxH/maxW.
const PROFILE_TILE_TYPES = {
  banner: { w: 32, h: 3, minW: 6, minH: 3, maxW: 32, maxH: 5, label: "Banner" },
  avatar: { w: 4, h: 4, minW: 2, minH: 2, maxW: 4, maxH: 4, label: "Avatar" },
  display_name: { w: 5, h: 2, minW: 3, minH: 2, maxW: 5, maxH: 8, label: "Display name" },
  member_since: { w: 6, h: 2, minW: 4, minH: 2, maxW: 10, maxH: 3, label: "Member since" },
  friends: { w: 6, h: 11, minW: 4, minH: 11, maxW: 6, maxH: 15, label: "Friends" },
  header: { w: 16, h: 2, minW: 4, minH: 1, maxW: 32, maxH: 3, label: "Header" },
  body: { w: 14, h: 4, minW: 6, minH: 2, maxW: 32, maxH: 12, label: "Body" },
  footnote: { w: 12, h: 1, minW: 4, minH: 1, maxW: 32, maxH: 3, label: "Footnote" },
  list: { w: 10, h: 6, minW: 6, minH: 3, maxW: 20, maxH: 16, label: "List" },
  spoiler: { w: 10, h: 3, minW: 6, minH: 2, maxW: 20, maxH: 10, label: "Spoiler" },
  divider: { w: 32, h: 1, minW: 1, minH: 1, maxW: 32, maxH: 24, label: "Divider" },
  rail: { w: 8, h: 1, minW: 1, minH: 1, maxW: 8, maxH: 8, label: "Rail" },
  link_tree: { w: 8, h: 10, minW: 5, minH: 6, maxW: 8, maxH: 12, label: "Link Tree" },
  button: { w: 8, h: 2, minW: 4, minH: 1, maxW: 16, maxH: 3, label: "Button" },
  details: { w: 6, h: 2, minW: 5, minH: 2, maxW: 6, maxH: 3, label: "Local Time" },
  local_time: { w: 6, h: 2, minW: 5, minH: 2, maxW: 6, maxH: 3, label: "Local Time" },
  icon: { w: 3, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6, label: "Icon" },
  clock: { w: 6, h: 3, minW: 4, minH: 2, maxW: 12, maxH: 5, label: "Clock" },
  image: { w: 10, h: 6, minW: 4, minH: 3, maxW: 32, maxH: 32, label: "Image" },
  video: { w: 12, h: 7, minW: 8, minH: 4, maxW: 24, maxH: 16, label: "Video" },
  music: { w: 10, h: 4, minW: 6, minH: 3, maxW: 10, maxH: 4, label: "Music" },
  embed: { w: 12, h: 7, minW: 8, minH: 5, maxW: 20, maxH: 12, label: "Embed" },
  gallery: { w: 6, h: 6, minW: 3, minH: 3, maxW: 9, maxH: 9, label: "Gallery" },
  comments: { w: 12, h: 10, minW: 8, minH: 6, maxW: 24, maxH: 18, label: "Comments" },
  display_server: { w: 10, h: 8, minW: 6, minH: 4, maxW: 16, maxH: 18, label: "Display Server" },
  steam_profile: { w: 12, h: 7, minW: 8, minH: 5, maxW: 12, maxH: 7, label: "Profile" },
  steam_playing_now: { w: 10, h: 4, minW: 7, minH: 4, maxW: 10, maxH: 6, label: "Playing Now" },
  steam_recently_played: { w: 12, h: 8, minW: 7, minH: 6, maxW: 16, maxH: 16, label: "Recently Played" },
  steam_library: { w: 12, h: 8, minW: 7, minH: 6, maxW: 16, maxH: 16, label: "Library" },
  steam_achievements: { w: 12, h: 8, minW: 7, minH: 6, maxW: 16, maxH: 16, label: "Achievements" }
};

const DISPLAY_SERVER_MAX = 20;

const PROFILE_PLACEHOLDERS = {
  connections: { label: "Connections", w: 10, h: 6, minW: 8, minH: 4, maxW: 16, maxH: 14 },
  featured_friend: { label: "Featured friend", w: 8, h: 4, minW: 6, minH: 3, maxW: 12, maxH: 8 },
  mutuals: { label: "Mutuals", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 12 },
  frame: { label: "Frame", w: 12, h: 8, minW: 6, minH: 4, maxW: 32, maxH: 18 },
  color_block: { label: "Color block", w: 8, h: 4, minW: 2, minH: 2, maxW: 32, maxH: 12 },
  meter: { label: "Meter", w: 10, h: 2, minW: 6, minH: 1, maxW: 24, maxH: 4 },
  gif: { label: "GIF", w: 8, h: 6, minW: 4, minH: 3, maxW: 16, maxH: 12 },
  achievements: { label: "Achievements", w: 12, h: 5, minW: 8, minH: 3, maxW: 24, maxH: 12 },
  recently_played: { label: "Recently played", w: 10, h: 4, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  favorite_game: { label: "Favorite game", w: 10, h: 5, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  currently_playing: { label: "Currently playing", w: 10, h: 4, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  want_to_play: { label: "Want to play", w: 10, h: 5, minW: 6, minH: 3, maxW: 20, maxH: 12 },
  games_played: { label: "Games played", w: 12, h: 5, minW: 8, minH: 3, maxW: 24, maxH: 12 },
  game_stats: { label: "Game stats", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 10 },
  library: { label: "Library", w: 12, h: 6, minW: 8, minH: 4, maxW: 24, maxH: 14 },
  review: { label: "Review", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 10 },
  steam_badges: { label: "Badges", w: 10, h: 4, minW: 6, minH: 3, maxW: 16, maxH: 10 }
};

Object.keys(PROFILE_PLACEHOLDERS).forEach(type => {
  PROFILE_TILE_TYPES[type] = Object.assign({ placeholder: true }, PROFILE_PLACEHOLDERS[type]);
});

const PROFILE_LINK_PLATFORMS = [
  "YouTube", "Twitch", "Steam", "Discord", "X", "Instagram", "TikTok",
  "GitHub", "Spotify", "Reddit", "Roblox", "Battle.net", "PlayStation",
  "Patreon", "Bluesky", "Crunchyroll", "eBay", "Other"
];

const PROFILE_CLOCK_CITIES = [
  { group: "UTC", items: [{ zone: "UTC", city: "UTC" }] },
  {
    group: "Americas",
    items: [
      { zone: "Pacific/Honolulu", city: "Honolulu" },
      { zone: "America/Anchorage", city: "Anchorage" },
      { zone: "America/Los_Angeles", city: "Los Angeles" },
      { zone: "America/Denver", city: "Denver" },
      { zone: "America/Chicago", city: "Chicago" },
      { zone: "America/New_York", city: "New York" },
      { zone: "America/Mexico_City", city: "Mexico City" },
      { zone: "America/Sao_Paulo", city: "São Paulo" },
      { zone: "America/Argentina/Buenos_Aires", city: "Buenos Aires" }
    ]
  },
  {
    group: "Europe & Africa",
    items: [
      { zone: "Europe/London", city: "London" },
      { zone: "Europe/Paris", city: "Paris" },
      { zone: "Europe/Athens", city: "Athens" },
      { zone: "Europe/Moscow", city: "Moscow" },
      { zone: "Africa/Lagos", city: "Lagos" },
      { zone: "Africa/Cairo", city: "Cairo" },
      { zone: "Africa/Johannesburg", city: "Johannesburg" }
    ]
  },
  {
    group: "Asia & Pacific",
    items: [
      { zone: "Asia/Dubai", city: "Dubai" },
      { zone: "Asia/Kolkata", city: "Mumbai" },
      { zone: "Asia/Bangkok", city: "Bangkok" },
      { zone: "Asia/Singapore", city: "Singapore" },
      { zone: "Asia/Hong_Kong", city: "Hong Kong" },
      { zone: "Asia/Shanghai", city: "Shanghai" },
      { zone: "Asia/Seoul", city: "Seoul" },
      { zone: "Asia/Tokyo", city: "Tokyo" },
      { zone: "Australia/Sydney", city: "Sydney" },
      { zone: "Pacific/Auckland", city: "Auckland" }
    ]
  }
];

function profileClockCityList() {
  const rows = [];
  PROFILE_CLOCK_CITIES.forEach(group => {
    group.items.forEach(item => rows.push(item));
  });
  return rows;
}

function profileClockCityName(zone) {
  const id = String(zone || "").trim();
  const hit = profileClockCityList().find(item => item.zone === id);
  if (hit) return hit.city;
  return id.replace(/_/g, " ");
}

function profileTileBounds(type, tile) {
  const meta = PROFILE_TILE_TYPES[type] || {};
  const bounds = {
    minW: meta.minW || 1,
    minH: meta.minH || 1,
    maxW: Math.min(meta.maxW || PROFILE_COLS, PROFILE_COLS),
    maxH: meta.maxH || 24,
    w: meta.w || 4,
    h: meta.h || 3
  };
  const orient = profileStripOrientation(type, tile && tile.props, tile && tile.w, tile && tile.h);
  if (orient === "horizontal") {
    bounds.minH = 1;
    bounds.maxH = 1;
    bounds.h = 1;
    if (type === "rail") {
      bounds.minW = 1;
      bounds.maxW = 8;
      bounds.w = Math.min(bounds.w, 8);
    } else {
      bounds.minW = 1;
      bounds.maxW = PROFILE_COLS;
    }
  } else if (type === "steam_recently_played" || type === "steam_library" || type === "steam_achievements") {
    const extra = type === "steam_achievements" ? steamAchieveMinSize(tile && tile.props) : steamRecentMinSize(tile && tile.props);
    bounds.minW = extra.minW;
    bounds.minH = extra.minH;
    bounds.maxW = Math.min(16, PROFILE_COLS);
    bounds.maxH = 16;
    if (bounds.minW > bounds.maxW) bounds.minW = bounds.maxW;
    if (bounds.minH > bounds.maxH) bounds.minH = bounds.maxH;
  } else if (orient === "vertical") {
    bounds.minW = 1;
    bounds.maxW = 1;
    bounds.w = 1;
    if (type === "rail") {
      bounds.minH = 1;
      bounds.maxH = 8;
      bounds.h = Math.min(bounds.h, 8);
    } else {
      bounds.minH = 1;
      bounds.maxH = 24;
    }
  }
  return bounds;
}

function clampProfileTileSize(type, w, h, originX, tile) {
  const b = profileTileBounds(type, tile || { type, w, h });
  const maxW = originX == null ? b.maxW : Math.min(b.maxW, PROFILE_COLS - originX);
  return {
    w: Math.max(b.minW, Math.min(maxW, w)),
    h: Math.max(b.minH, Math.min(b.maxH, h))
  };
}

function profileNewId(prefix) {
  return prefix + "_" + Math.random().toString(16).slice(2, 10);
}

function cloneProfileLayout(layout) {
  const files = {};
  const ident = layout && layout.identity;
  if (ident) {
    ["avatar", "banner"].forEach((kind) => {
      const media = ident[kind];
      if (media && (media._file || media._previewUrl)) {
        files[kind] = { _file: media._file, _previewUrl: media._previewUrl, _ownedPreview: media._ownedPreview };
      }
    });
  }
  const copy = JSON.parse(JSON.stringify(layout || { pages: [] }));
  copy.grid_cols = PROFILE_COLS;
  if (typeof ensureIdentityLayout === "function") ensureIdentityLayout(copy);
  Object.keys(files).forEach((kind) => {
    copy.identity[kind] = Object.assign({}, copy.identity[kind], files[kind]);
  });
  return copy;
}

function profilePageById(layout, pageId) {
  const pages = (layout && layout.pages) || [];
  return pages.find(page => page.id === pageId) || pages[0] || null;
}

function profileTilesOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function profileTileAllowsOverlap(tile) {
  return !!(tile && tile.allow_overlap);
}

function profileColliders(page, candidate, skipId) {
  return (page.tiles || []).filter(tile => {
    if (tile.id === skipId) return false;
    if (!profileTilesOverlap(tile, candidate)) return false;
    if (profileTileAllowsOverlap(candidate) || profileTileAllowsOverlap(tile)) return false;
    return true;
  });
}

function profileFits(tile) {
  if (tile.x < 0 || tile.y < 0 || tile.x + tile.w > PROFILE_COLS) return false;
  const b = profileTileBounds(tile.type, tile);
  return tile.w >= b.minW && tile.h >= b.minH && tile.w <= b.maxW && tile.h <= b.maxH;
}

function profileFirstFit(page, w, h, skipId) {
  const maxY = (page.tiles || []).reduce((n, tile) => Math.max(n, tile.y + tile.h), 0) + 8;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= PROFILE_COLS - w; x++) {
      const probe = { x, y, w, h };
      if (!profileColliders(page, probe, skipId).length) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

const PROFILE_TEXT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24];

function defaultTextSize(type, prev) {
  if (prev && prev.text_size != null && PROFILE_TEXT_SIZES.indexOf(Number(prev.text_size)) >= 0) {
    return Number(prev.text_size);
  }
  const old = Number(prev && prev.text_scale);
  if (old === 1) return 12;
  if (old === 3) return 18;
  if (type === "header") return 18;
  if (type === "local_time" || type === "details" || type === "clock" || type === "display_name") return 18;
  if (type === "footnote") return 12;
  return 14;
}

const PROFILE_BORDER_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" }
];

function clampProfileBorderWidth(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function profileBorderColor(value) {
  const raw = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : "";
}

function clampProfileAngle(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 90;
  return Math.max(0, Math.min(360, Math.round(n)));
}

function clampProfilePercent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampProfileSpan(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function clampProfileOffset(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-24, Math.min(24, Math.round(n)));
}

function clampProfileLetter(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-8, Math.min(16, Math.round(n)));
}

function clampProfileLeading(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.min(200, Math.round(n)));
}

function profileTextFont(value) {
  if (value === "serif") return "Georgia, \"Times New Roman\", serif";
  if (value === "mono") return "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  return "";
}

function profileMixColor(color, opacity) {
  const hex = profileBorderColor(color);
  const pct = clampProfilePercent(opacity, 100);
  const base = hex || "var(--panel-alt)";
  if (pct >= 100 && hex) return hex;
  if (pct >= 100) return base;
  return "color-mix(in srgb, " + base + " " + pct + "%, transparent)";
}

function profileGradientPaint(angle, colorA, colorB, offset, fade) {
  const stop = clampProfilePercent(offset, 50);
  const pct = clampProfilePercent(fade, 100);
  const soften = (color) => pct >= 100 ? color : "color-mix(in srgb, " + color + " " + pct + "%, transparent)";
  return "linear-gradient(" + clampProfileAngle(angle) + "deg, " + soften(colorA) + " 0%, " + soften(colorB) + " " + stop + "%)";
}

function defaultBorderChrome(type, row) {
  const prev = row || {};
  const fallbackW = (type === "avatar" || type === "banner") ? 3 : 1;
  const style = String(prev.border_style || "solid").toLowerCase();
  const known = PROFILE_BORDER_STYLES.some(item => item.value === style);
  return {
    border_width: clampProfileBorderWidth(prev.border_width, fallbackW),
    border_color: profileBorderColor(prev.border_color) || "#ffffff",
    border_style: known ? style : "solid",
    border_gradient: !!prev.border_gradient,
    border_color_2: profileBorderColor(prev.border_color_2) || "",
    border_angle: clampProfileAngle(prev.border_angle == null ? 90 : prev.border_angle),
    border_offset: clampProfilePercent(prev.border_offset, 50),
    border_gradient_opacity: clampProfilePercent(prev.border_gradient_opacity, 100)
  };
}

function defaultTextChrome(type, prev) {
  const row = prev || {};
  const card = type !== "header" && type !== "footnote" && type !== "avatar" && type !== "display_name" && type !== "banner" && type !== "divider" && type !== "rail" && type !== "icon";
  return Object.assign({
    text_size: defaultTextSize(type, row),
    text_align: row.text_align === "center" || row.text_align === "right" || row.text_align === "left" || row.text_align === "justify"
      ? row.text_align
      : (type === "display_name" ? "center" : "left"),
    text_color: profileBorderColor(row.text_color) || "",
    text_gradient: !!row.text_gradient,
    text_color_2: profileBorderColor(row.text_color_2) || "",
    text_angle: clampProfileAngle(row.text_angle == null ? 90 : row.text_angle),
    text_offset: clampProfilePercent(row.text_offset, 50),
    text_gradient_opacity: clampProfilePercent(row.text_gradient_opacity, 100),
    letter_spacing: clampProfileLetter(row.letter_spacing),
    line_spacing: clampProfileLeading(row.line_spacing),
    text_font: row.text_font === "serif" || row.text_font === "mono" ? row.text_font : "app",
    show_text_shadow: !!row.show_text_shadow,
    text_shadow_x: clampProfileOffset(row.text_shadow_x, 0),
    text_shadow_y: clampProfileOffset(row.text_shadow_y, 2),
    text_shadow_blur: clampProfileSpan(row.text_shadow_blur, 4, 40),
    text_shadow_color: profileBorderColor(row.text_shadow_color) || "#000000",
    text_shadow_opacity: clampProfilePercent(row.text_shadow_opacity, 40),
    show_background: row.show_background != null ? !!row.show_background : card,
    show_border: row.show_border != null ? !!row.show_border : false,
    bg_color: profileBorderColor(row.bg_color) || "",
    bg_opacity: clampProfilePercent(row.bg_opacity, 100),
    bg_gradient: !!row.bg_gradient,
    bg_color_2: profileBorderColor(row.bg_color_2) || "",
    bg_angle: clampProfileAngle(row.bg_angle == null ? 90 : row.bg_angle),
    bg_offset: clampProfilePercent(row.bg_offset, 50),
    bg_gradient_opacity: clampProfilePercent(row.bg_gradient_opacity, 100),
    radius: row.radius == null || row.radius === "" ? 10 : clampProfileSpan(row.radius, 10, 40),
    pad: clampProfileSpan(row.pad, 0, 32),
    show_frame: !!row.show_frame,
    frame_width: clampProfileBorderWidth(row.frame_width, 4),
    frame_color: profileBorderColor(row.frame_color) || "#ffffff",
    frame_gradient: !!row.frame_gradient,
    frame_color_2: profileBorderColor(row.frame_color_2) || "",
    frame_angle: clampProfileAngle(row.frame_angle == null ? 90 : row.frame_angle),
    frame_offset: clampProfilePercent(row.frame_offset, 50),
    frame_gradient_opacity: clampProfilePercent(row.frame_gradient_opacity, 100),
    show_shadow: !!row.show_shadow,
    shadow_x: clampProfileOffset(row.shadow_x, 0),
    shadow_y: clampProfileOffset(row.shadow_y, 4),
    shadow_blur: clampProfileSpan(row.shadow_blur, 12, 40),
    shadow_spread: clampProfileSpan(row.shadow_spread, 0, 24),
    shadow_color: profileBorderColor(row.shadow_color) || "#000000",
    shadow_opacity: clampProfilePercent(row.shadow_opacity, 35),
    shadow_inset: !!row.shadow_inset
  }, defaultBorderChrome(type, row));
}

function defaultProfileTileProps(type, existing) {
  const prev = existing || {};
  const chrome = defaultTextChrome(type, prev);
  if (type === "bio") return Object.assign({ text: prev.text || "" }, chrome);
  if (type === "local_time" || type === "details") {
    const align = prev.text_align === "left" || prev.text_align === "right" || prev.text_align === "center" || prev.text_align === "justify"
      ? prev.text_align
      : "center";
    const format = prev.time_format === "24" || prev.time_format === "system" ? prev.time_format : "12";
    return Object.assign({}, chrome, {
      timezone: prev.timezone || (profileIsOwn ? profileTimezoneGuess() : "") || "",
      time_format: format,
      show_date: !!prev.show_date,
      month_style: prev.month_style === "name" ? "name" : "num",
      year_style: prev.year_style === "2" ? "2" : "full",
      text_align: align
    });
  }
  if (type === "banner") {
    return Object.assign({
      color: prev.color ? prev.color : "#1e6b8a",
      show_border: false
    }, defaultBorderChrome(type, prev));
  }
  if (type === "avatar") {
    return Object.assign({ show_border: false }, defaultBorderChrome(type, prev));
  }
  if (type === "display_name") {
    const align = prev.text_align === "left" || prev.text_align === "right" || prev.text_align === "center" || prev.text_align === "justify"
      ? prev.text_align
      : "center";
    return Object.assign({}, defaultTextChrome(type, prev), {
      show_status: !!prev.show_status,
      show_pronouns: !!prev.show_pronouns,
      show_aliases: prev.show_aliases !== false,
      text_align: align
    });
  }
  if (type === "header") return Object.assign({ text: prev.text || "", level: 1 }, chrome);
  if (type === "body") {
    const titleAlign = prev.title_align === "center" || prev.title_align === "right" ? prev.title_align : "left";
    return Object.assign({
      text: prev.text || "",
      show_title: !!prev.show_title,
      title: prev.title || "",
      title_align: titleAlign
    }, chrome);
  }
  if (type === "footnote") return Object.assign({ text: prev.text || "" }, chrome);
  if (type === "list") return Object.assign({ style: "bullet", items: Array.isArray(prev.items) ? prev.items.slice() : [] }, chrome);
  if (type === "spoiler") return Object.assign({ title: prev.title || "", text: prev.text || "", start_open: !!prev.start_open }, chrome);
  if (type === "divider") {
    return Object.assign({
      style: prev.style || "solid",
      orientation: prev.orientation === "vertical" ? "vertical" : "horizontal"
    }, chrome);
  }
  if (type === "rail") {
    const style = String(prev.style || "solid").toLowerCase();
    const known = PROFILE_BORDER_STYLES.some(item => item.value === style);
    return Object.assign({
      orientation: prev.orientation === "vertical" ? "vertical" : "horizontal",
      thickness: clampProfileBorderWidth(prev.thickness, 4),
      color: profileBorderColor(prev.color) || "#ffffff",
      style: known ? style : "solid"
    }, chrome);
  }
  if (type === "link_tree") {
    return Object.assign({
      links: Array.isArray(prev.links) ? prev.links.map(row => Object.assign({}, row)) : [],
      link_size: clampProfileLinkSize(prev.link_size)
    }, chrome);
  }
  if (type === "friends") return Object.assign({ friend_size: clampProfileEntrySize(prev.friend_size) }, chrome);
  if (type === "button") {
    const action = prev.action === "page" || prev.action === "friend" ? prev.action : "link";
    return Object.assign({
      label: prev.label || "Button",
      action,
      url: prev.url || "",
      page_id: prev.page_id || ""
    }, chrome);
  }
  if (type === "icon") {
    return Object.assign({
      emoji: profileIconEmoji(prev.emoji),
      icon_size: clampProfileEntrySize(prev.icon_size)
    }, chrome);
  }
  if (type === "image") {
    return Object.assign({
      key: prev.key || "",
      url: prev.url || "",
      mime: prev.mime || "",
      size: prev.size || 0,
      name: prev.name || ""
    }, chrome);
  }
  if (type === "video") {
    return Object.assign({
      key: prev.key || "",
      url: prev.url || "",
      mime: prev.mime || "",
      size: prev.size || 0,
      name: prev.name || "",
      transparent_player: !!prev.transparent_player,
      show_player_when_paused: prev.show_player_when_paused == null ? true : !!prev.show_player_when_paused
    }, chrome);
  }
  if (type === "music") {
    return Object.assign({
      tracks: Array.isArray(prev.tracks) ? prev.tracks.map(row => Object.assign({}, row || {})) : []
    }, chrome);
  }
  if (type === "embed") {
    return Object.assign({
      url: prev.url || "",
      provider: prev.provider || "",
      embed_id: prev.embed_id || "",
      kind: prev.kind || ""
    }, chrome);
  }
  if (type === "gallery") {
    return Object.assign({
      items: Array.isArray(prev.items) ? prev.items.map(row => Object.assign({}, row || {})) : [],
      mode: prev.mode === "slideshow" ? "slideshow" : "manual",
      transition: prev.transition === "fade" ? "fade" : "cut",
      speed: typeof clampGallerySpeed === "function" ? clampGallerySpeed(prev.speed) : (Number(prev.speed) || 4),
      shuffle: !!prev.shuffle
    }, chrome);
  }
  if (type === "comments") {
    return Object.assign({
      friends_only: !!prev.friends_only
    }, chrome);
  }
  if (type === "display_server") {
    const ids = [];
    const seen = {};
    const raw = Array.isArray(prev.server_ids) ? prev.server_ids.slice() : [];
    const one = String(prev.server_id || "").trim().toUpperCase();
    if (one) raw.unshift(one);
    raw.forEach((item) => {
      const code = String(item || "").trim().toUpperCase();
      if (!/^[234679ACDEFGHJKLMNPQRTUVWXYZ]{10}$/.test(code) || seen[code]) return;
      if (ids.length >= DISPLAY_SERVER_MAX) return;
      seen[code] = true;
      ids.push(code);
    });
    return Object.assign({
      title: String(prev.title || "").trim() || "Server List",
      server_ids: ids
    }, chrome);
  }
  if (type === "clock" || type === "countdown") {
    const mode = prev.mode === "countdown" || prev.mode === "timer" ? prev.mode : (type === "countdown" ? "countdown" : "world");
    const align = prev.text_align === "left" || prev.text_align === "right" || prev.text_align === "center" || prev.text_align === "justify"
      ? prev.text_align
      : "center";
    const format = prev.time_format === "24" || prev.time_format === "system" ? prev.time_format : "12";
    return Object.assign({}, chrome, {
      mode,
      timezone: prev.timezone || "UTC",
      time_format: format,
      show_date: !!prev.show_date,
      show_zone: !!prev.show_zone,
      show_seconds: !!prev.show_seconds,
      month_style: prev.month_style === "name" ? "name" : "num",
      year_style: prev.year_style === "2" ? "2" : "full",
      label: prev.label || "",
      target_at: prev.target_at || "",
      start_at: prev.start_at || "",
      text_align: align
    });
  }
  return Object.assign({}, chrome);
}

function placeProfileTile(page, type) {
  const size = PROFILE_TILE_TYPES[type] || { w: 4, h: 3 };
  const spot = profileFirstFit(page, size.w, size.h);
  const tile = {
    id: profileNewId("tile"),
    type,
    x: spot.x,
    y: spot.y,
    w: size.w,
    h: size.h,
    allow_overlap: false,
    z_index: 0,
    props: defaultProfileTileProps(type)
  };
  page.tiles = (page.tiles || []).concat([tile]);
  return tile;
}

function resetProfileTile(tile) {
  const size = PROFILE_TILE_TYPES[tile.type] || { w: 4, h: 3 };
  tile.w = size.w;
  tile.h = size.h;
  tile.allow_overlap = false;
  tile.z_index = 0;
  tile.props = defaultProfileTileProps(tile.type, tile.props);
  if (tile.x + tile.w > PROFILE_COLS) tile.x = Math.max(0, PROFILE_COLS - tile.w);
  const page = profilePageById(profileDraft, profileActivePageId);
  if (page && profileColliders(page, tile, tile.id).length) {
    const spot = profileFirstFit(page, tile.w, tile.h, tile.id);
    tile.x = spot.x;
    tile.y = spot.y;
  }
}

function profileTileStyle(tile) {
  return {
    gridColumn: (tile.x + 1) + " / span " + tile.w,
    gridRow: (tile.y + 1) + " / span " + tile.h
  };
}

function applyProfileTileStyle(el, tile) {
  el.style.gridColumn = (tile.x + 1) + " / span " + tile.w;
  el.style.gridRow = (tile.y + 1) + " / span " + tile.h;
  el.classList.toggle("is-compact-row", Number(tile.h) === 1);
}

function profileUsesTextChrome(type) {
  return type === "header" || type === "body" || type === "footnote" || type === "list" || type === "spoiler" || type === "bio";
}

function profileHasFixedTitle(type) {
  return type === "bio" || type === "link_tree" || type === "friends";
}

function profileHasTextFormat(type) {
  return profileUsesTextChrome(type) || type === "button" || type === "local_time" || type === "details" || type === "clock" || type === "comments" || type === "display_server" || type === "display_name" || type === "steam_recently_played" || type === "steam_library" || type === "steam_achievements";
}

function profileTextChrome(props, type) {
  return defaultTextChrome(type, props || {});
}

function profileTextFill(chrome) {
  const second = profileBorderColor(chrome.text_color_2);
  if (!chrome.text_gradient || !second) return "";
  const start = profileBorderColor(chrome.text_color) || "var(--text)";
  return profileGradientPaint(chrome.text_angle, start, second, chrome.text_offset, chrome.text_gradient_opacity);
}

function applyProfileTextPaint(el, chrome) {
  const look = chrome || {};
  el.dataset.textAlign = look.text_align || "left";
  el.style.setProperty("--profile-text-size", (look.text_size || 14) + "pt");
  const solid = profileBorderColor(look.text_color);
  const paint = profileTextFill(look);
  el.classList.toggle("has-text-color", !!solid && !paint);
  if (solid) el.style.setProperty("--profile-text-color", solid);
  else el.style.removeProperty("--profile-text-color");
  el.classList.toggle("has-text-gradient", !!paint);
  if (paint) el.style.setProperty("--profile-text-paint", paint);
  else el.style.removeProperty("--profile-text-paint");
  const font = profileTextFont(look.text_font);
  el.classList.toggle("has-text-font", !!font);
  if (font) el.style.setProperty("--profile-text-font", font);
  else el.style.removeProperty("--profile-text-font");
  const track = clampProfileLetter(look.letter_spacing);
  el.classList.toggle("has-text-track", track !== 0);
  if (track) el.style.setProperty("--profile-letter-spacing", track + "px");
  else el.style.removeProperty("--profile-letter-spacing");
  const leading = clampProfileLeading(look.line_spacing);
  el.classList.toggle("has-text-leading", leading > 0);
  if (leading) el.style.setProperty("--profile-line-height", (leading / 100).toFixed(2));
  else el.style.removeProperty("--profile-line-height");
  el.classList.toggle("has-text-shadow", !!look.show_text_shadow);
  if (look.show_text_shadow) {
    const color = profileMixColor(look.text_shadow_color || "#000000", look.text_shadow_opacity);
    el.style.setProperty("--profile-text-shadow", look.text_shadow_x + "px " + look.text_shadow_y + "px " + look.text_shadow_blur + "px " + color);
  } else {
    el.style.removeProperty("--profile-text-shadow");
  }
}

function mountProfileFixedTitle(el, label) {
  const title = document.createElement("div");
  title.className = "profile-tile-head";
  title.textContent = label;
  const rule = document.createElement("div");
  rule.className = "profile-text-rule";
  el.appendChild(title);
  el.appendChild(rule);
}

function mountSteamTitle(el, tile, label, fallback) {
  const props = tile.props || {};
  if (props.show_title === false) {
    delete el.dataset.titleAlign;
    return;
  }
  const align = props.title_align === "left" || props.title_align === "center" || props.title_align === "right" ? props.title_align : fallback;
  el.dataset.titleAlign = align;
  mountProfileFixedTitle(el, label);
}

function profileFillPaint(chrome) {
  if (!chrome.show_background) return "";
  const opacity = clampProfilePercent(chrome.bg_opacity, 100);
  const first = profileMixColor(chrome.bg_color, opacity);
  if (chrome.bg_gradient && profileBorderColor(chrome.bg_color_2)) {
    return profileGradientPaint(chrome.bg_angle, first, profileMixColor(chrome.bg_color_2, opacity), chrome.bg_offset, chrome.bg_gradient_opacity);
  }
  if (profileBorderColor(chrome.bg_color) || opacity < 100) return first;
  return "";
}

function clearProfileRings(el) {
  el.classList.remove("has-widget-border", "has-gradient-border", "has-widget-frame", "has-widget-pad");
  el.style.boxShadow = "";
  ["--profile-widget-border-width", "--profile-widget-border-color", "--profile-widget-border-style", "--profile-border-paint", "--profile-frame-width", "--profile-frame-paint", "--profile-pad"].forEach((name) => {
    el.style.removeProperty(name);
  });
}

function applyProfileRing(el, className, width, paint, widthVar, paintVar) {
  el.classList.add(className);
  el.style.setProperty(widthVar, width + "px");
  el.style.setProperty(paintVar, paint);
}

function applyProfileFramePaint(el, chrome) {
  el.classList.remove("has-widget-frame");
  if (!chrome.show_frame) return;
  const second = profileBorderColor(chrome.frame_color_2);
  const paint = chrome.frame_gradient && second
    ? profileGradientPaint(chrome.frame_angle, chrome.frame_color, second, chrome.frame_offset, chrome.frame_gradient_opacity)
    : chrome.frame_color;
  applyProfileRing(el, "has-widget-frame", chrome.frame_width, paint, "--profile-frame-width", "--profile-frame-paint");
}

function applyProfileShadowPaint(el, chrome) {
  if (!chrome.show_shadow) {
    el.style.boxShadow = "";
    return;
  }
  const color = profileMixColor(chrome.shadow_color || "#000000", chrome.shadow_opacity);
  const inset = chrome.shadow_inset ? "inset " : "";
  el.style.boxShadow = inset + chrome.shadow_x + "px " + chrome.shadow_y + "px " + chrome.shadow_blur + "px " + chrome.shadow_spread + "px " + color;
}

function applyProfileShapePaint(el, chrome, type) {
  if (type !== "avatar" && chrome.radius != null) el.style.borderRadius = chrome.radius + "px";
  const frameW = chrome.show_frame ? chrome.frame_width : 0;
  const pad = Math.max(clampProfileSpan(chrome.pad, 0, 32), frameW);
  if (pad > 0 && type !== "avatar") {
    el.classList.add("has-widget-pad");
    el.style.setProperty("--profile-pad", pad + "px");
  }
}

function applyProfileBorderPaint(el, chrome) {
  el.classList.remove("has-widget-border", "has-gradient-border");
  el.style.removeProperty("--profile-widget-border-width");
  el.style.removeProperty("--profile-widget-border-color");
  el.style.removeProperty("--profile-widget-border-style");
  el.style.removeProperty("--profile-border-paint");
  if (!chrome.show_border) return;
  const second = profileBorderColor(chrome.border_color_2);
  if (chrome.border_gradient && second) {
    applyProfileRing(
      el,
      "has-gradient-border",
      chrome.border_width,
      profileGradientPaint(chrome.border_angle, chrome.border_color, second, chrome.border_offset, chrome.border_gradient_opacity),
      "--profile-widget-border-width",
      "--profile-border-paint"
    );
    return;
  }
  el.classList.add("has-widget-border");
  el.style.setProperty("--profile-widget-border-width", chrome.border_width + "px");
  el.style.setProperty("--profile-widget-border-color", chrome.border_color);
  el.style.setProperty("--profile-widget-border-style", chrome.border_style);
}

function applyProfileWidgetSurface(el, tile) {
  if (tile.type === "avatar" || tile.type === "banner") return;
  const chrome = profileTextChrome(tile.props, tile.type);
  clearProfileRings(el);
  el.style.background = "";
  el.style.borderRadius = "";
  if (tile.type !== "display_name") {
    el.classList.toggle("is-clear", !chrome.show_background);
    el.classList.toggle("has-surface", !!chrome.show_background);
    const fill = profileFillPaint(chrome);
    if (fill) el.style.background = fill;
  }
  applyProfileBorderPaint(el, chrome);
  applyProfileFramePaint(el, chrome);
  applyProfileShadowPaint(el, chrome);
  applyProfileShapePaint(el, chrome, tile.type);
}

function mountProfileTextChrome(el, tile) {
  const chrome = profileTextChrome(tile.props, tile.type);
  el.classList.add("is-text-chrome");
  applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  const shell = document.createElement("div");
  shell.className = "profile-text-shell";
  if (profileHasFixedTitle(tile.type)) {
    const title = document.createElement("div");
    title.className = "profile-text-title";
    title.textContent = tile.type === "bio" ? "About" : ((PROFILE_TILE_TYPES[tile.type] || {}).label || tile.type);
    const rule = document.createElement("div");
    rule.className = "profile-text-rule";
    shell.appendChild(title);
    shell.appendChild(rule);
  } else if (tile.type === "body" && tile.props && tile.props.show_title) {
    const titleText = String(tile.props.title || "").trim();
    if (titleText || (profileEditing && profileIsOwn)) {
      el.dataset.titleAlign = tile.props.title_align === "center" || tile.props.title_align === "right" ? tile.props.title_align : "left";
      const title = document.createElement("div");
      title.className = "profile-text-title" + (titleText ? "" : " is-empty");
      title.textContent = titleText || "Title";
      const rule = document.createElement("div");
      rule.className = "profile-text-rule";
      shell.appendChild(title);
      shell.appendChild(rule);
    }
  }
  const slot = document.createElement("div");
  slot.className = "profile-text-slot";
  shell.appendChild(slot);
  el.appendChild(shell);
  return slot;
}

function applyProfileTileBorder(el, tile, face) {
  const target = face || el;
  const chrome = profileTextChrome(tile.props, tile.type);
  clearProfileRings(target);
  const gradientBorder = !!(chrome.show_border && chrome.border_gradient && profileBorderColor(chrome.border_color_2));
  if (gradientBorder) {
    target.style.border = "none";
    applyProfileBorderPaint(target, chrome);
  } else if (chrome.show_border) {
    target.style.border = chrome.border_width + "px " + chrome.border_style + " " + chrome.border_color;
  } else {
    target.style.border = "";
  }
  applyProfileFramePaint(target, chrome);
  applyProfileShadowPaint(target, chrome);
  if (tile.type === "banner") applyProfileShapePaint(target, chrome, tile.type);
}

function profileOwnerStatus() {
  return (profileUser && profileUser.status) || "";
}

function profileOwnerPronouns() {
  return (profileUser && profileUser.pronouns) || "";
}

function profileOwnerAliases() {
  const names = (profileUser && profileUser.aliases) || [];
  const current = profileOwnerName();
  return names.filter(name => name && name !== current);
}

function profileOwnerMemberSince() {
  const raw = profileUser && profileUser.member_since;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function profileOwnerName() {
  if (!profileUser) return myDisplayName || myUsername || "—";
  return profileUser.display_name || profileUser.username || "—";
}

function profileOwnerHandle() {
  if (!profileUser) return myUsername || "";
  return profileUser.username || "";
}

function clampProfileEntrySize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function clampProfileZIndex(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function profileTileZIndex(tile) {
  if (!tile) return 0;
  if (tile.z_index != null) return clampProfileZIndex(tile.z_index);
  return clampProfileZIndex(tile.props && tile.props.z_index);
}

function profileTilesForPaint(tiles) {
  return (tiles || []).map((tile, index) => ({ tile, index })).sort((a, b) => {
    const za = profileTileZIndex(a.tile);
    const zb = profileTileZIndex(b.tile);
    if (za !== zb) return za - zb;
    return a.index - b.index;
  });
}

function profileIconEmoji(value) {
  const text = String(value || "").trim();
  if (!text) return "⭐";
  if (typeof EMOJI_CHARS_DESC !== "undefined") {
    for (let i = 0; i < EMOJI_CHARS_DESC.length; i++) {
      const ch = EMOJI_CHARS_DESC[i];
      if (ch && text.indexOf(ch) !== -1) return ch;
    }
  }
  const chars = Array.from(text);
  return chars[0] || "⭐";
}

function applyProfileEntrySize(el, size, iconVar, textVar) {
  const n = clampProfileEntrySize(size);
  el.style.setProperty(iconVar, (14 + n * 2) + "px");
  el.style.setProperty(textVar, (10.5 + n * 0.7) + "px");
}

function clampProfileLinkSize(value) {
  return clampProfileEntrySize(value);
}

function applyProfileLinkSize(el, tile) {
  applyProfileEntrySize(el, tile.props && tile.props.link_size, "--profile-link-icon", "--profile-link-text");
}

function applyProfileFriendSize(el, tile) {
  applyProfileEntrySize(el, tile.props && tile.props.friend_size, "--profile-friend-icon", "--profile-friend-text");
}

function applyProfileIconSize(el, tile) {
  const n = clampProfileEntrySize(tile.props && tile.props.icon_size);
  el.style.setProperty("--profile-icon-glyph", (20 + n * 8) + "px");
}

function profilePlatformLetter(name) {
  if (name === "Battle.net") return "Bn";
  if (name === "PlayStation") return "PS";
  if (name === "Crunchyroll") return "Cr";
  if (name === "GitHub") return "GH";
  if (name === "TikTok") return "TT";
  if (name === "Twitch") return "Tw";
  if (name === "Instagram") return "Ig";
  if (name === "Spotify") return "Sp";
  return (name || "?").slice(0, 1);
}

function profileStripOrientation(type, props, w, h) {
  if (type !== "divider" && type !== "rail") return "";
  if (props && props.orientation === "vertical") return "vertical";
  if (props && props.orientation === "horizontal") return "horizontal";
  if (Number(w) === 1 && Number(h) > 1) return "vertical";
  return "horizontal";
}

function rotateProfileStrip(tile) {
  if (tile.type !== "divider" && tile.type !== "rail") return;
  tile.props = defaultProfileTileProps(tile.type, tile.props);
  const vertical = profileStripOrientation(tile.type, tile.props, tile.w, tile.h) === "vertical";
  const long = vertical ? tile.h : tile.w;
  tile.props.orientation = vertical ? "horizontal" : "vertical";
  if (tile.props.orientation === "vertical") {
    tile.w = 1;
    tile.h = long;
  } else {
    tile.h = 1;
    tile.w = long;
  }
  const size = clampProfileTileSize(tile.type, tile.w, tile.h, tile.x, tile);
  tile.w = size.w;
  tile.h = size.h;
  if (tile.x + tile.w > PROFILE_COLS) tile.x = Math.max(0, PROFILE_COLS - tile.w);
}

function paintProfileDivider(tile, el) {
  applyProfileWidgetSurface(el, tile);
  const vertical = profileStripOrientation(tile.type, tile.props, tile.w, tile.h) === "vertical";
  const style = (tile.props && tile.props.style) || "solid";
  const line = document.createElement("div");
  line.className = "profile-divider is-" + style + (vertical ? " is-vertical" : "");
  el.appendChild(line);
}

function paintProfileRail(tile, el) {
  applyProfileWidgetSurface(el, tile);
  const props = defaultProfileTileProps("rail", tile.props);
  const vertical = profileStripOrientation("rail", props, tile.w, tile.h) === "vertical";
  const bar = document.createElement("div");
  bar.className = "profile-rail is-" + (props.style || "solid") + (vertical ? " is-vertical" : " is-horizontal");
  bar.style.setProperty("--profile-rail-thickness", (props.thickness || 4) + "px");
  bar.style.setProperty("--profile-rail-color", props.color || "#ffffff");
  el.appendChild(bar);
}

function paintProfileLinkTree(tile, el) {
  applyProfileWidgetSurface(el, tile);
  applyProfileLinkSize(el, tile);
  mountProfileFixedTitle(el, "Links");
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const links = Array.isArray(tile.props && tile.props.links) ? tile.props.links : [];
  if (!links.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = profileEditing ? "Right-click, then Options, to add links." : "No links yet.";
    body.appendChild(empty);
  } else {
    links.forEach(row => {
      const item = document.createElement(profileEditing ? "div" : "a");
      item.className = "profile-link-row";
      if (!profileEditing) {
        item.href = row.url;
        item.target = "_blank";
        item.rel = "noopener noreferrer";
      }
      const icon = document.createElement("div");
      icon.className = "avatar-dot";
      icon.textContent = profilePlatformLetter(row.platform);
      const label = document.createElement("div");
      label.className = "profile-link-label";
      const site = row.platform || "Link";
      const who = (row.username || "").trim();
      label.textContent = who ? site + " | " + who : site;
      item.appendChild(icon);
      item.appendChild(label);
      body.appendChild(item);
    });
  }
  el.appendChild(body);
}

function profileCleanHttpUrl(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (text.indexOf("://") < 0) text = "https://" + text;
  const lower = text.toLowerCase();
  if (lower.indexOf("https://") !== 0 && lower.indexOf("http://") !== 0) return "";
  if (/[\s<>"']/.test(text)) return "";
  return text;
}

function profileVisiblePages() {
  const layout = profileDraft || profileSavedLayout || { pages: [] };
  return (layout.pages || []).filter(page => page.visibility !== "owner" || profileIsOwn);
}

function profileSwitchPage(pageId) {
  const page = profileVisiblePages().find(row => row.id === pageId);
  if (!page) return;
  profileActivePageId = page.id;
  if (typeof renderProfilePages === "function") renderProfilePages();
  renderProfileBoard();
}

function profileButtonLabel(tile, relation) {
  const props = tile.props || {};
  const custom = String(props.label || "Button").trim() || "Button";
  if (props.action !== "friend") return custom;
  if (relation && relation.friend) return "Friends";
  if (relation && relation.pending_out) return "Pending";
  return custom;
}

function bindProfileButtonAction(btn, tile) {
  const props = tile.props || {};
  const preview = btn.closest(".profile-opt-preview");
  const editing = !!(profileEditing && profileIsOwn);
  if (preview || editing) {
    btn.disabled = true;
    return;
  }
  if (props.action === "link") {
    const url = profileCleanHttpUrl(props.url);
    if (!url) {
      btn.disabled = true;
      return;
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  if (props.action === "page") {
    const page = profileVisiblePages().find(row => row.id === props.page_id);
    if (!page) {
      btn.disabled = true;
      return;
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      profileSwitchPage(page.id);
    });
    return;
  }
  if (props.action === "friend") {
    if (profileIsOwn || !profileOwnerId) {
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    const run = async () => {
      if (typeof fetchRelationship !== "function") return;
      const relation = await fetchRelationship(profileOwnerId);
      btn.textContent = profileButtonLabel(tile, relation);
      if (relation.self || relation.friend || relation.pending_out || relation.blocked) {
        btn.disabled = true;
        return;
      }
      btn.disabled = false;
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.disabled = true;
        const username = profileOwnerHandle();
        if (typeof addFriendFromContextMenu === "function" && username) {
          await addFriendFromContextMenu(username);
        }
        const next = typeof fetchRelationship === "function"
          ? await fetchRelationship(profileOwnerId)
          : {};
        btn.textContent = profileButtonLabel(tile, next);
        if (next.friend || next.pending_out || next.self) btn.disabled = true;
        else btn.disabled = false;
      });
    };
    run();
  }
}

function paintProfileButton(tile, el) {
  const chrome = profileTextChrome(tile.props, tile.type);
  el.classList.add("is-text-chrome");
  applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "profile-action-btn";
  btn.textContent = profileButtonLabel(tile, null);
  bindProfileButtonAction(btn, tile);
  el.appendChild(btn);
}

function profileTimezoneGuess() {
  try {
    return (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || "";
  } catch (e) {
    return "";
  }
}

function profileTimezoneValid(zone) {
  const name = String(zone || "").trim();
  if (!name) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name }).format(new Date());
    return true;
  } catch (e) {
    return false;
  }
}

function profileTimezoneTime(zone, hour12) {
  if (!profileTimezoneValid(zone)) return "";
  try {
    return new Date().toLocaleTimeString(hour12 ? "en-US" : "en-GB", {
      timeZone: zone,
      hour: hour12 ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12: !!hour12
    });
  } catch (e) {
    return "";
  }
}

function profileLocalTimeHour12(format) {
  if (format === "24") return false;
  if (format === "12") return true;
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (opts.hourCycle === "h23" || opts.hourCycle === "h24") return false;
    if (opts.hourCycle === "h11" || opts.hourCycle === "h12") return true;
    return opts.hour12 !== false;
  } catch (e) {
    return true;
  }
}

const PROFILE_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function profileLocalDateText(zone, monthStyle, yearStyle) {
  if (!profileTimezoneValid(zone)) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "numeric",
      day: "numeric",
      year: "numeric"
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(part => { map[part.type] = part.value; });
    const monthNum = Number(map.month);
    const month = monthStyle === "name" ? (PROFILE_MONTH_NAMES[monthNum - 1] || map.month) : String(monthNum);
    const year = yearStyle === "2" ? String(map.year).slice(-2) : map.year;
    if (monthStyle === "name") return month + " " + map.day + ", " + year;
    return month + "/" + map.day + "/" + year;
  } catch (e) {
    return "";
  }
}

function profileLocalTimeZone(tile) {
  if (profileIsOwn) {
    const guess = profileTimezoneGuess();
    if (profileTimezoneValid(guess)) return guess;
  }
  return String((tile && tile.props && tile.props.timezone) || "").trim();
}

function stampOwnLocalTimeTimezone(layout) {
  if (!profileIsOwn || !layout) return;
  const zone = profileTimezoneGuess();
  if (!profileTimezoneValid(zone)) return;
  (layout.pages || []).forEach(page => {
    (page.tiles || []).forEach(tile => {
      if (tile.type === "details") tile.type = "local_time";
      if (tile.type !== "local_time") return;
      tile.props = defaultProfileTileProps("local_time", Object.assign({}, tile.props || {}, { timezone: zone }));
    });
  });
}

let profileLocalTimeClock = 0;

function profilePad2(n) {
  return String(n).padStart(2, "0");
}

function profileDurationText(ms, ended, showSeconds) {
  if (ended && ms <= 0) return "Ended";
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  let text = days > 0
    ? days + "d " + profilePad2(hours) + ":" + profilePad2(minutes)
    : profilePad2(hours) + ":" + profilePad2(minutes);
  if (showSeconds) text += ":" + profilePad2(seconds);
  return text;
}

function tickProfileInstrumentClocks() {
  document.querySelectorAll(".profile-clock-live").forEach(el => {
    const mode = el.dataset.mode;
    if (mode === "world") {
      const time = profileTimezoneTime(el.dataset.zone, profileLocalTimeHour12(el.dataset.format));
      if (time) el.textContent = time;
      return;
    }
    const at = Date.parse(el.dataset.at || "");
    if (!Number.isFinite(at)) return;
    const showSeconds = el.dataset.seconds === "1";
    if (mode === "countdown") el.textContent = profileDurationText(at - Date.now(), true, showSeconds);
    if (mode === "timer") el.textContent = profileDurationText(Date.now() - at, false, showSeconds);
  });
}

function tickProfileLocalTimeClocks() {
  document.querySelectorAll(".profile-local-clock[data-zone]").forEach(el => {
    const time = profileTimezoneTime(el.dataset.zone, profileLocalTimeHour12(el.dataset.format));
    if (time) el.textContent = time;
  });
  document.querySelectorAll(".profile-local-date[data-zone]").forEach(el => {
    const date = profileLocalDateText(el.dataset.zone, el.dataset.month, el.dataset.year);
    if (date) el.textContent = date;
  });
  tickProfileInstrumentClocks();
}

function syncProfileLocalTimeClock() {
  if (profileLocalTimeClock) {
    clearInterval(profileLocalTimeClock);
    profileLocalTimeClock = 0;
  }
  if (!document.querySelector(".profile-local-clock[data-zone], .profile-clock-live")) return;
  tickProfileLocalTimeClocks();
  profileLocalTimeClock = setInterval(tickProfileLocalTimeClocks, 1000);
}

function paintProfileLocalTime(tile, el) {
  const chrome = profileTextChrome(tile.props, tile.type);
  el.classList.add("is-text-chrome");
  applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const zone = profileLocalTimeZone(tile);
  const props = tile.props || {};
  if (profileTimezoneValid(zone)) {
    const clock = document.createElement("div");
    clock.className = "profile-local-clock";
    clock.dataset.zone = zone;
    clock.dataset.format = props.time_format === "24" || props.time_format === "system" ? props.time_format : "12";
    clock.textContent = profileTimezoneTime(zone, profileLocalTimeHour12(clock.dataset.format));
    body.appendChild(clock);
    if (props.show_date) {
      const date = document.createElement("div");
      date.className = "profile-local-date";
      date.dataset.zone = zone;
      date.dataset.month = props.month_style === "name" ? "name" : "num";
      date.dataset.year = props.year_style === "2" ? "2" : "full";
      date.textContent = profileLocalDateText(zone, date.dataset.month, date.dataset.year);
      body.appendChild(date);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "profile-local-empty";
    empty.textContent = profileIsOwn ? "Could not read your local time." : "Time unavailable.";
    body.appendChild(empty);
  }
  el.appendChild(body);
  syncProfileLocalTimeClock();
}

function paintProfileIcon(tile, el) {
  applyProfileWidgetSurface(el, tile);
  applyProfileIconSize(el, tile);
  const body = document.createElement("div");
  body.className = "profile-tile-body profile-icon-body";
  const glyph = document.createElement("div");
  glyph.className = "profile-icon-glyph";
  glyph.textContent = profileIconEmoji(tile.props && tile.props.emoji);
  body.appendChild(glyph);
  el.appendChild(body);
}

function profileImageSrc(props) {
  const row = props || {};
  const src = String(row.url || "").trim();
  return src;
}

function paintProfileImage(tile, el) {
  applyProfileWidgetSurface(el, tile);
  const src = profileImageSrc(tile.props);
  const name = String((tile.props && tile.props.name) || "Image");
  if (!src) {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = profileEditing && profileIsOwn ? "Choose an image in Options." : "";
    el.appendChild(empty);
    return;
  }
  const img = document.createElement("img");
  img.className = "profile-tile-image";
  img.src = src;
  img.alt = name;
  img.draggable = false;
  el.appendChild(img);
}

function paintProfileMusic(tile, el) {
  applyProfileWidgetSurface(el, tile);
  if (typeof mountOneiraMusicPlayer !== "function") {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = "Player is missing.";
    el.appendChild(empty);
    return;
  }
  const props = tile.props || {};
  const tracks = (Array.isArray(props.tracks) ? props.tracks : []).filter((row) => {
    if (!row || (row.source && row.source !== "file")) return false;
    return !!String(row.url || "").trim();
  });
  mountOneiraMusicPlayer(el, { tracks });
}

function paintProfileEmbed(tile, el) {
  applyProfileWidgetSurface(el, tile);
  if (typeof mountOneiraEmbed !== "function") {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = "Embed is missing.";
    el.appendChild(empty);
    return;
  }
  mountOneiraEmbed(el, {
    url: String((tile.props && tile.props.url) || ""),
    editOverlay: !!(profileEditing && profileIsOwn)
  });
}

function paintProfileGallery(tile, el) {
  applyProfileWidgetSurface(el, tile);
  if (typeof mountOneiraGallery !== "function") {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = "Gallery is missing.";
    el.appendChild(empty);
    return;
  }
  const props = tile.props || {};
  mountOneiraGallery(el, {
    items: Array.isArray(props.items) ? props.items : [],
    mode: props.mode,
    transition: props.transition,
    speed: props.speed,
    shuffle: props.shuffle,
    editHint: !!(profileEditing && profileIsOwn)
  });
}

function paintProfileComments(tile, el) {
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : null;
  if (chrome) applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  if (typeof mountProfileComments !== "function") {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = "Comments is missing.";
    el.appendChild(empty);
    return;
  }
  mountProfileComments(el, tile);
}

function displayServerIdOk(code) {
  return /^[234679ACDEFGHJKLMNPQRTUVWXYZ]{10}$/.test(String(code || ""));
}

function paintProfileDisplayServer(tile, el) {
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : null;
  if (chrome) applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  const props = defaultProfileTileProps("display_server", tile.props);
  const head = document.createElement("div");
  head.className = "oneira-wall-head";
  const title = document.createElement("div");
  title.className = "oneira-wall-title";
  title.textContent = props.title || "Server List";
  head.appendChild(title);
  const rule = document.createElement("div");
  rule.className = "oneira-wall-rule";
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const empty = document.createElement("div");
  empty.className = "settings-opt-desc";
  empty.textContent = props.server_ids.length ? "Loading servers…" : "No servers selected.";
  body.appendChild(empty);
  el.appendChild(head);
  el.appendChild(rule);
  el.appendChild(body);
  if (!props.server_ids.length || !profileOwnerId) return;
  const stamp = (el._displayServerStamp || 0) + 1;
  el._displayServerStamp = stamp;
  const qs = props.server_ids.filter(displayServerIdOk).join(",");
  fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(profileOwnerId) + "/pinned_servers?ids=" + encodeURIComponent(qs), { credentials: "include" })
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((data) => {
      if (el._displayServerStamp !== stamp) return;
      const rows = (data && data.servers) || [];
      body.innerHTML = "";
      if (!rows.length) {
        const note = document.createElement("div");
        note.className = "settings-opt-desc";
        note.textContent = "No servers to show.";
        body.appendChild(note);
        return;
      }
      rows.forEach((server) => {
        const row = document.createElement("div");
        row.className = "profile-friend-row profile-server-row";
        const dot = document.createElement("div");
        dot.className = "avatar-dot";
        if (server.icon_url) {
          dot.style.backgroundImage = "url(" + JSON.stringify(server.icon_url) + ")";
          dot.style.backgroundSize = "cover";
          dot.style.backgroundPosition = "center";
        } else {
          dot.textContent = typeof serverAvatarLetters === "function" ? serverAvatarLetters(server.name) : String(server.name || "?").slice(0, 2);
        }
        const name = document.createElement("div");
        name.className = "profile-friend-name";
        name.textContent = server.name || "Server";
        row.appendChild(dot);
        row.appendChild(name);
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          if (profileEditing && profileIsOwn) return;
          if (el.classList.contains("is-opt-preview")) return;
          const mine = Array.isArray(serverList) && serverList.some((item) => item.id === server.id);
          if (!mine || typeof openServer !== "function") return;
          const icon = document.querySelector('.server-icon[data-server-id="' + server.id + '"]');
          if (!icon) return;
          openServer(server.id, icon);
        });
        body.appendChild(row);
      });
    })
    .catch(() => {
      if (el._displayServerStamp !== stamp) return;
      empty.textContent = "Could not load those servers.";
    });
}

function paintProfileVideo(tile, el) {
  applyProfileWidgetSurface(el, tile);
  if (typeof mountOneiraPlayer !== "function") {
    const empty = document.createElement("div");
    empty.className = "profile-image-empty";
    empty.textContent = "Player is missing.";
    el.appendChild(empty);
    return;
  }
  mountOneiraPlayer(el, {
    src: profileImageSrc(tile.props),
    name: String((tile.props && tile.props.name) || ""),
    stageIsDrag: !!(profileEditing && profileIsOwn),
    transparent: !!(tile.props && tile.props.transparent_player),
    showWhenPaused: !(tile.props && tile.props.show_player_when_paused === false)
  });
}

function paintProfileClock(tile, el) {
  const chrome = profileTextChrome(tile.props, "clock");
  el.classList.add("is-text-chrome");
  applyProfileTextPaint(el, chrome);
  applyProfileWidgetSurface(el, tile);
  const props = tile.props || {};
  const mode = props.mode === "countdown" || props.mode === "timer" ? props.mode : "world";
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  if (props.label) {
    const label = document.createElement("div");
    label.className = "profile-clock-label";
    label.textContent = props.label;
    body.appendChild(label);
  }
  const face = document.createElement("div");
  face.className = "profile-clock-live";
  face.dataset.mode = mode;
  if (mode === "world") {
    const zone = String(props.timezone || "").trim();
    if (profileTimezoneValid(zone)) {
      face.dataset.zone = zone;
      face.dataset.format = props.time_format === "24" || props.time_format === "system" ? props.time_format : "12";
      face.textContent = profileTimezoneTime(zone, profileLocalTimeHour12(face.dataset.format));
      body.appendChild(face);
      if (props.show_date) {
        const date = document.createElement("div");
        date.className = "profile-local-date";
        date.dataset.zone = zone;
        date.dataset.month = props.month_style === "name" ? "name" : "num";
        date.dataset.year = props.year_style === "2" ? "2" : "full";
        date.textContent = profileLocalDateText(zone, date.dataset.month, date.dataset.year);
        body.appendChild(date);
      }
      if (props.show_zone) {
        const zoneEl = document.createElement("div");
        zoneEl.className = "profile-clock-zone";
        zoneEl.textContent = profileClockCityName(zone);
        body.appendChild(zoneEl);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "profile-local-empty";
      empty.textContent = "Pick a timezone in Options.";
      body.appendChild(empty);
    }
  } else if (mode === "countdown") {
    const at = Date.parse(props.target_at || "");
    if (Number.isFinite(at)) {
      face.dataset.at = props.target_at;
      face.dataset.seconds = props.show_seconds ? "1" : "0";
      face.textContent = profileDurationText(at - Date.now(), true, !!props.show_seconds);
      body.appendChild(face);
    } else {
      const empty = document.createElement("div");
      empty.className = "profile-local-empty";
      empty.textContent = "Set a date in Options.";
      body.appendChild(empty);
    }
  } else {
    const at = Date.parse(props.start_at || "");
    if (Number.isFinite(at)) {
      face.dataset.at = props.start_at;
      face.dataset.seconds = props.show_seconds ? "1" : "0";
      face.textContent = profileDurationText(Date.now() - at, false, !!props.show_seconds);
      body.appendChild(face);
    } else {
      const empty = document.createElement("div");
      empty.className = "profile-local-empty";
      empty.textContent = "Set a start time in Options.";
      body.appendChild(empty);
    }
  }
  el.appendChild(body);
  syncProfileLocalTimeClock();
}

function paintProfileFriends(host) {
  const people = profileFriends || [];
  if (!people.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = "No friends to show yet.";
    host.appendChild(empty);
    return;
  }
  people.forEach(person => {
    const row = document.createElement("div");
    row.className = "profile-friend-row";
    const dot = document.createElement("div");
    dot.className = "avatar-dot";
    const shown = person.display_name || person.username || "?";
    if (typeof paintUserFace === "function") paintUserFace(dot, person, { name: shown, userId: person.id });
    else dot.textContent = typeof avatarLetter === "function" ? avatarLetter(shown) : shown.slice(0, 1);
    const name = document.createElement("div");
    name.className = "profile-friend-name";
    name.textContent = shown;
    row.appendChild(dot);
    row.appendChild(name);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (person.id && typeof openUserProfile === "function") openUserProfile(person.id);
    });
    host.appendChild(row);
  });
}

function profileTileIsText(type) {
  return type === "header" || type === "body" || type === "footnote" || type === "list" || type === "bio" || type === "spoiler";
}

function bindProfileTextField(area, tile, onValue) {
  area.addEventListener("pointerdown", (e) => {
    const host = area.closest(".profile-tile");
    if (host && host.classList.contains("is-typing")) e.stopPropagation();
  });
  area.addEventListener("blur", () => {
    setTimeout(() => {
      const host = area.closest(".profile-tile");
      if (!host) return;
      const active = document.activeElement;
      if (active && host.contains(active) && active.matches("textarea, input")) return;
      host.classList.remove("is-typing");
    }, 0);
  });
  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") area.blur();
    e.stopPropagation();
  });
  area.addEventListener("input", () => {
    tile.props = tile.props || {};
    onValue(area.value);
    profileDirty = true;
  });
}

function armProfileTileTyping(el) {
  const area = el.querySelector("textarea, input");
  if (!area) return;
  el.classList.add("is-typing");
  area.focus();
  const len = area.value.length;
  if (typeof area.setSelectionRange === "function") area.setSelectionRange(len, len);
}

function paintProfileHeader(tile, el) {
  const level = Math.max(1, Math.min(3, Number((tile.props && tile.props.level) || 1)));
  const text = (tile.props && tile.props.text) || "";
  if (profileEditing && profileIsOwn) {
    const area = document.createElement("textarea");
    area.className = "profile-tile-header is-level-" + level;
    area.value = text;
    area.maxLength = 120;
    area.placeholder = "Header";
    area.rows = 1;
    bindProfileTextField(area, tile, (value) => { tile.props.text = value; });
    el.appendChild(area);
    return;
  }
  const node = document.createElement("div");
  node.className = "profile-tile-header is-level-" + level;
  node.textContent = text || "Header";
  if (!text) node.classList.add("is-empty");
  el.appendChild(node);
}

function paintProfileCopy(tile, el, kind) {
  const text = (tile.props && tile.props.text) || "";
  const max = kind === "footnote" ? 300 : 1000;
  const emptyLabel = kind === "footnote" ? "Footnote" : kind === "bio" ? "Write something about yourself." : "Write something.";
  if (profileEditing && profileIsOwn) {
    const area = document.createElement("textarea");
    area.className = kind === "footnote" ? "profile-tile-footnote" : "profile-tile-copy";
    area.value = text;
    area.maxLength = max;
    area.placeholder = emptyLabel;
    bindProfileTextField(area, tile, (value) => { tile.props.text = value; });
    el.appendChild(area);
    return;
  }
  const node = document.createElement("div");
  node.className = kind === "footnote" ? "profile-tile-footnote" : "profile-tile-copy";
  node.textContent = text || (kind === "bio" ? "No bio yet." : emptyLabel);
  if (!text) node.classList.add("is-empty");
  el.appendChild(node);
}

function paintProfileList(tile, el) {
  const items = Array.isArray(tile.props && tile.props.items) ? tile.props.items : [];
  const style = (tile.props && tile.props.style) === "number" ? "number" : "bullet";
  if (profileEditing && profileIsOwn) {
    const area = document.createElement("textarea");
    area.className = "profile-tile-list-edit";
    area.value = items.join("\n");
    area.placeholder = "One item per line";
    bindProfileTextField(area, tile, (value) => {
      tile.props.items = value.split("\n").slice(0, 20);
    });
    el.appendChild(area);
    return;
  }
  const shown = items.map(row => String(row || "").trim()).filter(Boolean);
  const list = document.createElement(style === "number" ? "ol" : "ul");
  list.className = "profile-tile-list is-" + style;
  if (!shown.length) {
    const empty = document.createElement("li");
    empty.className = "is-empty";
    empty.textContent = "Empty list.";
    list.appendChild(empty);
  } else {
    shown.forEach(row => {
      const item = document.createElement("li");
      item.textContent = row;
      list.appendChild(item);
    });
  }
  el.appendChild(list);
}

function paintProfileSpoiler(tile, el) {
  const title = (tile.props && tile.props.title) || "";
  const text = (tile.props && tile.props.text) || "";
  if (profileEditing && profileIsOwn) {
    const head = document.createElement("input");
    head.type = "text";
    head.className = "profile-spoiler-title";
    head.maxLength = 80;
    head.placeholder = "Spoiler title";
    head.value = title;
    bindProfileTextField(head, tile, (value) => { tile.props.title = value; });
    const area = document.createElement("textarea");
    area.className = "profile-spoiler-copy";
    area.maxLength = 1000;
    area.placeholder = "Hidden until someone opens this.";
    area.value = text;
    bindProfileTextField(area, tile, (value) => { tile.props.text = value; });
    el.appendChild(head);
    el.appendChild(area);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "profile-spoiler";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "profile-spoiler-title";
  toggle.textContent = title || "Spoiler";
  if (!title) toggle.classList.add("is-empty");
  const body = document.createElement("div");
  body.className = "profile-spoiler-copy";
  body.textContent = text || "Nothing hidden yet.";
  if (!text) body.classList.add("is-empty");
  let open = !!(tile.props && tile.props.start_open);
  function paintOpen() {
    wrap.classList.toggle("is-open", open);
    body.hidden = !open;
  }
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    open = !open;
    paintOpen();
  });
  paintOpen();
  wrap.appendChild(toggle);
  wrap.appendChild(body);
  el.appendChild(wrap);
}

function paintProfilePlaceholder(tile, el) {
  const meta = PROFILE_TILE_TYPES[tile.type] || { label: "Element" };
  const emptyInView = tile.type === "frame" || tile.type === "color_block" || tile.type === "meter";
  el.classList.add("is-placeholder");
  if (emptyInView && !(profileEditing && profileIsOwn)) return;
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = meta.label;
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const note = document.createElement("div");
  note.className = "profile-placeholder-note";
  note.textContent = "Placeholder. This piece isn't wired yet.";
  body.appendChild(note);
  el.appendChild(head);
  el.appendChild(body);
}

let steamCardOwnerId = "";
let steamCardData = null;
let steamCardLoad = null;
let steamPlayingOwnerId = "";
let steamPlayingData = null;
let steamPlayingLoad = null;
let steamPlayingTimer = null;
let steamRecentOwnerId = "";
let steamRecentData = null;
let steamRecentLoad = null;
let steamLibraryOwnerId = "";
let steamLibraryData = null;
let steamLibraryLoad = null;
const steamLibraryPage = {};
let steamAchieveOwnerId = "";
let steamAchieveData = null;
let steamAchieveLoad = null;
let steamAchieveQueued = null;
let steamAchieveFill = null;
const steamAchievePage = {};

function ensureSteamCard() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (!steamPlayingTimer) steamPlayingTimer = setInterval(refreshSteamSurfaces, 300000);
  if (steamCardOwnerId === id && (steamCardData || steamCardLoad)) return;
  steamCardOwnerId = id;
  steamCardData = null;
  steamCardLoad = fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + "/steam_card", { credentials: "include" })
    .then(response => response.ok ? response.json() : { linked: false })
    .then(data => { steamCardData = data || { linked: false }; })
    .catch(() => { steamCardData = { linked: false }; })
    .finally(() => {
      steamCardLoad = null;
      if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") === id && typeof renderProfileBoard === "function") {
        renderProfileBoard();
      }
    });
}

function steamFlag(props, key, fallback) {
  if (!props || props[key] == null) return fallback;
  return !!props[key];
}

function steamDateText(unix) {
  const n = Number(unix);
  if (!n) return "";
  const date = new Date(n * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function steamCountryName(code) {
  const text = String(code || "").trim();
  if (!text) return "";
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(text.toUpperCase()) || text;
  } catch (e) {
    return text;
  }
}

function steamProfileNote(text) {
  const note = document.createElement("div");
  note.className = "steam-profile-note";
  note.textContent = text;
  return note;
}

function paintSteamProfile(tile, el) {
  applyProfileWidgetSurface(el, tile);
  mountSteamTitle(el, tile, "Steam profile", "center");
  const card = document.createElement("div");
  card.className = "steam-profile-card";
  const owner = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!steamCardData || steamCardOwnerId !== owner) {
    ensureSteamCard();
    el.appendChild(card);
    return;
  }
  const data = steamCardData;
  const props = tile.props || {};
  if (!data.linked) {
    card.appendChild(steamProfileNote("Connect Steam to show this."));
    el.appendChild(card);
    return;
  }
  const avail = data.available || {};
  const identityOn = data.identity !== false;
  const levelOn = data.level !== false;
  if (!identityOn && !levelOn) {
    card.appendChild(steamProfileNote("Turn on Identity and Level and badges for Steam."));
    el.appendChild(card);
    return;
  }
  if (identityOn) {
    const top = document.createElement("div");
    top.className = "steam-profile-top";
    const showAvatar = steamFlag(props, "show_avatar", true) && avail.avatar !== false && data.avatar;
    const showLevel = steamFlag(props, "show_level", true) && avail.level && levelOn && data.player_level != null;
    if (showAvatar || showLevel) {
      const face = document.createElement("div");
      face.className = "steam-profile-face";
      if (showAvatar) {
        const img = document.createElement("img");
        img.className = "steam-profile-avatar";
        img.src = data.avatar;
        img.alt = "";
        img.draggable = false;
        face.appendChild(img);
      }
      if (showLevel) {
        const badge = document.createElement("span");
        badge.className = "steam-profile-level";
        badge.textContent = String(data.player_level);
        face.appendChild(badge);
      }
      top.appendChild(face);
    }
    const who = document.createElement("div");
    who.className = "steam-profile-who";
    if (steamFlag(props, "show_name", true) && avail.name !== false && data.name) {
      const name = document.createElement("div");
      name.className = "steam-profile-name";
      name.textContent = data.name;
      who.appendChild(name);
    }
    if (steamFlag(props, "show_online", true) && avail.online) {
      const status = document.createElement("div");
      status.className = "steam-profile-status";
      const dot = document.createElement("span");
      const state = Number(data.persona_state);
      const offline = state === 0;
      dot.className = "steam-profile-dot" + (offline ? "" : " is-online");
      const label = document.createElement("span");
      label.className = "steam-profile-status-text";
      if (offline) {
        const when = steamDateText(data.last_logoff);
        label.textContent = when ? ("Offline | Last online : " + when) : "Offline";
      } else {
        label.textContent = "Online";
      }
      status.appendChild(dot);
      status.appendChild(label);
      who.appendChild(status);
    }
    if (steamFlag(props, "show_link", true) && avail.link !== false && data.profile_url) {
      const link = document.createElement("a");
      link.className = "steam-profile-link";
      link.href = data.profile_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = String(data.profile_url).replace(/^https?:\/\//, "").replace(/\/$/, "");
      link.addEventListener("pointerdown", (e) => e.stopPropagation());
      who.appendChild(link);
    }
    if (who.childNodes.length) top.appendChild(who);
    if (top.childNodes.length) card.appendChild(top);
    const lines = document.createElement("div");
    lines.className = "steam-profile-lines";
    if (steamFlag(props, "show_created", true) && avail.created) {
      const line = document.createElement("div");
      line.textContent = "Account created · " + steamDateText(data.time_created);
      lines.appendChild(line);
    }
    const place = [];
    if (steamFlag(props, "show_state", false) && avail.state && data.state) place.push(data.state);
    if (steamFlag(props, "show_country", false) && avail.country && data.country) place.push(steamCountryName(data.country));
    if (place.length) {
      const line = document.createElement("div");
      line.textContent = place.join(", ");
      lines.appendChild(line);
    }
    if (lines.childNodes.length) card.appendChild(lines);
  } else {
    card.appendChild(steamProfileNote("Turn on Identity for Steam."));
  }
  if (levelOn && !identityOn && steamFlag(props, "show_level", true) && avail.level && data.player_level != null) {
    const badge = document.createElement("span");
    badge.className = "steam-profile-level is-alone";
    badge.textContent = String(data.player_level);
    card.appendChild(badge);
  }
  const showXp = steamFlag(props, "show_xp", true) && avail.xp && avail.xp_next && levelOn;
  if (levelOn) {
    if (showXp && data.player_xp != null && data.xp_to_next != null) {
      const block = document.createElement("div");
      block.className = "steam-profile-xp";
      const track = document.createElement("div");
      track.className = "steam-profile-xp-track";
      const fill = document.createElement("div");
      fill.className = "steam-profile-xp-fill";
      let pct = 0;
      const xp = Number(data.player_xp);
      const toNext = Number(data.xp_to_next);
      const floor = Number(data.xp_floor);
      if (data.xp_floor != null && toNext >= 0) {
        const into = Math.max(0, xp - floor);
        const span = into + toNext;
        pct = span ? Math.max(0, Math.min(100, Math.round(into / span * 100))) : 0;
      }
      fill.style.width = pct + "%";
      track.appendChild(fill);
      const text = document.createElement("div");
      text.className = "steam-profile-xp-text";
      text.textContent = xp.toLocaleString() + " XP · " + toNext.toLocaleString() + " to next";
      block.appendChild(track);
      block.appendChild(text);
      card.appendChild(block);
    }
  } else {
    card.appendChild(steamProfileNote("Turn on Level and badges for Steam."));
  }
  el.appendChild(card);
}

const STEAM_RECENT_GAP = 8;
const STEAM_RECENT_PAGE_H = 36;
const STEAM_RECENT_TITLE_H = 42;
const STEAM_RECENT_FLOW_PAD = 12;
const steamRecentPage = {};

function steamRecentScale(props) {
  const n = Math.round(Number(props && props.entry_scale));
  if (!n || n < 50) return 100;
  return Math.min(150, n);
}

function steamRecentCount(props) {
  const n = Math.round(Number(props && props.show_count));
  if (!n || n < 1) return 10;
  return Math.min(10, n);
}

function steamRecentBox(props) {
  const scale = steamRecentScale(props);
  return {
    scale: scale / 100,
    w: Math.round(168 * scale / 100),
    h: Math.round(56 * scale / 100)
  };
}

function steamRecentMinSize(props) {
  const scale = steamRecentScale(props);
  const box = steamRecentBox(props);
  const floorW = Math.ceil(7 * scale / 100);
  const floorH = Math.ceil(6 * scale / 100);
  const needW = Math.ceil((box.w + STEAM_RECENT_FLOW_PAD * 2) / PROFILE_ROW_H);
  const needH = Math.ceil((box.h + STEAM_RECENT_TITLE_H + STEAM_RECENT_PAGE_H) / PROFILE_ROW_H);
  return {
    minW: Math.min(16, Math.max(floorW, needW, 1)),
    minH: Math.min(16, Math.max(floorH, needH, 1))
  };
}

function steamRecentFlowBox(tile) {
  const chrome = profileTextChrome(tile.props, tile.type);
  const frameW = chrome.show_frame ? chrome.frame_width : 0;
  const pad = Math.max(clampProfileSpan(chrome.pad, 0, 32), frameW);
  const border = chrome.show_border && !chrome.border_gradient ? Number(chrome.border_width) || 0 : 0;
  const inset = pad + border;
  const title = tile.props && tile.props.show_title === false ? 0 : STEAM_RECENT_TITLE_H;
  return {
    width: Math.max(0, tile.w * PROFILE_ROW_H - inset * 2 - STEAM_RECENT_FLOW_PAD * 2),
    height: Math.max(0, tile.h * PROFILE_ROW_H - inset * 2 - title - STEAM_RECENT_PAGE_H)
  };
}

function steamRecentPerPage(tile) {
  const box = steamRecentBox(tile.props);
  const flow = steamRecentFlowBox(tile);
  const cols = Math.max(1, Math.floor((flow.width + STEAM_RECENT_GAP) / (box.w + STEAM_RECENT_GAP)));
  const rows = Math.max(1, Math.floor((flow.height + STEAM_RECENT_GAP) / (box.h + STEAM_RECENT_GAP)));
  return cols * rows;
}

function steamRecentTime(minutes) {
  const n = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  if (!hours) return n === 1 ? "1 minute" : n + " minutes";
  if (!mins) return hours === 1 ? "1 hour" : hours + " hours";
  return (hours === 1 ? "1 hour " : hours + " hours ") + (mins === 1 ? "1 minute" : mins + " minutes");
}

function steamPlayingTime(minutes) {
  const n = Number(minutes) || 0;
  if (n < 5) return "";
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  if (!hours) return n + " minutes";
  if (!mins) return hours === 1 ? "1 hour" : hours + " hours";
  return (hours === 1 ? "1 hour " : hours + " hours ") + mins + " minutes";
}

function refreshSteamSurfaces() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  const pull = (path) => fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + path, { credentials: "include" })
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);
  Promise.all([pull("/steam_card"), pull("/steam_playing"), pull("/steam_recent"), pull("/steam_library")]).then(pair => {
    if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") !== id) return;
    if (pair[0] && steamCardOwnerId === id) steamCardData = pair[0];
    if (pair[1] && steamPlayingOwnerId === id) steamPlayingData = pair[1];
    if (pair[2] && steamRecentOwnerId === id) steamRecentData = pair[2];
    if (pair[3] && steamLibraryOwnerId === id) steamLibraryData = pair[3];
    if (steamAchieveOwnerId === id) pullSteamAchievements(0);
    if (!profileEditing && typeof renderProfileBoard === "function") renderProfileBoard();
  });
}

function refreshSteamPlaying() {
  refreshSteamSurfaces();
}

function ensureSteamPlaying() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (!steamPlayingTimer) steamPlayingTimer = setInterval(refreshSteamPlaying, 300000);
  if (steamPlayingOwnerId === id && (steamPlayingData || steamPlayingLoad)) return;
  steamPlayingOwnerId = id;
  steamPlayingData = null;
  steamPlayingLoad = fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + "/steam_playing", { credentials: "include" })
    .then(response => response.ok ? response.json() : { linked: false })
    .then(data => { steamPlayingData = data || { linked: false }; })
    .catch(() => { steamPlayingData = { linked: false }; })
    .finally(() => {
      steamPlayingLoad = null;
      if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") === id && typeof renderProfileBoard === "function") {
        renderProfileBoard();
      }
    });
}

function paintSteamPlaying(tile, el) {
  applyProfileWidgetSurface(el, tile);
  mountSteamTitle(el, tile, "Currently playing", "left");
  const card = document.createElement("div");
  card.className = "steam-playing-card";
  const owner = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!steamPlayingData || steamPlayingOwnerId !== owner) {
    ensureSteamPlaying();
    el.appendChild(card);
    return;
  }
  const data = steamPlayingData;
  if (!data.linked) {
    card.appendChild(steamProfileNote("Connect Steam to show this."));
    el.appendChild(card);
    return;
  }
  if (data.playing === false) {
    card.appendChild(steamProfileNote("Turn on Playing now for Steam."));
    el.appendChild(card);
    return;
  }
  if (!data.in_game) {
    card.appendChild(steamProfileNote("Not in a game right now."));
    el.appendChild(card);
    return;
  }
  const appid = String(data.appid || "");
  if (/^\d+$/.test(appid)) {
    const frame = document.createElement("div");
    frame.className = "steam-playing-frame";
    const img = document.createElement("img");
    img.className = "steam-playing-art";
    img.alt = "";
    img.draggable = false;
    img.src = "https://cdn.cloudflare.steamstatic.com/steam/apps/" + appid + "/library_600x900.jpg";
    img.addEventListener("error", () => frame.remove());
    frame.appendChild(img);
    card.appendChild(frame);
  }
  const copy = document.createElement("div");
  copy.className = "steam-playing-copy";
  if (data.name) {
    const name = document.createElement("div");
    name.className = "steam-playing-name";
    name.textContent = data.name;
    copy.appendChild(name);
  }
  const time = steamPlayingTime(data.minutes);
  if (time) {
    const line = document.createElement("div");
    line.className = "steam-playing-time";
    line.textContent = time;
    copy.appendChild(line);
  }
  if (copy.childNodes.length) card.appendChild(copy);
  el.appendChild(card);
}

function ensureSteamRecent() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (!steamPlayingTimer) steamPlayingTimer = setInterval(refreshSteamSurfaces, 300000);
  if (steamRecentOwnerId === id && (steamRecentData || steamRecentLoad)) return;
  steamRecentOwnerId = id;
  steamRecentData = null;
  steamRecentLoad = fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + "/steam_recent", { credentials: "include" })
    .then(response => response.ok ? response.json() : { linked: false })
    .then(data => { steamRecentData = data || { linked: false }; })
    .catch(() => { steamRecentData = { linked: false }; })
    .finally(() => {
      steamRecentLoad = null;
      if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") === id && typeof renderProfileBoard === "function") {
        renderProfileBoard();
      }
    });
}

function steamRecentTurn(tile, el, page) {
  steamRecentPage[tile.id] = page;
  if (el.classList.contains("is-opt-preview")) {
    el.innerHTML = "";
    paintSteamRecent(tile, el);
    return;
  }
  if (typeof renderProfileBoard === "function") renderProfileBoard();
}

function paintSteamRecent(tile, el) {
  applyProfileWidgetSurface(el, tile);
  applyProfileTextPaint(el, profileTextChrome(tile.props, tile.type));
  mountSteamTitle(el, tile, "Recently played", "left");
  const card = document.createElement("div");
  card.className = "steam-recent-card";
  const flow = document.createElement("div");
  flow.className = "steam-recent-flow";
  const pages = document.createElement("div");
  pages.className = "steam-recent-pages";
  const box = steamRecentBox(tile.props);
  el.style.setProperty("--steam-entry-scale", String(box.scale));
  const owner = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  let games = [];
  let note = "";
  if (!steamRecentData || steamRecentOwnerId !== owner) {
    ensureSteamRecent();
  } else if (!steamRecentData.linked) {
    note = "Connect Steam to show this.";
  } else if (steamRecentData.enabled === false) {
    note = "Turn on Recently played for Steam.";
  } else if (steamRecentData.public === false) {
    note = "Recently played is hidden on this Steam profile.";
  } else {
    games = (steamRecentData.games || []).slice(0, steamRecentCount(tile.props));
    if (!games.length) note = "No games in the last two weeks.";
  }
  const perPage = steamRecentPerPage(tile);
  const pageCount = Math.max(1, Math.ceil(games.length / perPage));
  let page = Math.round(Number(steamRecentPage[tile.id])) || 1;
  if (page < 1) page = 1;
  if (page > pageCount) page = pageCount;
  steamRecentPage[tile.id] = page;
  if (note) {
    flow.classList.add("is-note");
    flow.appendChild(steamProfileNote(note));
  } else {
    games.slice((page - 1) * perPage, page * perPage).forEach(game => {
      const entry = document.createElement("div");
      entry.className = "steam-recent-entry";
      entry.style.width = box.w + "px";
      entry.style.height = box.h + "px";
      const icon = document.createElement("div");
      icon.className = "steam-recent-icon";
      const appid = String(game.appid || "");
      const hash = String(game.icon || "");
      if (/^\d+$/.test(appid) && hash) {
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        img.src = "https://media.steampowered.com/steamcommunity/public/images/apps/" + appid + "/" + hash + ".jpg";
        img.addEventListener("error", () => img.remove());
        icon.appendChild(img);
      }
      const copy = document.createElement("div");
      copy.className = "steam-recent-copy";
      if (game.name) {
        const name = document.createElement("div");
        name.className = "steam-recent-name";
        name.textContent = game.name;
        copy.appendChild(name);
      }
      const time = document.createElement("div");
      time.className = "steam-recent-time";
      time.textContent = steamRecentTime(game.minutes);
      copy.appendChild(time);
      entry.appendChild(icon);
      entry.appendChild(copy);
      flow.appendChild(entry);
    });
  }
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "steam-recent-page-btn";
  prev.textContent = "‹";
  prev.disabled = page <= 1;
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page > 1) steamRecentTurn(tile, el, page - 1);
  });
  const count = document.createElement("div");
  count.className = "steam-recent-page-count";
  count.textContent = String(pageCount);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "steam-recent-page-btn";
  next.textContent = "›";
  next.disabled = page >= pageCount;
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page < pageCount) steamRecentTurn(tile, el, page + 1);
  });
  pages.addEventListener("pointerdown", (e) => e.stopPropagation());
  pages.appendChild(prev);
  pages.appendChild(count);
  pages.appendChild(next);
  card.appendChild(flow);
  card.appendChild(pages);
  el.appendChild(card);
}

function steamLibraryList(data, props) {
  const rows = (data.games || []).filter(game => Number(game.minutes) > 0);
  const byRecent = props && props.sort === "last_played";
  rows.sort((a, b) => {
    const played = (Number(b.minutes) || 0) - (Number(a.minutes) || 0);
    const seen = (Number(b.last_played) || 0) - (Number(a.last_played) || 0);
    return byRecent ? (seen || played) : (played || seen);
  });
  return rows.slice(0, 100);
}

function ensureSteamLibrary() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (!steamPlayingTimer) steamPlayingTimer = setInterval(refreshSteamSurfaces, 300000);
  if (steamLibraryOwnerId === id && (steamLibraryData || steamLibraryLoad)) return;
  steamLibraryOwnerId = id;
  steamLibraryData = null;
  steamLibraryLoad = fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + "/steam_library", { credentials: "include" })
    .then(response => response.ok ? response.json() : { linked: false })
    .then(data => { steamLibraryData = data || { linked: false }; })
    .catch(() => { steamLibraryData = { linked: false }; })
    .finally(() => {
      steamLibraryLoad = null;
      if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") === id && typeof renderProfileBoard === "function") {
        renderProfileBoard();
      }
    });
}

function steamLibraryTurn(tile, el, page) {
  steamLibraryPage[tile.id] = page;
  if (el.classList.contains("is-opt-preview")) {
    el.innerHTML = "";
    paintSteamLibrary(tile, el);
    return;
  }
  if (typeof renderProfileBoard === "function") renderProfileBoard();
}

function paintSteamLibrary(tile, el) {
  applyProfileWidgetSurface(el, tile);
  applyProfileTextPaint(el, profileTextChrome(tile.props, tile.type));
  mountSteamTitle(el, tile, "Library", "left");
  const card = document.createElement("div");
  card.className = "steam-recent-card";
  const flow = document.createElement("div");
  flow.className = "steam-recent-flow";
  const pages = document.createElement("div");
  pages.className = "steam-recent-pages";
  const box = steamRecentBox(tile.props);
  el.style.setProperty("--steam-entry-scale", String(box.scale));
  const owner = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  let games = [];
  let note = "";
  if (!steamLibraryData || steamLibraryOwnerId !== owner) {
    ensureSteamLibrary();
  } else if (!steamLibraryData.linked) {
    note = "Connect Steam to show this.";
  } else if (steamLibraryData.enabled === false) {
    note = "Turn on Library for Steam.";
  } else if (steamLibraryData.public === false) {
    note = "Library is hidden on this Steam profile.";
  } else {
    games = steamLibraryList(steamLibraryData, tile.props);
    if (!games.length) note = "No played games to show.";
  }
  const perPage = Math.max(1, Math.min(10, steamRecentPerPage(tile)));
  const pageCount = Math.max(1, Math.ceil(games.length / perPage));
  let page = Math.round(Number(steamLibraryPage[tile.id])) || 1;
  if (page < 1) page = 1;
  if (page > pageCount) page = pageCount;
  steamLibraryPage[tile.id] = page;
  if (note) {
    flow.classList.add("is-note");
    flow.appendChild(steamProfileNote(note));
  } else {
    games.slice((page - 1) * perPage, page * perPage).forEach(game => {
      const entry = document.createElement("div");
      entry.className = "steam-recent-entry";
      entry.style.width = box.w + "px";
      entry.style.height = box.h + "px";
      const icon = document.createElement("div");
      icon.className = "steam-recent-icon";
      const appid = String(game.appid || "");
      const hash = String(game.icon || "");
      if (/^\d+$/.test(appid) && hash) {
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        img.src = "https://media.steampowered.com/steamcommunity/public/images/apps/" + appid + "/" + hash + ".jpg";
        img.addEventListener("error", () => img.remove());
        icon.appendChild(img);
      }
      const copy = document.createElement("div");
      copy.className = "steam-recent-copy";
      if (game.name) {
        const name = document.createElement("div");
        name.className = "steam-recent-name";
        name.textContent = game.name;
        copy.appendChild(name);
      }
      const time = document.createElement("div");
      time.className = "steam-recent-time";
      time.textContent = steamRecentTime(game.minutes);
      copy.appendChild(time);
      entry.appendChild(icon);
      entry.appendChild(copy);
      flow.appendChild(entry);
    });
  }
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "steam-recent-page-btn";
  prev.textContent = "‹";
  prev.disabled = page <= 1;
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page > 1) steamLibraryTurn(tile, el, page - 1);
  });
  const count = document.createElement("div");
  count.className = "steam-recent-page-count";
  count.textContent = String(pageCount);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "steam-recent-page-btn";
  next.textContent = "›";
  next.disabled = page >= pageCount;
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page < pageCount) steamLibraryTurn(tile, el, page + 1);
  });
  pages.addEventListener("pointerdown", (e) => e.stopPropagation());
  pages.appendChild(prev);
  pages.appendChild(count);
  pages.appendChild(next);
  card.appendChild(flow);
  card.appendChild(pages);
  el.appendChild(card);
}

function steamAchieveBox(props) {
  const scale = steamRecentScale(props);
  return {
    scale: scale / 100,
    w: Math.round(248 * scale / 100),
    h: Math.round(88 * scale / 100)
  };
}

function steamAchieveMinSize(props) {
  const scale = steamRecentScale(props);
  const box = steamAchieveBox(props);
  const floorW = Math.ceil(7 * scale / 100);
  const floorH = Math.ceil(6 * scale / 100);
  const needW = Math.ceil((box.w + STEAM_RECENT_FLOW_PAD * 2) / PROFILE_ROW_H);
  const needH = Math.ceil((box.h + STEAM_RECENT_TITLE_H + STEAM_RECENT_PAGE_H) / PROFILE_ROW_H);
  return {
    minW: Math.min(16, Math.max(floorW, needW, 1)),
    minH: Math.min(16, Math.max(floorH, needH, 1))
  };
}

function steamAchievePerPage(tile) {
  const box = steamAchieveBox(tile.props);
  const flow = steamRecentFlowBox(tile);
  const cols = Math.max(1, Math.floor((flow.width + STEAM_RECENT_GAP) / (box.w + STEAM_RECENT_GAP)));
  const rows = Math.max(1, Math.floor((flow.height + STEAM_RECENT_GAP) / (box.h + STEAM_RECENT_GAP)));
  return Math.max(1, Math.min(10, cols * rows));
}

function steamAchieveList(data, props) {
  const appid = Math.round(Number(props && props.appid)) || 0;
  const rows = (data.achievements || []).filter(row => !appid || Number(row.appid) === appid);
  const byRarity = props && props.sort === "rarity";
  rows.sort((a, b) => {
    if (byRarity) {
      const left = a.percent == null ? 101 : Number(a.percent);
      const right = b.percent == null ? 101 : Number(b.percent);
      return left - right || (Number(b.unlocked) || 0) - (Number(a.unlocked) || 0);
    }
    return (Number(b.unlocked) || 0) - (Number(a.unlocked) || 0);
  });
  return rows.slice(0, 100);
}

function steamAchieveIcon(url) {
  const text = String(url || "");
  return text.indexOf("https://") === 0 ? text : "";
}

function steamAchieveDate(unix) {
  const n = Number(unix) || 0;
  if (!n) return "";
  const date = new Date(n * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function steamAchievePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 10) / 10;
  return (rounded % 1 ? rounded.toFixed(1) : String(rounded)) + "% of players have this achievement";
}

function closeSteamAchieveSubmenu() {
  const overlay = document.getElementById("steam-achieve-overlay");
  if (overlay) overlay.hidden = true;
}

function bindSteamAchieveSubmenu() {
  if (bindSteamAchieveSubmenu.ready) return;
  bindSteamAchieveSubmenu.ready = true;
  const overlay = document.getElementById("steam-achieve-overlay");
  const close = document.getElementById("steam-achieve-close");
  if (close) close.addEventListener("click", closeSteamAchieveSubmenu);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeSteamAchieveSubmenu();
    });
  }
  document.addEventListener("keydown", (e) => {
    const open = document.getElementById("steam-achieve-overlay");
    if (e.key === "Escape" && open && !open.hidden) closeSteamAchieveSubmenu();
  });
}

function openSteamAchieveSubmenu(row) {
  bindSteamAchieveSubmenu();
  const overlay = document.getElementById("steam-achieve-overlay");
  const title = document.getElementById("steam-achieve-title");
  const body = document.getElementById("steam-achieve-body");
  if (!overlay || !body) return;
  if (title) title.textContent = row.name || "Achievement";
  body.innerHTML = "";
  const top = document.createElement("div");
  top.className = "steam-achieve-top";
  const icon = steamAchieveIcon(row.icon);
  if (icon) {
    const img = document.createElement("img");
    img.className = "steam-achieve-art";
    img.alt = "";
    img.draggable = false;
    img.src = icon;
    img.addEventListener("error", () => img.remove());
    top.appendChild(img);
  }
  const facts = document.createElement("div");
  facts.className = "steam-achieve-facts";
  if (row.game) {
    const game = document.createElement("div");
    game.className = "steam-achieve-game";
    game.textContent = row.game;
    facts.appendChild(game);
  }
  const lines = [];
  const when = steamAchieveDate(row.unlocked);
  lines.push(when ? ("Unlocked " + when) : "Unlocked");
  const percent = steamAchievePercent(row.percent);
  if (percent) lines.push(percent);
  lines.forEach(text => {
    const line = document.createElement("div");
    line.className = "steam-achieve-fact";
    line.textContent = text;
    facts.appendChild(line);
  });
  top.appendChild(facts);
  body.appendChild(top);
  if (row.description) {
    const copy = document.createElement("div");
    copy.className = "steam-achieve-detail";
    copy.textContent = row.description;
    body.appendChild(copy);
  }
  overlay.hidden = false;
}

function scheduleSteamAchieveFill() {
  if (steamAchieveFill) return;
  steamAchieveFill = setTimeout(() => {
    steamAchieveFill = null;
    if (steamAchieveData && steamAchieveData.ready === false) pullSteamAchievements(0);
  }, 15000);
}

function pullSteamAchievements(appid) {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (steamAchieveLoad) {
    steamAchieveQueued = appid || 0;
    return;
  }
  const focus = Math.round(Number(appid)) || 0;
  const query = focus ? ("?appid=" + encodeURIComponent(String(focus))) : "";
  steamAchieveOwnerId = id;
  steamAchieveLoad = fetch("https://" + serverAddress + "/profile/" + encodeURIComponent(id) + "/steam_achievements" + query, { credentials: "include" })
    .then(response => response.ok ? response.json() : { linked: false })
    .then(data => { steamAchieveData = data || { linked: false }; })
    .catch(() => { steamAchieveData = { linked: false }; })
    .finally(() => {
      steamAchieveLoad = null;
      const next = steamAchieveQueued;
      steamAchieveQueued = null;
      if (String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "") === id && typeof renderProfileBoard === "function") {
        renderProfileBoard();
      }
      if (next != null) pullSteamAchievements(next);
      else if (steamAchieveData && steamAchieveData.ready === false) scheduleSteamAchieveFill();
    });
}

function ensureSteamAchievements() {
  const id = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  if (!id || typeof serverAddress !== "string" || !serverAddress) return;
  if (!steamPlayingTimer) steamPlayingTimer = setInterval(refreshSteamSurfaces, 300000);
  if (steamAchieveOwnerId === id && (steamAchieveData || steamAchieveLoad)) return;
  steamAchieveData = null;
  pullSteamAchievements(0);
}

function steamAchieveTurn(tile, el, page) {
  steamAchievePage[tile.id] = page;
  if (el.classList.contains("is-opt-preview")) {
    el.innerHTML = "";
    paintSteamAchievements(tile, el);
    return;
  }
  if (typeof renderProfileBoard === "function") renderProfileBoard();
}

function paintSteamAchievements(tile, el) {
  applyProfileWidgetSurface(el, tile);
  applyProfileTextPaint(el, profileTextChrome(tile.props, tile.type));
  mountSteamTitle(el, tile, "Achievements", "left");
  const card = document.createElement("div");
  card.className = "steam-recent-card";
  const flow = document.createElement("div");
  flow.className = "steam-recent-flow";
  const pages = document.createElement("div");
  pages.className = "steam-recent-pages";
  const box = steamAchieveBox(tile.props);
  el.style.setProperty("--steam-entry-scale", String(box.scale));
  const owner = String(typeof profileOwnerId !== "undefined" ? profileOwnerId || "" : "");
  let rows = [];
  let note = "";
  if (!steamAchieveData || steamAchieveOwnerId !== owner) {
    ensureSteamAchievements();
  } else if (!steamAchieveData.linked) {
    note = "Connect Steam to show this.";
  } else if (steamAchieveData.enabled === false) {
    note = "Turn on Achievements for Steam.";
  } else if (steamAchieveData.public === false) {
    note = "Achievements are hidden on this Steam profile.";
  } else {
    rows = steamAchieveList(steamAchieveData, tile.props);
    if (!rows.length) note = "No achievements to show.";
  }
  const perPage = steamAchievePerPage(tile);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  let page = Math.round(Number(steamAchievePage[tile.id])) || 1;
  if (page < 1) page = 1;
  if (page > pageCount) page = pageCount;
  steamAchievePage[tile.id] = page;
  if (note) {
    flow.classList.add("is-note");
    flow.appendChild(steamProfileNote(note));
  } else {
    rows.slice((page - 1) * perPage, page * perPage).forEach(row => {
      const entry = document.createElement("div");
      entry.className = "steam-recent-entry steam-achieve-entry";
      entry.style.width = box.w + "px";
      entry.style.height = box.h + "px";
      const icon = document.createElement("div");
      icon.className = "steam-recent-icon";
      const src = steamAchieveIcon(row.icon);
      if (src) {
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        img.src = src;
        img.addEventListener("error", () => img.remove());
        icon.appendChild(img);
      }
      const copy = document.createElement("div");
      copy.className = "steam-recent-copy";
      const name = document.createElement("div");
      name.className = "steam-recent-name";
      name.textContent = row.name || "";
      copy.appendChild(name);
      if (row.description) {
        const desc = document.createElement("div");
        desc.className = "steam-achieve-desc";
        desc.textContent = row.description;
        copy.appendChild(desc);
      }
      entry.appendChild(icon);
      entry.appendChild(copy);
      entry.addEventListener("pointerdown", (e) => e.stopPropagation());
      entry.addEventListener("click", (e) => {
        e.stopPropagation();
        openSteamAchieveSubmenu(row);
      });
      flow.appendChild(entry);
    });
  }
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "steam-recent-page-btn";
  prev.textContent = "‹";
  prev.disabled = page <= 1;
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page > 1) steamAchieveTurn(tile, el, page - 1);
  });
  const count = document.createElement("div");
  count.className = "steam-recent-page-count";
  count.textContent = String(pageCount);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "steam-recent-page-btn";
  next.textContent = "›";
  next.disabled = page >= pageCount;
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page < pageCount) steamAchieveTurn(tile, el, page + 1);
  });
  pages.addEventListener("pointerdown", (e) => e.stopPropagation());
  pages.appendChild(prev);
  pages.appendChild(count);
  pages.appendChild(next);
  card.appendChild(flow);
  card.appendChild(pages);
  el.appendChild(card);
}

function paintProfileTileContent(tile, el) {
  el.innerHTML = "";
  el.classList.toggle("is-compact-row", Number(tile.h) === 1);
  if (tile.type === "steam_profile") {
    paintSteamProfile(tile, el);
    return;
  }
  if (tile.type === "steam_playing_now") {
    paintSteamPlaying(tile, el);
    return;
  }
  if (tile.type === "steam_recently_played") {
    paintSteamRecent(tile, el);
    return;
  }
  if (tile.type === "steam_library") {
    paintSteamLibrary(tile, el);
    return;
  }
  if (tile.type === "steam_achievements") {
    paintSteamAchievements(tile, el);
    return;
  }
  if (tile.type === "banner") {
    el.style.background = (tile.props && tile.props.color) || "#1e6b8a";
    applyProfileTileBorder(el, tile);
    if (typeof paintIdentityMedia === "function") {
      const media = typeof identityMediaForPaint === "function" ? identityMediaForPaint("banner", tile) : null;
      if (media) paintIdentityMedia(el, media);
    }
    return;
  }
  el.style.background = "";
  if (tile.type === "avatar") {
    const face = document.createElement("div");
    face.className = "profile-tile-avatar";
    const media = typeof identityMediaForPaint === "function" ? identityMediaForPaint("avatar", tile) : null;
    if (typeof identityHasImage === "function" && identityHasImage(media) && typeof paintIdentityMedia === "function") {
      paintIdentityMedia(face, media, { circle: true });
    } else {
      face.textContent = typeof avatarLetter === "function" ? avatarLetter(profileOwnerName()) : (profileOwnerName() || "?").slice(0, 1);
    }
    applyProfileTileBorder(el, tile, face);
    el.appendChild(face);
    return;
  }
  applyProfileWidgetSurface(el, tile);
  if (tile.type === "display_name") {
    const chrome = profileTextChrome(tile.props, "display_name");
    applyProfileTextPaint(el, chrome);
    const row = document.createElement("div");
    row.className = "profile-tile-name-row";
    const name = document.createElement("div");
    name.className = "profile-tile-name";
    const typedName = tile.props && tile.props.identity && tile.props.identity.display_name;
    const shownName = typedName != null && String(typedName).trim() ? String(typedName).trim() : profileOwnerName();
    name.textContent = shownName;
    row.appendChild(name);
    const aliases = profileOwnerAliases();
    const showAliases = !tile.props || tile.props.show_aliases !== false;
    if (showAliases && aliases.length) {
      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "profile-alias-btn";
      arrow.textContent = "▾";
      arrow.title = "Previous names";
      arrow.addEventListener("pointerdown", (e) => e.stopPropagation());
      arrow.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof openContextMenu !== "function") return;
        openContextMenu(e.clientX, e.clientY, {
          avatarText: (shownName || "?").slice(0, 1),
          title: "Previous names"
        }, aliases.map(label => ({ label, onSelect: () => {} })));
      });
      row.appendChild(arrow);
    }
    el.appendChild(row);
    const handle = document.createElement("div");
    handle.className = "profile-tile-handle";
    let handleText = "@" + profileOwnerHandle();
    if (tile.props && tile.props.show_pronouns) {
      const pronouns = profileOwnerPronouns() || (profileEditing && profileIsOwn ? "Pronouns" : "");
      if (pronouns) handleText += " | " + pronouns;
      if (!profileOwnerPronouns() && profileEditing && profileIsOwn) handle.classList.add("is-empty");
    }
    handle.textContent = handleText;
    el.appendChild(handle);
    if (tile.props && tile.props.show_status) {
      const status = document.createElement("div");
      status.className = "profile-tile-status" + (profileOwnerStatus() ? "" : " is-empty");
      status.textContent = profileOwnerStatus() || (profileEditing && profileIsOwn ? "Status" : "");
      if (status.textContent) el.appendChild(status);
    }
    applyProfileWidgetSurface(el, tile);
    return;
  }
  if (tile.type === "member_since") {
    const head = document.createElement("div");
    head.className = "profile-tile-head";
    head.textContent = "Member since";
    el.appendChild(head);
    const date = document.createElement("div");
    date.className = "profile-since-date";
    date.textContent = profileOwnerMemberSince() || "—";
    el.appendChild(date);
    return;
  }
  const host = profileUsesTextChrome(tile.type) ? mountProfileTextChrome(el, tile) : el;
  if (tile.type === "header") {
    paintProfileHeader(tile, host);
    return;
  }
  if (tile.type === "body") {
    paintProfileCopy(tile, host, "body");
    return;
  }
  if (tile.type === "footnote") {
    paintProfileCopy(tile, host, "footnote");
    return;
  }
  if (tile.type === "list") {
    paintProfileList(tile, host);
    return;
  }
  if (tile.type === "spoiler") {
    paintProfileSpoiler(tile, host);
    return;
  }
  if (tile.type === "divider") {
    paintProfileDivider(tile, el);
    return;
  }
  if (tile.type === "rail") {
    paintProfileRail(tile, el);
    return;
  }
  if (tile.type === "link_tree") {
    paintProfileLinkTree(tile, el);
    return;
  }
  if (tile.type === "button") {
    paintProfileButton(tile, el);
    return;
  }
  if (tile.type === "local_time" || tile.type === "details") {
    paintProfileLocalTime(tile, el);
    return;
  }
  if (tile.type === "icon") {
    paintProfileIcon(tile, el);
    return;
  }
  if (tile.type === "image") {
    paintProfileImage(tile, el);
    return;
  }
  if (tile.type === "video") {
    paintProfileVideo(tile, el);
    return;
  }
  if (tile.type === "music") {
    paintProfileMusic(tile, el);
    return;
  }
  if (tile.type === "embed") {
    paintProfileEmbed(tile, el);
    return;
  }
  if (tile.type === "gallery") {
    paintProfileGallery(tile, el);
    return;
  }
  if (tile.type === "comments") {
    paintProfileComments(tile, el);
    return;
  }
  if (tile.type === "display_server") {
    paintProfileDisplayServer(tile, el);
    return;
  }
  if (tile.type === "clock") {
    paintProfileClock(tile, el);
    return;
  }
  if (PROFILE_TILE_TYPES[tile.type] && PROFILE_TILE_TYPES[tile.type].placeholder) {
    paintProfilePlaceholder(tile, el);
    return;
  }
  if (tile.type === "friends") {
    mountProfileFixedTitle(el, "Friends");
    applyProfileWidgetSurface(el, tile);
    applyProfileFriendSize(el, tile);
    const body = document.createElement("div");
    body.className = "profile-tile-body";
    paintProfileFriends(body);
    el.appendChild(body);
  }
}

function syncProfilePaletteForPage() {
  const palette = document.getElementById("profile-palette");
  if (palette) palette.hidden = !(profileIsOwn && profileEditing && !isMiniProfilePageId(profileActivePageId));
}

function paintMiniProfileEditorPage(board) {
  board.classList.add("is-mini-profile-page");
  board.classList.remove("is-editing");
  const host = document.createElement("div");
  host.className = "mini-profile-card is-page";
  if (typeof paintMiniProfileInto === "function") {
    paintMiniProfileInto(host, miniProfileDataFromOpenProfile(), {
      page: true,
      editing: !!(profileEditing && profileIsOwn)
    });
  }
  board.appendChild(host);
}

function leftoverProfileBioText(layout) {
  let about = "";
  ((layout && layout.pages) || []).forEach((page) => {
    (page.tiles || []).forEach((tile) => {
      if (tile.type === "bio" && !about) about = String((tile.props || {}).text || "").trim();
    });
  });
  return about;
}

function miniProfileStore(layout) {
  const host = layout || profileDraft || profileSavedLayout || {};
  if (!host.mini_profile || typeof host.mini_profile !== "object") host.mini_profile = {};
  if (host.mini_profile.text == null) {
    const leftover = leftoverProfileBioText(host);
    if (leftover) host.mini_profile.text = leftover;
  }
  return host.mini_profile;
}

function miniProfileBioTile() {
  const store = miniProfileStore(profileDraft || profileSavedLayout);
  const props = typeof defaultProfileTileProps === "function"
    ? defaultProfileTileProps("bio", store)
    : { text: store.text || "" };
  Object.keys(props).forEach((key) => {
    if (store[key] == null) store[key] = props[key];
  });
  return { id: "mini-bio", type: "bio", props: store, x: 0, y: 0, w: 6, h: 5 };
}

function miniProfileDataFromOpenProfile() {
  const layout = profileDraft || profileSavedLayout || {};
  let banner = "#1e6b8a";
  (layout.pages || []).forEach((page) => {
    (page.tiles || []).forEach((tile) => {
      const props = tile.props || {};
      if (tile.type === "banner" && props.color && banner === "#1e6b8a") banner = props.color;
    });
  });
  const about = String(miniProfileStore(layout).text || leftoverProfileBioText(layout) || "").trim();
  const user = profileUser || {};
  return {
    user: {
      id: user.id || myUserId,
      username: user.username || myUsername,
      display_name: user.display_name || myDisplayName || myUsername,
      status: user.status || "",
      pronouns: user.pronouns || ""
    },
    banner_color: banner,
    about,
    identity: layout.identity || null,
    presence: "online",
    is_self: true,
    in_server: false,
    note: "",
    roles: [],
    assignable: []
  };
}

function renderProfileBoard() {
  const board = document.getElementById("profile-board");
  if (!board) return;
  bindProfileBoardScale();
  board.style.transform = "none";
  board.innerHTML = "";
  board.classList.remove("is-mini-profile-page");
  board.classList.toggle("is-editing", !!(profileEditing && profileIsOwn));
  board.style.gap = PROFILE_GAP + "px";
  syncProfilePaletteForPage();
  const layout = profileDraft || profileSavedLayout;
  const page = profilePageById(layout, profileActivePageId);
  if (page && isMiniProfilePageId(page.id)) {
    paintMiniProfileEditorPage(board);
    syncProfileBoardScale();
    return;
  }
  const tiles = (page && page.tiles) || [];
  if (profileEditing && profileIsOwn) paintProfileGrid(board, page);
  if (!tiles.length) {
    const empty = document.createElement("div");
    empty.className = "profile-board-empty";
    empty.textContent = profileEditing
      ? "Drop pieces from the palette onto this page."
      : "Nothing on this page yet.";
    board.appendChild(empty);
  }
  profileTilesForPaint(tiles).forEach(({ tile }, stack) => {
    if (tile.type === "details") tile.type = "local_time";
    if (tile.type === "countdown") {
      tile.type = "clock";
      tile.props = tile.props || {};
      if (tile.props.mode !== "timer" && tile.props.mode !== "world") tile.props.mode = "countdown";
    }
    if (tile.type === "youtube" || tile.type === "twitch") tile.type = "embed";
    if (tile.type === "artwork") tile.type = "image";
    if (tile.type === "slideshow") {
      tile.type = "gallery";
      tile.props = tile.props || {};
      if (tile.props.mode !== "manual") tile.props.mode = "slideshow";
    }
    if (tile.type === "server_list" || tile.type === "featured_server") {
      tile.type = "display_server";
      tile.props = tile.props || {};
      const ids = Array.isArray(tile.props.server_ids) ? tile.props.server_ids.slice() : [];
      const one = String(tile.props.server_id || "").trim().toUpperCase();
      if (one && ids.indexOf(one) < 0) ids.unshift(one);
      tile.props.server_ids = ids;
      if (!String(tile.props.title || "").trim()) tile.props.title = "Server List";
    }
    const size = clampProfileTileSize(tile.type, tile.w, tile.h, tile.x, tile);
    tile.w = size.w;
    tile.h = size.h;
    const el = document.createElement("div");
    el.className = "profile-tile is-" + tile.type + (profileEditing ? " is-editing" : "") + (tile.allow_overlap ? " allows-overlap" : "");
    el.dataset.tileId = tile.id;
    el.style.zIndex = String(20 + stack);
    applyProfileTileStyle(el, tile);
    paintProfileTileContent(tile, el);
    if (profileEditing && profileIsOwn && typeof bindProfileTileDrag === "function") {
      const handle = document.createElement("div");
      handle.className = "profile-resize";
      el.appendChild(handle);
      bindProfileTileDrag(el, tile, handle);
      el.addEventListener("dblclick", (e) => {
        if (e.target.closest(".profile-resize")) return;
        if (typeof isMiniProfileIdentityTile === "function" && isMiniProfileIdentityTile(tile.type)) return;
        if (tile.type === "banner" || tile.type === "image" || tile.type === "video" || tile.type === "music" || tile.type === "embed" || tile.type === "gallery" || tile.type === "comments" || tile.type === "display_server" || tile.type === "link_tree" || tile.type === "local_time" || tile.type === "details" || tile.type === "icon" || tile.type === "clock") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof openProfileTileOptions === "function") openProfileTileOptions(tile);
          return;
        }
        if (!profileTileIsText(tile.type)) return;
        e.preventDefault();
        e.stopPropagation();
        const field = e.target.closest("textarea, input");
        if (field) {
          el.classList.add("is-typing");
          field.focus();
          return;
        }
        armProfileTileTyping(el);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof showProfileTileMenu === "function") showProfileTileMenu(e, tile);
      });
    }
    if (!profileEditing && profileIsOwn && typeof bindProfileQuickEdit === "function") {
      bindProfileQuickEdit(el, tile);
    }
    board.appendChild(el);
  });
  syncProfileBoardScale();
  syncProfileLocalTimeClock();
}

function paintProfileGrid(board, page) {
  const rows = Math.max(18, (page && page.tiles || []).reduce((n, tile) => Math.max(n, tile.y + tile.h), 0) + 10);
  const overlay = document.createElement("div");
  overlay.className = "profile-grid-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.gridTemplateRows = "repeat(" + rows + ", " + PROFILE_ROW_H + "px)";
  const count = PROFILE_COLS * rows;
  for (let i = 0; i < count; i++) {
    overlay.appendChild(document.createElement("div"));
  }
  board.appendChild(overlay);
}
