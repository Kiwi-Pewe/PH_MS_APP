// ==================================================================
// profile-identity.js - One picture / banner for every surface.
// Crop is free-drag like Discord. Draft until Profile Save.
// GIF search stays grey until Tenor.
// ==================================================================

const IDENTITY_RECENT_MAX = 6;
const IDENTITY_ZOOM_MIN = 1;
const IDENTITY_ZOOM_MAX = 3;
let ownIdentityCache = null;

function defaultIdentityCrop() {
  return { zoom: 1, rotation: 0, x: 0.5, y: 0.5 };
}

function emptyIdentityMedia() {
  return { key: "", url: "", mime: "", size: 0, name: "", crop: defaultIdentityCrop() };
}

function normalizeIdentityCrop(raw) {
  const crop = raw && typeof raw === "object" ? raw : {};
  let zoom = Number(crop.zoom);
  if (!isFinite(zoom)) zoom = 1;
  zoom = Math.min(IDENTITY_ZOOM_MAX, Math.max(IDENTITY_ZOOM_MIN, zoom));
  let rotation = parseInt(crop.rotation, 10);
  if (!isFinite(rotation)) rotation = 0;
  rotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  function axis(value) {
    const n = Number(value);
    if (!isFinite(n)) return 0.5;
    return Math.min(1, Math.max(0, n));
  }
  return { zoom: zoom, rotation: rotation, x: axis(crop.x), y: axis(crop.y) };
}

function cloneIdentityMedia(media) {
  const src = media && typeof media === "object" ? media : {};
  const out = emptyIdentityMedia();
  out.key = src.key || "";
  out.url = src.url || "";
  out.mime = src.mime || "";
  out.size = src.size || 0;
  out.name = src.name || "";
  out.crop = normalizeIdentityCrop(src.crop);
  if (src._file) out._file = src._file;
  if (src._previewUrl) out._previewUrl = src._previewUrl;
  if (src._ownedPreview) out._ownedPreview = true;
  return out;
}

function identitySrc(media) {
  if (!media) return "";
  return media._previewUrl || media.url || "";
}

function identityHasImage(media) {
  return !!(media && (media._file || media.key || identitySrc(media)));
}

function ensureIdentityLayout(layout) {
  const host = layout || {};
  if (!host.identity || typeof host.identity !== "object") host.identity = {};
  if (!host.identity.avatar) host.identity.avatar = emptyIdentityMedia();
  if (!host.identity.banner) host.identity.banner = emptyIdentityMedia();
  if (!host.image_recents || typeof host.image_recents !== "object") {
    host.image_recents = { avatar: [], banner: [] };
  }
  if (!Array.isArray(host.image_recents.avatar)) host.image_recents.avatar = [];
  if (!Array.isArray(host.image_recents.banner)) host.image_recents.banner = [];
  return host;
}

function identityLayout() {
  return ensureIdentityLayout(profileDraft || profileSavedLayout || {});
}

function getIdentityMedia(kind) {
  const layout = identityLayout();
  return cloneIdentityMedia(layout.identity[kind === "banner" ? "banner" : "avatar"]);
}

function identityMediaForPaint(kind, tile) {
  const props = tile && tile.props;
  if (props && (props._file || props._previewUrl || props.key || (props.url && String(props.url).indexOf("blob:") === 0))) {
    return cloneIdentityMedia(props);
  }
  if (props && props.key && props.url) return cloneIdentityMedia(props);
  return getIdentityMedia(kind);
}

function getIdentityRecents(kind) {
  const layout = identityLayout();
  const list = layout.image_recents[kind === "banner" ? "banner" : "avatar"] || [];
  return list.filter((row) => row && row.url).slice(0, IDENTITY_RECENT_MAX);
}

function setIdentityMedia(kind, media) {
  const layout = ensureIdentityLayout(profileDraft || {});
  const next = cloneIdentityMedia(media);
  const slot = kind === "banner" ? "banner" : "avatar";
  const prev = layout.identity[slot];
  if (prev && prev._previewUrl && prev._previewUrl !== next._previewUrl) {
    URL.revokeObjectURL(prev._previewUrl);
  }
  layout.identity[slot] = next;
}

