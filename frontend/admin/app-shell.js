const ADMIN_PAGES = [];
const adminSectionByPage = {};

let adminUser = null;
let adminPage = "overview";
let adminSection = "statistics";

function registerAdminPage(page) {
  ADMIN_PAGES.push(page);
}

function adminPageById(id) {
  return ADMIN_PAGES.find((page) => page.id === id);
}

function currentAdminPage() {
  return adminPageById(adminPage);
}

function firstSectionId(page) {
  const first = page && page.sections && page.sections[0];
  return first ? first.id : "";
}

function paintAdminPages() {
  const host = document.getElementById("admin-pages");
  if (!host) return;
  host.innerHTML = "";
  ADMIN_PAGES.forEach((page) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = page.label;
    if (adminPage === page.id) btn.className = "is-on";
    btn.addEventListener("click", () => showAdminPage(page.id));
    host.appendChild(btn);
  });
}

function paintAdminLeftHead() {
  const host = document.getElementById("admin-left-head");
  if (!host) return;
  host.innerHTML = "";
  const page = currentAdminPage();
  host.appendChild(adminEl("div", "admin-left-kicker", page ? page.label : ""));
  host.appendChild(adminIcon("down", "admin-left-caret"));
}

function paintAdminSections() {
  const host = document.getElementById("admin-sections");
  if (!host) return;
  host.innerHTML = "";
  const page = currentAdminPage();
  const sections = (page && page.sections) || [];
  sections.forEach((section) => {
    const on = adminSection === section.id;
    const btn = adminEl("button", "admin-section" + (on ? " is-on" : ""));
    btn.type = "button";
    if (section.icon) btn.appendChild(adminIcon(section.icon));
    btn.appendChild(adminEl("span", "admin-section-label", section.label));
    if (on) btn.appendChild(adminEl("span", "admin-section-dot"));
    btn.addEventListener("click", () => showAdminSection(section.id));
    host.appendChild(btn);
  });
}

function paintAdminLeftFoot() {
  const host = document.getElementById("admin-left-foot");
  if (!host) return;
  host.innerHTML = "";
  const note = adminEl("div", "admin-left-note");
  note.appendChild(adminIcon("eye"));
  note.appendChild(adminEl("span", "", "Read-only overview"));
  host.appendChild(note);
  const who = adminEl("div", "admin-who");
  const name = (adminUser && (adminUser.display_name || adminUser.username)) || "kiwi";
  const handle = (adminUser && adminUser.username) || "kiwi";
  const face = adminEl("div", "admin-who-face", (handle || "k").slice(0, 1).toLowerCase());
  const text = adminEl("div", "admin-who-text");
  text.appendChild(adminEl("div", "admin-who-name", name));
  text.appendChild(adminEl("div", "admin-who-sub", "/admin/me"));
  who.appendChild(face);
  who.appendChild(text);
  who.appendChild(adminIcon("right", "admin-who-caret"));
  host.appendChild(who);
}

function paintAdminLeft() {
  paintAdminLeftHead();
  paintAdminSections();
  paintAdminLeftFoot();
}

function paintAdminMain() {
  const main = document.getElementById("admin-main");
  if (!main) return;
  main.className = "";
  main.innerHTML = "";
  const page = currentAdminPage();
  if (page && typeof page.paint === "function") page.paint(main, adminSection);
}

function paintAdminChrome() {
  paintAdminPages();
  paintAdminLeft();
  paintAdminMain();
}

function showAdminPage(id, sectionId) {
  const page = adminPageById(id);
  if (!page) return;
  adminPage = page.id;
  const next = sectionId || adminSectionByPage[page.id] || firstSectionId(page);
  adminSection = next;
  adminSectionByPage[page.id] = next;
  paintAdminChrome();
}

function showAdminSection(sectionId) {
  const page = currentAdminPage();
  if (!page) return;
  adminSection = sectionId || firstSectionId(page);
  adminSectionByPage[page.id] = adminSection;
  paintAdminLeft();
  paintAdminMain();
}

function startAdminShell() {
  const shell = document.getElementById("admin-shell");
  if (shell) shell.hidden = false;
  const back = document.getElementById("admin-back");
  if (back) {
    back.addEventListener("click", () => {
      window.location.href = "../main/app.html";
    });
  }
  showAdminPage("overview", "statistics");
}
