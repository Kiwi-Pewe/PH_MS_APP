// Generic right-click context menu engine — shared across every page and
// feature (DMs now, groups/servers later). This file knows nothing about
// messages, friends, or any specific feature; it only knows how to build
// and position a menu from data it's handed. Callers (e.g. app.js) gather
// the real data — who/what was clicked, which options apply, what each
// option should do — and pass it to openContextMenu().
//
// Options may include a Discord-style nested flyout via `submenu: [...]`
// (radio / check / separator / disabled rows). Flyouts stay on the same
// context-menu engine — not a second menu system, not a centered submenu.

let activeMenuEl = null;
let activeFlyoutEl = null;
let activeFlyoutAnchor = null;

// x, y: viewport coordinates to open at (usually event.clientX/clientY).
// reference: optional { avatarText, title, subtitle, timestamp }.
// options: array of { label, danger, disabled, onSelect, detail, submenu }
//   or { separator: true }. `submenu` opens a nested flyout (hover/click).
function openContextMenu(x, y, reference, options) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  if (reference) {
    menu.appendChild(buildReferenceArea(reference));
  }

  options.filter(Boolean).forEach(opt => {
    if (opt.separator) {
      const line = document.createElement("div");
      line.className = "context-menu-separator";
      menu.appendChild(line);
      return;
    }
    const item = document.createElement("div");
    item.className = "context-menu-item"
      + (opt.danger ? " danger" : "")
      + (opt.disabled ? " disabled" : "")
      + (opt.submenu ? " has-submenu" : "");

    if (opt.submenu && !opt.disabled) {
      const main = document.createElement("div");
      main.className = "context-menu-item-main";
      const label = document.createElement("div");
      label.className = "context-menu-item-label";
      label.textContent = opt.label;
      main.appendChild(label);
      if (opt.detail) {
        const detail = document.createElement("div");
        detail.className = "context-menu-item-detail";
        detail.textContent = opt.detail;
        main.appendChild(detail);
      }
      item.appendChild(main);
      const chev = document.createElement("span");
      chev.className = "context-menu-item-chevron";
      chev.textContent = "\u203A";
      item.appendChild(chev);
      const openFly = () => openContextFlyout(item, opt.submenu);
      item.addEventListener("mouseenter", openFly);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openFly();
      });
    } else {
      item.textContent = opt.label;
      item.addEventListener("mouseenter", () => {
        if (activeFlyoutEl) closeFlyoutOnly();
      });
      if (!opt.disabled) {
        item.addEventListener("click", () => {
          closeContextMenu();
          if (typeof opt.onSelect === "function") opt.onSelect();
        });
      }
    }
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  positionMenu(menu, x, y);
  activeMenuEl = menu;

  setTimeout(() => {
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("contextmenu", closeOnOutsideContextMenu);
  }, 0);
  document.addEventListener("keydown", closeOnEscape);
}

function buildReferenceArea(reference) {
  const ref = document.createElement("div");
  ref.className = "context-menu-reference";

  const avatar = document.createElement("div");
  avatar.className = "context-menu-avatar";
  if (typeof paintUserFace === "function" && (reference.avatar || reference.userId)) {
    paintUserFace(avatar, { avatar: reference.avatar, id: reference.userId, username: reference.title }, { name: reference.title || reference.avatarText, userId: reference.userId });
  } else {
    avatar.textContent = reference.avatarText || "?";
  }
  ref.appendChild(avatar);

  const textCol = document.createElement("div");
  textCol.className = "context-menu-reference-text";

  const titleRow = document.createElement("div");
  titleRow.className = "context-menu-title-row";
  const title = document.createElement("span");
  title.className = "context-menu-title";
  title.textContent = reference.title || "";
  titleRow.appendChild(title);
  if (reference.timestamp) {
    const time = document.createElement("span");
    time.className = "context-menu-timestamp";
    time.textContent = reference.timestamp;
    titleRow.appendChild(time);
  }
  textCol.appendChild(titleRow);

  if (reference.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "context-menu-subtitle";
    subtitle.textContent = reference.subtitle;
    textCol.appendChild(subtitle);
  }

  ref.appendChild(textCol);
  return ref;
}

