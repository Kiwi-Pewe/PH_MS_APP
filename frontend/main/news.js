let newsCal = new Date();
newsCal.setDate(1);
let newsRow = "announcements";

const NEWS_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function closeNewsChrome() {
  closeNewsDonate();
}

function closeNewsDonate() {
  const overlay = document.getElementById("news-donate-overlay");
  if (overlay) overlay.hidden = true;
}

function openNewsDonate() {
  const overlay = document.getElementById("news-donate-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  const go = document.getElementById("news-donate-continue");
  if (go) go.disabled = true;
}

function paintNewsMonth() {
  const host = document.getElementById("news-calendar-grid");
  const label = document.getElementById("news-calendar-label");
  if (label) label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
  if (!host) return;
  host.replaceChildren();
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name) => {
    const head = document.createElement("div");
    head.className = "calendar-dow";
    head.textContent = name;
    host.appendChild(head);
  });
  const first = new Date(newsCal.getFullYear(), newsCal.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = new Date();
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (day.getMonth() !== newsCal.getMonth()) cell.classList.add("is-outside");
    if (day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate()) {
      cell.classList.add("is-today");
    }
    const top = document.createElement("div");
    top.className = "calendar-day-top";
    const number = document.createElement("div");
    number.className = "calendar-day-num";
    number.textContent = String(day.getDate());
    top.appendChild(number);
    cell.appendChild(top);
    host.appendChild(cell);
  }
}

function showNewsRow(id) {
  if (id === "donate") {
    openNewsDonate();
    return;
  }
  newsRow = id === "events" ? "events" : "announcements";
  document.querySelectorAll("#news-sidebar-view [data-news-row]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-news-row") === newsRow || (newsRow === "announcements" && btn.getAttribute("data-news-row") === "announcements"));
    if (btn.getAttribute("data-news-row") === "donate") btn.classList.remove("active");
  });
  const announce = document.getElementById("news-pane-announcements");
  const events = document.getElementById("news-pane-events");
  if (announce) announce.hidden = newsRow !== "announcements";
  if (events) events.hidden = newsRow !== "events";
  if (newsRow === "events") paintNewsMonth();
}

async function openNews() {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  beginPlace({
    settings: true,
    serverSettings: true,
    channelSettings: true,
    sidebar: "news",
    view: "news",
    topbar: "news",
    hideMembers: true
  });
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  if (typeof setAppAddress === "function") setAppAddress("/news");
  showNewsRow("announcements");
}

document.getElementById("news-sidebar-view").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-news-row]");
  if (!btn) return;
  showNewsRow(btn.getAttribute("data-news-row"));
});

const newsPrev = document.getElementById("news-calendar-prev");
const newsNext = document.getElementById("news-calendar-next");
if (newsPrev) {
  newsPrev.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() - 1);
    paintNewsMonth();
  });
}
if (newsNext) {
  newsNext.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() + 1);
    paintNewsMonth();
  });
}

const newsDonateOverlay = document.getElementById("news-donate-overlay");
if (newsDonateOverlay) {
  newsDonateOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-donate-overlay") closeNewsDonate();
  });
}
["news-donate-cancel", "news-donate-continue"].forEach((id) => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", () => closeNewsDonate());
});