function pushIdentityRecent(layout, kind, media) {
  if (!media || !media.key) return;
  const host = ensureIdentityLayout(layout);
  const slot = kind === "banner" ? "banner" : "avatar";
  const next = {
    key: media.key,
    url: media.url || "",
    mime: media.mime || "",
    size: media.size || 0,
    name: media.name || ""
  };
  const kept = [next].concat((host.image_recents[slot] || []).filter((row) => row && row.key && row.key !== next.key));
  host.image_recents[slot] = kept.slice(0, IDENTITY_RECENT_MAX);
}

function dropIdentityDrafts(layout) {
  const ident = layout && layout.identity;
  if (!ident) return;
  ["avatar", "banner"].forEach((kind) => {
    const media = ident[kind];
    if (!media) return;
    if (media._previewUrl) URL.revokeObjectURL(media._previewUrl);
    delete media._file;
    delete media._previewUrl;
    delete media._ownedPreview;
  });
}

function identityCoverScale(natW, natH, frameW, frameH, rotation) {
  const rot = ((rotation % 360) + 360) % 360;
  const boxW = rot % 180 === 0 ? natW : natH;
  const boxH = rot % 180 === 0 ? natH : natW;
  if (!boxW || !boxH || !frameW || !frameH) return 1;
  return Math.max(frameW / boxW, frameH / boxH);
}

function clampIdentityCrop(crop, natW, natH, frameW, frameH) {
  const next = normalizeIdentityCrop(crop);
  const rot = next.rotation;
  const boxW0 = rot % 180 === 0 ? natW : natH;
  const boxH0 = rot % 180 === 0 ? natH : natW;
  const cover = identityCoverScale(natW, natH, frameW, frameH, rot);
  const boxW = boxW0 * cover * next.zoom;
  const boxH = boxH0 * cover * next.zoom;
  const minX = boxW <= frameW ? 0.5 : (frameW / 2) / boxW;
  const maxX = 1 - minX;
  const minY = boxH <= frameH ? 0.5 : (frameH / 2) / boxH;
  const maxY = 1 - minY;
  next.x = Math.min(maxX, Math.max(minX, next.x));
  next.y = Math.min(maxY, Math.max(minY, next.y));
  return next;
}

function applyIdentityCropToImg(img, crop, frameW, frameH) {
  const natW = img.naturalWidth || 1;
  const natH = img.naturalHeight || 1;
  const next = clampIdentityCrop(crop, natW, natH, frameW, frameH);
  const cover = identityCoverScale(natW, natH, frameW, frameH, next.rotation);
  const scale = cover * next.zoom;
  const rot = next.rotation;
  const boxW = (rot % 180 === 0 ? natW : natH) * scale;
  const boxH = (rot % 180 === 0 ? natH : natW) * scale;
  img.style.width = (natW * scale) + "px";
  img.style.height = (natH * scale) + "px";
  img.style.left = (frameW / 2 + (0.5 - next.x) * boxW) + "px";
  img.style.top = (frameH / 2 + (0.5 - next.y) * boxH) + "px";
  img.style.transformOrigin = "center center";
  img.style.transform = "translate(-50%, -50%) rotate(" + rot + "deg)";
  return next;
}

function paintIdentityMedia(host, media, opts) {
  opts = opts || {};
  if (!host) return;
  const existing = host.querySelector(":scope > .identity-media");
  if (existing) existing.remove();
  if (!identityHasImage(media)) return;
  const layer = document.createElement("div");
  layer.className = "identity-media" + (opts.circle ? " is-circle" : "");
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.src = identitySrc(media);
  function layout() {
    const fw = host.clientWidth;
    const fh = host.clientHeight;
    if (!fw || !fh || !img.naturalWidth) return;
    applyIdentityCropToImg(img, media.crop, fw, fh);
  }
  img.addEventListener("load", layout);
  layer.appendChild(img);
  host.appendChild(layer);
  if (img.complete) layout();
}