function openContextFlyout(anchorItem, rows) {
  if (!activeMenuEl || !anchorItem || !rows) return;
  if (activeFlyoutAnchor === anchorItem && activeFlyoutEl) return;

  closeFlyoutOnly();
  activeFlyoutAnchor = anchorItem;

  const fly = document.createElement("div");
  fly.className = "context-menu context-menu-flyout";
  fly.addEventListener("click", (e) => e.stopPropagation());

  rows.filter(Boolean).forEach((row) => {
    if (row.separator) {
      const line = document.createElement("div");
      line.className = "context-menu-separator";
      fly.appendChild(line);
      return;
    }
    const item = document.createElement("div");
    const kind = row.type || "action";
    item.className = "context-menu-item"
      + (row.disabled ? " disabled" : "")
      + (kind === "radio" ? " is-radio" : "")
      + (kind === "check" ? " is-check" : "");

    const label = document.createElement("span");
    label.className = "context-menu-flyout-label";
    label.textContent = row.label || "";
    item.appendChild(label);

    const mark = document.createElement("span");
    mark.className = "context-menu-flyout-mark";
    if (kind === "radio") {
      mark.classList.add("radio-mark");
      if (row.checked) mark.classList.add("is-on");
    } else if (kind === "check") {
      mark.classList.add("check-mark");
      if (row.checked) {
        mark.classList.add("is-on");
        mark.textContent = "\u2713";
      }
    }
    item.appendChild(mark);

    if (!row.disabled) {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (kind === "radio") {
          fly.querySelectorAll(".context-menu-item.is-radio").forEach((el) => {
            const m = el.querySelector(".radio-mark");
            if (m) m.classList.toggle("is-on", el === item);
          });
          row.checked = true;
        } else if (kind === "check") {
          row.checked = !row.checked;
          mark.classList.toggle("is-on", !!row.checked);
          mark.textContent = row.checked ? "\u2713" : "";
        }
        // After visual state so onSelect sees the new checked value.
        if (typeof row.onSelect === "function") row.onSelect(row);
      });
    }
    fly.appendChild(item);
  });

  document.body.appendChild(fly);
  activeFlyoutEl = fly;
  positionFlyout(fly, anchorItem);
}

function positionFlyout(fly, anchorItem) {
  const z = pageZoom();
  const rect = anchorItem.getBoundingClientRect();
  const menuRect = activeMenuEl ? activeMenuEl.getBoundingClientRect() : rect;
  let left = menuRect.right + 4;
  let top = rect.top;
  fly.style.left = (left / z) + "px";
  fly.style.top = (top / z) + "px";
  const box = fly.getBoundingClientRect();
  if (box.right > window.innerWidth) {
    left = menuRect.left - box.width - 4;
    fly.style.left = (Math.max(0, left) / z) + "px";
  }
  if (box.bottom > window.innerHeight) {
    top = Math.max(0, window.innerHeight - box.height);
    fly.style.top = (top / z) + "px";
  }
}

function closeFlyoutOnly() {
  if (activeFlyoutEl) {
    activeFlyoutEl.remove();
    activeFlyoutEl = null;
  }
  activeFlyoutAnchor = null;
}

function closeOnOutsideClick(e) {
  if (activeMenuEl && activeMenuEl.contains(e.target)) return;
  if (activeFlyoutEl && activeFlyoutEl.contains(e.target)) return;
  closeContextMenu();
}

function closeOnOutsideContextMenu(e) {
  if (activeMenuEl && activeMenuEl.contains(e.target)) return;
  if (activeFlyoutEl && activeFlyoutEl.contains(e.target)) return;
  closeContextMenu();
}

function closeOnEscape(e) {
  if (e.key === "Escape") closeContextMenu();
}

function closeContextMenu() {
  closeFlyoutOnly();
  if (activeMenuEl) {
    activeMenuEl.remove();
    activeMenuEl = null;
  }
  document.removeEventListener("click", closeOnOutsideClick);
  document.removeEventListener("contextmenu", closeOnOutsideContextMenu);
  document.removeEventListener("keydown", closeOnEscape);
}

function pageZoom() {
  const raw = document.documentElement.style.zoom;
  const z = Number(raw);
  return raw && Number.isFinite(z) && z > 0 ? z : 1;
}

function positionMenu(menu, x, y) {
  const z = pageZoom();
  menu.style.left = (x / z) + "px";
  menu.style.top = (y / z) + "px";
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (Math.max(0, x - rect.width) / z) + "px";
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (Math.max(0, y - rect.height) / z) + "px";
  }
}

function truncateForContextMenu(text, maxLength = 18) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return trimmed + "...";
}
