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
  display_name: { w: 5, h: 2, minW: 3, minH: 2, maxW: 5, maxH: 5, label: "Display name" },
  member_since: { w: 6, h: 2, minW: 4, minH: 2, maxW: 10, maxH: 3, label: "Member since" },
  bio: { w: 14, h: 5, minW: 6, minH: 5, maxW: 14, maxH: 6, label: "Bio" },
  friends: { w: 6, h: 11, minW: 4, minH: 11, maxW: 6, maxH: 15, label: "Friends" },
  header: { w: 16, h: 2, minW: 4, minH: 1, maxW: 32, maxH: 3, label: "Header" },
  body: { w: 14, h: 4, minW: 6, minH: 2, maxW: 32, maxH: 12, label: "Body" },
  footnote: { w: 12, h: 1, minW: 4, minH: 1, maxW: 32, maxH: 3, label: "Footnote" },
  list: { w: 10, h: 6, minW: 6, minH: 3, maxW: 20, maxH: 16, label: "List" },
  spoiler: { w: 10, h: 3, minW: 6, minH: 2, maxW: 20, maxH: 10, label: "Spoiler" },
  stats: { w: 10, h: 4, minW: 6, minH: 2, maxW: 20, maxH: 10, label: "Stats" },
  callout: { w: 12, h: 3, minW: 6, minH: 2, maxW: 24, maxH: 8, label: "Callout" },
  divider: { w: 32, h: 1, minW: 1, minH: 1, maxW: 32, maxH: 24, label: "Divider" },
  rail: { w: 8, h: 1, minW: 1, minH: 1, maxW: 8, maxH: 8, label: "Rail" },
  spacer: { w: 8, h: 2, minW: 2, minH: 1, maxW: 32, maxH: 8, label: "Spacer" },
  link_tree: { w: 8, h: 10, minW: 5, minH: 6, maxW: 8, maxH: 12, label: "Link Tree" },
  button: { w: 8, h: 2, minW: 4, minH: 1, maxW: 16, maxH: 3, label: "Button" },
  details: { w: 6, h: 2, minW: 5, minH: 2, maxW: 6, maxH: 3, label: "Local Time" },
  local_time: { w: 6, h: 2, minW: 5, minH: 2, maxW: 6, maxH: 3, label: "Local Time" },
  icon: { w: 3, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6, label: "Icon" },
  clock: { w: 6, h: 3, minW: 4, minH: 2, maxW: 12, maxH: 5, label: "Clock" }
};