function rememberOwnIdentity(layout) {
  if (!layout || !layout.identity) return;
  ownIdentityCache = {
    avatar: cloneIdentityMedia(layout.identity.avatar),
    banner: cloneIdentityMedia(layout.identity.banner)
  };
}

function paintOwnFooterAvatar() {
  const wrap = document.querySelector("#account-footer .avatar-dot");
  const letter = document.getElementById("footer-avatar-letter");
  if (!wrap) return;
  const media = (typeof profileIsOwn !== "undefined" && profileIsOwn)
    ? getIdentityMedia("avatar")
    : (ownIdentityCache && ownIdentityCache.avatar);
  const existing = wrap.querySelector(":scope > .identity-media");
  if (existing) existing.remove();
  if (identityHasImage(media)) {
    if (letter) letter.hidden = true;
    paintIdentityMedia(wrap, media, { circle: true });
  } else if (letter) {
    letter.hidden = false;
  }
}

async function flushIdentityUploads(layout) {
  if (!layout) return;
  const host = ensureIdentityLayout(layout);
  for (const kind of ["avatar", "banner"]) {
    const media = host.identity[kind];
    if (!media || !media._file) continue;
    if (typeof uploadProfileImageFile !== "function") throw new Error("Upload is not available.");
    const att = await uploadProfileImageFile(media._file);
    media.key = att.key;
    media.url = att.url;
    media.mime = att.mime;
    media.size = att.size;
    media.name = att.name || media.name || "";
    if (media._previewUrl) URL.revokeObjectURL(media._previewUrl);
    delete media._file;
    delete media._previewUrl;
    delete media._ownedPreview;
    pushIdentityRecent(host, kind, media);
  }
}

function applyIdentityDraft(kind, draft) {
  setIdentityMedia(kind, draft);
  if (draft) {
    delete draft._file;
    delete draft._previewUrl;
    delete draft._ownedPreview;
    delete draft.key;
    delete draft.url;
    delete draft.mime;
    delete draft.size;
    delete draft.name;
    delete draft.crop;
  }
}

function findIdentityBoardTile(type) {
  const layout = profileDraft || profileSavedLayout || {};
  const pages = layout.pages || [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    if (page.id === "mini_profile") continue;
    const tiles = page.tiles || [];
    for (let j = 0; j < tiles.length; j += 1) {
      if (tiles[j].type === type) return tiles[j];
    }
  }
  return { id: "identity-" + type, type: type, props: {}, x: 0, y: 0, w: 4, h: 4 };
}

function seedIdentityOptionsDraft(tile, draft) {
  if (tile.type !== "avatar" && tile.type !== "banner") return;
  const ident = getIdentityMedia(tile.type);
  draft.key = ident.key;
  draft.url = ident.url;
  draft.mime = ident.mime;
  draft.size = ident.size;
  draft.name = ident.name;
  draft.crop = ident.crop;
  if (ident._file) draft._file = ident._file;
  if (ident._previewUrl) draft._previewUrl = ident._previewUrl;
}

function dropIdentityOptionsDraft(draft, tile) {
  if (!draft) return;
  if (tile && (tile.type === "avatar" || tile.type === "banner")) {
    const ident = getIdentityMedia(tile.type);
    if (draft._ownedPreview && draft._previewUrl && draft._previewUrl !== ident._previewUrl) {
      URL.revokeObjectURL(draft._previewUrl);
    }
    delete draft._file;
    delete draft._previewUrl;
    delete draft._ownedPreview;
    return;
  }
  if (typeof dropProfileImageDraft === "function") dropProfileImageDraft(draft);
}

