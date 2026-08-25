// Generic right-click context menu engine — shared across every page and
// feature (DMs now, groups/servers later). This file knows nothing about
// messages, friends, or any specific feature; it only knows how to build
// and position a menu from data it's handed. Callers (e.g. app.js) gather
// the real data — who/what was clicked, which options apply, what each
// option should do — and pass it to openContextMenu().

let activeMenuEl = null;

// x, y: viewport coordinates to open at (usually event.clientX/clientY).
// reference: optional { avatarText, title, subtitle, timestamp }. This
//   renders the header block that shows what was right-clicked. Pass
//   null/undefined for a menu with no reference area (e.g. right-
//   clicking empty space) — the menu will just be a plain option list.
// options: array of { label, danger, onSelect }. `danger` is optional
//   (styles the item red, e.g. for Delete/Block). Falsy entries in the
//   array are skipped, so callers can build the list with plain
//   `condition && {...}` entries instead of filtering by hand.
function openContextMenu(x, y, reference, options) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  if (reference) {
    menu.appendChild(buildReferenceArea(reference));
  }

  options.filter(Boolean).forEach(opt => {
    const item = document.createElement("div");
    item.className = "context-menu-item" + (opt.danger ? " danger" : "");
    item.textContent = opt.label;
    item.addEventListener("click", () => {
      closeContextMenu();
      opt.onSelect();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  positionMenu(menu, x, y);
  activeMenuEl = menu;

  // Deferred by one tick so the same right-click that opened this menu
  // doesn't immediately trigger the outside-click handler and close it —
  // contextmenu and click can both fire off a single physical click.
  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
    document.addEventListener("contextmenu", closeOnOutsideContextMenu);
  }, 0);
  document.addEventListener("keydown", closeOnEscape);
}

function buildReferenceArea(reference) {
  const ref = document.createElement("div");
  ref.className = "context-menu-reference";

  const avatar = document.createElement("div");
  avatar.className = "context-menu-avatar";
  avatar.textContent = reference.avatarText || "?";
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

function closeOnOutsideContextMenu(e) {
  if (activeMenuEl && !activeMenuEl.contains(e.target)) closeContextMenu();
}

function closeOnEscape(e) {
  if (e.key === "Escape") closeContextMenu();
}

function closeContextMenu() {
  if (activeMenuEl) {
    activeMenuEl.remove();
    activeMenuEl = null;
  }
  document.removeEventListener("contextmenu", closeOnOutsideContextMenu);
  document.removeEventListener("keydown", closeOnEscape);
}

// Keeps the menu on-screen — flips to open leftward/upward from the
// click point if it would otherwise overflow the viewport edge.
function positionMenu(menu, x, y) {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${Math.max(0, x - rect.width)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${Math.max(0, y - rect.height)}px`;
  }
}

// Truncates message preview text for a context menu's reference area.
// Cuts at the nearest whole word under maxLength rather than mid-word,
// then appends "..." — only if something was actually cut off. Exposed
// here (not baked into a fixed number) since the exact length is still
// being tuned — see Handoff.md.
function truncateForContextMenu(text, maxLength = 18) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return trimmed + "...";
}
