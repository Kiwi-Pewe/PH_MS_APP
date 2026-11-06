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

function paintAdminSections() {
  const host = document.getElementById("admin-sections");
  if (!host) return;
  host.innerHTML = "";
  const page = currentAdminPage();
  const sections = (page && page.sections) || [];
  sections.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-section" + (adminSection === section.id ? " is-on" : "");
    btn.textContent = section.label;
    btn.addEventListener("click", () => showAdminSection(section.id));
    host.appendChild(btn);
  });
}

function paintAdminMain() {
  const main = document.getElementById("admin-main");
  if (!main) return;
  main.innerHTML = "";
  const page = currentAdminPage();
  if (page && typeof page.paint === "function") page.paint(main, adminSection);
}

function showAdminPage(id, sectionId) {
  const page = adminPageById(id);
  if (!page) return;
  adminPage = page.id;
  const next = sectionId || adminSectionByPage[page.id] || firstSectionId(page);
  adminSection = next;
  adminSectionByPage[page.id] = next;
  paintAdminPages();
  paintAdminSections();
  paintAdminMain();
}

function showAdminSection(sectionId) {
  const page = currentAdminPage();
  if (!page) return;
  adminSection = sectionId || firstSectionId(page);
  adminSectionByPage[page.id] = adminSection;
  paintAdminSections();
  paintAdminMain();
}

function paintAdminPlaceholder(main, title, note) {
  const heading = document.createElement("h1");
  heading.className = "admin-page-title";
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.className = "admin-page-note is-placeholder";
  copy.textContent = note;
  main.appendChild(heading);
  main.appendChild(copy);
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