function fillIdentityImageOptions(box, kind, draft, onChange, hintEl) {
  if (!draft.crop) draft.crop = defaultIdentityCrop();
  const noun = kind === "banner" ? "banner" : "profile picture";
  const note = document.createElement("div");
  note.className = "settings-opt-desc";
  note.textContent = "One " + noun + " everywhere. Jpeg, png, gif, or webp. Max 5 MB. Animated gifs play for everyone.";
  box.appendChild(note);

  const preview = document.createElement("div");
  preview.className = "identity-opt-preview" + (kind === "avatar" ? " is-circle" : " is-banner");
  function paintPreview() {
    preview.innerHTML = "";
    if (identityHasImage(draft)) paintIdentityMedia(preview, draft, { circle: kind === "avatar" });
    else preview.textContent = kind === "avatar" ? "No picture" : "No image";
  }

  const actions = document.createElement("div");
  actions.className = "profile-opt-image-actions";
  const change = document.createElement("button");
  change.type = "button";
  change.className = "profile-link-add";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";

  function paintButtons() {
    const has = identityHasImage(draft);
    change.textContent = has ? "Change image" : "Upload image";
    remove.hidden = !has;
  }

  if (typeof profileOptHint === "function") {
    profileOptHint(change, "Upload a picture or pick one you used recently. Changes wait for Profile Save.", hintEl);
  }
  change.addEventListener("click", () => {
    openIdentityPicker(kind, draft, (media) => {
      if (draft._ownedPreview && draft._previewUrl && draft._previewUrl !== media._previewUrl) {
        URL.revokeObjectURL(draft._previewUrl);
      }
      Object.assign(draft, media);
      paintButtons();
      paintPreview();
      onChange();
    });
  });
  remove.addEventListener("click", () => {
    if (draft._ownedPreview && draft._previewUrl) URL.revokeObjectURL(draft._previewUrl);
    draft.key = "";
    draft.url = "";
    draft.mime = "";
    draft.size = 0;
    draft.name = "";
    draft.crop = defaultIdentityCrop();
    delete draft._file;
    delete draft._previewUrl;
    delete draft._ownedPreview;
    paintButtons();
    paintPreview();
    onChange();
  });

  actions.appendChild(change);
  actions.appendChild(remove);
  box.appendChild(preview);
  box.appendChild(actions);
  paintButtons();
  paintPreview();
}