const PROFILE_PLACEHOLDERS = {
  interests: { label: "Interests", w: 10, h: 3, minW: 6, minH: 2, maxW: 20, maxH: 8 },
  looking_for: { label: "Looking for", w: 10, h: 3, minW: 6, minH: 2, maxW: 16, maxH: 8 },
  fun_facts: { label: "Fun facts", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 12 },
  schedule: { label: "Schedule", w: 10, h: 3, minW: 6, minH: 2, maxW: 16, maxH: 8 },
  setup: { label: "Setup", w: 10, h: 4, minW: 6, minH: 2, maxW: 16, maxH: 10 },
  connections: { label: "Connections", w: 10, h: 6, minW: 8, minH: 4, maxW: 16, maxH: 14 },
  featured_friend: { label: "Featured friend", w: 8, h: 4, minW: 6, minH: 3, maxW: 12, maxH: 8 },
  mutuals: { label: "Mutuals", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 12 },
  frame: { label: "Frame", w: 12, h: 8, minW: 6, minH: 4, maxW: 32, maxH: 18 },
  color_block: { label: "Color block", w: 8, h: 4, minW: 2, minH: 2, maxW: 32, maxH: 12 },
  meter: { label: "Meter", w: 10, h: 2, minW: 6, minH: 1, maxW: 24, maxH: 4 },
  image: { label: "Image", w: 10, h: 6, minW: 4, minH: 3, maxW: 24, maxH: 16 },
  video: { label: "Video", w: 12, h: 7, minW: 8, minH: 4, maxW: 24, maxH: 16 },
  music: { label: "Music", w: 10, h: 4, minW: 6, minH: 3, maxW: 20, maxH: 8 },
  twitch: { label: "Twitch", w: 12, h: 7, minW: 8, minH: 4, maxW: 24, maxH: 16 },
  gallery: { label: "Gallery", w: 12, h: 6, minW: 8, minH: 4, maxW: 24, maxH: 16 },
  slideshow: { label: "Slideshow", w: 12, h: 6, minW: 8, minH: 4, maxW: 24, maxH: 16 },
  youtube: { label: "YouTube", w: 12, h: 7, minW: 8, minH: 4, maxW: 24, maxH: 16 },
  gif: { label: "GIF", w: 8, h: 6, minW: 4, minH: 3, maxW: 16, maxH: 12 },
  artwork: { label: "Artwork", w: 10, h: 7, minW: 6, minH: 4, maxW: 20, maxH: 16 },
  comments: { label: "Comments", w: 12, h: 8, minW: 8, minH: 5, maxW: 24, maxH: 18 },
  server_list: { label: "Server list", w: 10, h: 8, minW: 8, minH: 4, maxW: 16, maxH: 18 },
  featured_server: { label: "Featured server", w: 10, h: 5, minW: 8, minH: 4, maxW: 16, maxH: 10 },
  achievements: { label: "Achievements", w: 12, h: 5, minW: 8, minH: 3, maxW: 24, maxH: 12 },
  recently_played: { label: "Recently played", w: 10, h: 4, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  favorite_game: { label: "Favorite game", w: 10, h: 5, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  currently_playing: { label: "Currently playing", w: 10, h: 4, minW: 6, minH: 3, maxW: 20, maxH: 10 },
  want_to_play: { label: "Want to play", w: 10, h: 5, minW: 6, minH: 3, maxW: 20, maxH: 12 },
  games_played: { label: "Games played", w: 12, h: 5, minW: 8, minH: 3, maxW: 24, maxH: 12 },
  game_stats: { label: "Game stats", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 10 },
  library: { label: "Library", w: 12, h: 6, minW: 8, minH: 4, maxW: 24, maxH: 14 },
  review: { label: "Review", w: 10, h: 5, minW: 6, minH: 3, maxW: 16, maxH: 10 }
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
  const copy = JSON.parse(JSON.stringify(layout || { pages: [] }));
  copy.grid_cols = PROFILE_COLS;
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
  if (type === "local_time" || type === "details" || type === "clock") return 18;
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

function defaultBorderChrome(type, row) {
  const prev = row || {};
  const fallbackW = (type === "avatar" || type === "banner") ? 3 : 1;
  const style = String(prev.border_style || "solid").toLowerCase();
  const known = PROFILE_BORDER_STYLES.some(item => item.value === style);
  return {
    border_width: clampProfileBorderWidth(prev.border_width, fallbackW),
    border_color: profileBorderColor(prev.border_color) || "#ffffff",
    border_style: known ? style : "solid"
  };
}

function defaultTextChrome(type, prev) {
  const row = prev || {};
  const card = type !== "header" && type !== "footnote" && type !== "avatar" && type !== "display_name" && type !== "banner" && type !== "divider" && type !== "rail" && type !== "icon";
  return Object.assign({
    text_size: defaultTextSize(type, row),
    text_align: row.text_align === "center" || row.text_align === "right" ? row.text_align : "left",
    show_background: row.show_background != null ? !!row.show_background : card,
    show_border: row.show_border != null ? !!row.show_border : false
  }, defaultBorderChrome(type, row));
}

function defaultProfileTileProps(type, existing) {
  const prev = existing || {};
  const chrome = defaultTextChrome(type, prev);
  if (type === "bio") return Object.assign({ text: prev.text || "" }, chrome);
  if (type === "local_time" || type === "details") {
    const align = prev.text_align === "left" || prev.text_align === "right" || prev.text_align === "center"
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
    return Object.assign({ show_status: false, show_pronouns: false, show_border: false }, defaultBorderChrome(type, prev));
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
  if (type === "stats") return Object.assign({ rows: Array.isArray(prev.rows) ? prev.rows.map(row => Object.assign({}, row)) : [] }, chrome);
  if (type === "callout") return Object.assign({ text: prev.text || "", tone: prev.tone === "warning" ? "warning" : "tip" }, chrome);
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
  if (type === "clock" || type === "countdown") {
    const mode = prev.mode === "countdown" || prev.mode === "timer" ? prev.mode : (type === "countdown" ? "countdown" : "world");
    const align = prev.text_align === "left" || prev.text_align === "right" || prev.text_align === "center"
      ? prev.text_align
      : "center";
    const format = prev.time_format === "24" || prev.time_format === "system" ? prev.time_format : "12";
    return Object.assign({}, chrome, {
      mode,
      timezone: prev.timezone || "UTC",
      time_format: format,
      show_date: !!prev.show_date,
      show_zone: !!prev.show_zone,
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
  return type === "header" || type === "body" || type === "footnote" || type === "list" || type === "spoiler" || type === "stats" || type === "callout" || type === "bio";
}

function profileHasFixedTitle(type) {
  return type === "bio" || type === "link_tree" || type === "friends";
}

function profileHasTextFormat(type) {
  return profileUsesTextChrome(type) || type === "button" || type === "local_time" || type === "details" || type === "clock";
}

function profileTextChrome(props, type) {
  return defaultTextChrome(type, props || {});
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

function applyProfileWidgetSurface(el, tile) {
  if (tile.type === "avatar" || tile.type === "banner") return;
  const chrome = profileTextChrome(tile.props, tile.type);
  if (tile.type !== "display_name") {
    el.classList.toggle("is-clear", !chrome.show_background);
    el.classList.toggle("has-surface", !!chrome.show_background);
  }
  el.classList.toggle("has-widget-border", !!chrome.show_border);
  if (chrome.show_border) {
    el.style.setProperty("--profile-widget-border-width", chrome.border_width + "px");
    el.style.setProperty("--profile-widget-border-color", chrome.border_color);
    el.style.setProperty("--profile-widget-border-style", chrome.border_style);
  } else {
    el.style.removeProperty("--profile-widget-border-width");
    el.style.removeProperty("--profile-widget-border-color");
    el.style.removeProperty("--profile-widget-border-style");
  }
}

function mountProfileTextChrome(el, tile) {
  const chrome = profileTextChrome(tile.props, tile.type);
  el.classList.add("is-text-chrome");
  el.dataset.textAlign = chrome.text_align;
  el.style.setProperty("--profile-text-size", chrome.text_size + "pt");
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
  const props = tile.props || {};
  const target = face || el;
  if (!props.show_border) {
    target.style.border = "";
    return;
  }
  const chrome = defaultBorderChrome(tile.type, props);
  target.style.border = chrome.border_width + "px " + chrome.border_style + " " + chrome.border_color;
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

function paintProfileSpacer(el) {
  if (!(profileEditing && profileIsOwn)) return;
  const note = document.createElement("div");
  note.className = "profile-spacer-label";
  note.textContent = "Spacer";
  el.appendChild(note);
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
  el.dataset.textAlign = chrome.text_align;
  el.style.setProperty("--profile-text-size", chrome.text_size + "pt");
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

function profileDurationText(ms, ended) {
  if (ended && ms <= 0) return "Ended";
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return days + "d " + profilePad2(hours) + ":" + profilePad2(minutes) + ":" + profilePad2(seconds);
  return profilePad2(hours) + ":" + profilePad2(minutes) + ":" + profilePad2(seconds);
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
    if (mode === "countdown") el.textContent = profileDurationText(at - Date.now(), true);
    if (mode === "timer") el.textContent = profileDurationText(Date.now() - at, false);
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
  el.dataset.textAlign = chrome.text_align;
  el.style.setProperty("--profile-text-size", chrome.text_size + "pt");
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

function paintProfileClock(tile, el) {
  const chrome = profileTextChrome(tile.props, "clock");
  el.classList.add("is-text-chrome");
  el.dataset.textAlign = chrome.text_align;
  el.style.setProperty("--profile-text-size", chrome.text_size + "pt");
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
      face.textContent = profileDurationText(at - Date.now(), true);
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
      face.textContent = profileDurationText(Date.now() - at, false);
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
    dot.textContent = typeof avatarLetter === "function" ? avatarLetter(shown) : shown.slice(0, 1);
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
  return type === "header" || type === "body" || type === "footnote" || type === "list" || type === "bio" || type === "spoiler" || type === "stats" || type === "callout";
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

function profileStatRowsFromText(text) {
  return String(text || "").split("\n").slice(0, 20).map(line => {
    const idx = line.indexOf("|");
    if (idx === -1) return { label: line.trim(), value: "" };
    return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
  }).filter(row => row.label || row.value);
}

function profileStatRowsToText(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const label = (row && row.label) || "";
    const value = (row && row.value) || "";
    return value ? label + " | " + value : label;
  }).join("\n");
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

function paintProfileStats(tile, el) {
  const rows = Array.isArray(tile.props && tile.props.rows) ? tile.props.rows : [];
  if (profileEditing && profileIsOwn) {
    const area = document.createElement("textarea");
    area.className = "profile-tile-list-edit";
    area.value = profileStatRowsToText(rows);
    area.placeholder = "Label | value  (one per line)";
    bindProfileTextField(area, tile, (value) => {
      tile.props.rows = profileStatRowsFromText(value);
    });
    el.appendChild(area);
    return;
  }
  const table = document.createElement("div");
  table.className = "profile-stats";
  const shown = rows.filter(row => (row && (row.label || row.value)));
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "is-empty";
    empty.textContent = "No stats yet.";
    table.appendChild(empty);
  } else {
    shown.forEach(row => {
      const label = document.createElement("div");
      label.className = "profile-stat-label";
      label.textContent = row.label || "";
      const value = document.createElement("div");
      value.className = "profile-stat-value";
      value.textContent = row.value || "";
      table.appendChild(label);
      table.appendChild(value);
    });
  }
  el.appendChild(table);
}

function paintProfileCallout(tile, el) {
  const text = (tile.props && tile.props.text) || "";
  const tone = (tile.props && tile.props.tone) === "warning" ? "warning" : "tip";
  if (profileEditing && profileIsOwn) {
    const area = document.createElement("textarea");
    area.className = "profile-callout-copy is-" + tone;
    area.value = text;
    area.maxLength = 300;
    area.placeholder = tone === "warning" ? "Warning" : "Tip";
    bindProfileTextField(area, tile, (value) => { tile.props.text = value; });
    el.appendChild(area);
    return;
  }
  const node = document.createElement("div");
  node.className = "profile-callout-copy is-" + tone;
  node.textContent = text || (tone === "warning" ? "Warning" : "Tip");
  if (!text) node.classList.add("is-empty");
  el.appendChild(node);
}

function paintProfilePlaceholder(tile, el) {
  const meta = PROFILE_TILE_TYPES[tile.type] || { label: "Element" };
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = meta.label;
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const note = document.createElement("div");
  note.className = "profile-placeholder-note";
  note.textContent = "Placeholder. This piece isn't wired yet.";
  body.appendChild(note);
  el.classList.add("is-placeholder");
  el.appendChild(head);
  el.appendChild(body);
}

function paintProfileTileContent(tile, el) {
  el.innerHTML = "";
  el.classList.toggle("is-compact-row", Number(tile.h) === 1);
  if (tile.type === "banner") {
    el.style.background = (tile.props && tile.props.color) || "#1e6b8a";
    applyProfileTileBorder(el, tile);
    return;
  }
  el.style.background = "";
  if (tile.type === "avatar") {
    const face = document.createElement("div");
    face.className = "profile-tile-avatar";
    face.textContent = typeof avatarLetter === "function" ? avatarLetter(profileOwnerName()) : (profileOwnerName() || "?").slice(0, 1);
    applyProfileTileBorder(el, tile, face);
    el.appendChild(face);
    return;
  }
  applyProfileWidgetSurface(el, tile);
  if (tile.type === "display_name") {
    const row = document.createElement("div");
    row.className = "profile-tile-name-row";
    const name = document.createElement("div");
    name.className = "profile-tile-name";
    name.textContent = profileOwnerName();
    row.appendChild(name);
    const aliases = profileOwnerAliases();
    if (aliases.length) {
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
          avatarText: (profileOwnerName() || "?").slice(0, 1),
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
  if (tile.type === "stats") {
    paintProfileStats(tile, host);
    return;
  }
  if (tile.type === "callout") {
    paintProfileCallout(tile, host);
    return;
  }
  if (tile.type === "bio") {
    paintProfileCopy(tile, host, "bio");
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
  if (tile.type === "spacer") {
    paintProfileSpacer(el);
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
  if (tile.type === "clock") {
    paintProfileClock(tile, el);
    return;
  }
  if (PROFILE_TILE_TYPES[tile.type] && PROFILE_TILE_TYPES[tile.type].placeholder) {
    paintProfilePlaceholder(tile, el);
    return;
  }
  mountProfileFixedTitle(el, "Friends");
  applyProfileWidgetSurface(el, tile);
  applyProfileFriendSize(el, tile);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  paintProfileFriends(body);
  el.appendChild(body);
}

function renderProfileBoard() {
  const board = document.getElementById("profile-board");
  if (!board) return;
  bindProfileBoardScale();
  board.style.transform = "none";
  board.innerHTML = "";
  board.classList.toggle("is-editing", !!(profileEditing && profileIsOwn));
  board.style.gap = PROFILE_GAP + "px";
  const layout = profileDraft || profileSavedLayout;
  const page = profilePageById(layout, profileActivePageId);
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
  tiles.forEach((tile, index) => {
    if (tile.type === "details") tile.type = "local_time";
    if (tile.type === "countdown") {
      tile.type = "clock";
      tile.props = tile.props || {};
      if (tile.props.mode !== "timer" && tile.props.mode !== "world") tile.props.mode = "countdown";
    }
    const size = clampProfileTileSize(tile.type, tile.w, tile.h, tile.x, tile);
    tile.w = size.w;
    tile.h = size.h;
    const el = document.createElement("div");
    el.className = "profile-tile is-" + tile.type + (profileEditing ? " is-editing" : "") + (tile.allow_overlap ? " allows-overlap" : "");
    el.dataset.tileId = tile.id;
    el.style.zIndex = String(10 + index);
    applyProfileTileStyle(el, tile);
    paintProfileTileContent(tile, el);
    if (profileEditing && profileIsOwn && typeof bindProfileTileDrag === "function") {
      const handle = document.createElement("div");
      handle.className = "profile-resize";
      el.appendChild(handle);
      bindProfileTileDrag(el, tile, handle);
      el.addEventListener("dblclick", (e) => {
        if (e.target.closest(".profile-resize")) return;
        if (tile.type === "link_tree" || tile.type === "local_time" || tile.type === "details" || tile.type === "icon" || tile.type === "clock") {
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