function openIdentityPicker(kind, current, onPicked) {
  const overlay = document.createElement("div");
  overlay.className = "identity-overlay";
  const box = document.createElement("div");
  box.className = "identity-picker";
  const title = document.createElement("h3");
  title.textContent = kind === "banner" ? "Change Banner" : "Change Profile Picture";
  box.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "identity-picker-actions";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/gif,image/webp";
  fileInput.hidden = true;
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "settings-form-save";
  upload.textContent = "Upload image";
  const gif = document.createElement("button");
  gif.type = "button";
  gif.textContent = "Choose a GIF";
  gif.disabled = true;
  gif.title = "GIF search is coming soon.";
  upload.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const reason = typeof rejectProfileImage === "function" ? rejectProfileImage(file) : "Upload is not available.";
    if (reason) {
      window.alert(reason);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    overlay.remove();
    openIdentityCropper(kind, {
      key: "",
      url: previewUrl,
      mime: typeof fileMime === "function" ? fileMime(file) : file.type,
      size: file.size,
      name: file.name || "",
      crop: defaultIdentityCrop(),
      _file: file,
      _previewUrl: previewUrl,
      _ownedPreview: true
    }, onPicked, () => URL.revokeObjectURL(previewUrl));
  });
  actions.appendChild(upload);
  actions.appendChild(gif);
  box.appendChild(fileInput);
  box.appendChild(actions);

  const recentsWrap = document.createElement("div");
  recentsWrap.className = "identity-recents";
  const recentsLabel = document.createElement("div");
  recentsLabel.className = "identity-recents-label";
  recentsLabel.textContent = "Recent images";
  recentsWrap.appendChild(recentsLabel);
  const grid = document.createElement("div");
  grid.className = "identity-recents-grid";
  const recents = getIdentityRecents(kind);
  for (let i = 0; i < IDENTITY_RECENT_MAX; i += 1) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "identity-recent";
    const row = recents[i];
    if (row) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = row.url;
      slot.appendChild(img);
      slot.addEventListener("click", () => {
        overlay.remove();
        openIdentityCropper(kind, {
          key: row.key,
          url: row.url,
          mime: row.mime || "",
          size: row.size || 0,
          name: row.name || "",
          crop: (current && current.key === row.key) ? normalizeIdentityCrop(current.crop) : defaultIdentityCrop()
        }, onPicked, null);
      });
    } else {
      slot.disabled = true;
      slot.classList.add("is-empty");
    }
    grid.appendChild(slot);
  }
  recentsWrap.appendChild(grid);
  box.appendChild(recentsWrap);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "identity-picker-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  box.appendChild(cancel);

  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function openIdentityCropper(kind, media, onApply, onCancel) {
  const working = cloneIdentityMedia(media);
  working.crop = normalizeIdentityCrop(working.crop);
  const frame = kind === "banner"
    ? { w: 480, h: 160, circle: false, title: "Edit Banner" }
    : { w: 256, h: 256, circle: true, title: "Edit Profile Picture" };

  const overlay = document.createElement("div");
  overlay.className = "identity-overlay";
  const box = document.createElement("div");
  box.className = "identity-cropper";
  const title = document.createElement("h3");
  title.textContent = frame.title;
  box.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "identity-crop-hint";
  hint.textContent = "Drag to reposition. Same crop is used everywhere; Mini Profile just scales it down.";
  box.appendChild(hint);

  const stage = document.createElement("div");
  stage.className = "identity-crop-stage";
  const view = document.createElement("div");
  view.className = "identity-crop-frame" + (frame.circle ? " is-circle" : " is-banner");
  view.style.width = frame.w + "px";
  view.style.height = frame.h + "px";
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.src = identitySrc(working);
  view.appendChild(img);
  stage.appendChild(view);
  box.appendChild(stage);

  const zoomRow = document.createElement("label");
  zoomRow.className = "identity-crop-zoom";
  zoomRow.textContent = "Zoom";
  const zoom = document.createElement("input");
  zoom.type = "range";
  zoom.min = String(IDENTITY_ZOOM_MIN);
  zoom.max = String(IDENTITY_ZOOM_MAX);
  zoom.step = "0.01";
  zoom.value = String(working.crop.zoom);
  zoomRow.appendChild(zoom);
  box.appendChild(zoomRow);

  const tools = document.createElement("div");
  tools.className = "identity-crop-tools";
  const rotate = document.createElement("button");
  rotate.type = "button";
  rotate.textContent = "Rotate";
  tools.appendChild(rotate);
  box.appendChild(tools);

  const actions = document.createElement("div");
  actions.className = "identity-crop-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "settings-form-save";
  apply.textContent = "Apply";
  actions.appendChild(cancel);
  actions.appendChild(apply);
  box.appendChild(actions);

  function layout() {
    if (!img.naturalWidth) return;
    working.crop = applyIdentityCropToImg(img, working.crop, frame.w, frame.h);
    zoom.value = String(working.crop.zoom);
  }

  img.addEventListener("load", layout);
  zoom.addEventListener("input", () => {
    working.crop.zoom = Number(zoom.value) || 1;
    layout();
  });
  rotate.addEventListener("click", () => {
    working.crop.rotation = (working.crop.rotation + 90) % 360;
    layout();
  });

  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    view.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, cropX: working.crop.x, cropY: working.crop.y };
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag || !img.naturalWidth) return;
    const cover = identityCoverScale(img.naturalWidth, img.naturalHeight, frame.w, frame.h, working.crop.rotation);
    const scale = cover * working.crop.zoom;
    const rot = working.crop.rotation;
    const boxW = (rot % 180 === 0 ? img.naturalWidth : img.naturalHeight) * scale;
    const boxH = (rot % 180 === 0 ? img.naturalHeight : img.naturalWidth) * scale;
    working.crop.x = drag.cropX - (e.clientX - drag.x) / boxW;
    working.crop.y = drag.cropY - (e.clientY - drag.y) / boxH;
    layout();
  });
  function endDrag() { drag = null; }
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);

  function close(ok) {
    overlay.remove();
    if (ok) onApply(working);
    else if (onCancel) onCancel();
  }
  cancel.addEventListener("click", () => close(false));
  apply.addEventListener("click", () => close(true));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(false);
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  if (img.complete) layout();
}
