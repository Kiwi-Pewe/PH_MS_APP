const REPORTS_PAGE = 25;
const REPORTS_BY = [
  { id: "id", label: "Report ID", hint: "Report ID" },
  { id: "username", label: "Username", hint: "Username" },
  { id: "display_name", label: "Display name", hint: "Display name" }
];

let reportsBy = "id";
let reportsQuery = "";
let reportsFlaggedOnly = false;
let reportsOffset = 0;
let reportsHasMore = false;
let reportsLoading = false;
let reportsRows = [];
let reportsOpenId = 0;
let reportsEvents = [];
let reportsTimer = 0;

function reportsByMeta(id) {
  return REPORTS_BY.find((row) => row.id === id) || REPORTS_BY[0];
}

function reportsSearchView() {
  return {
    selected: !!reportsOpenId,
    reports: reportsRows,
    openId: reportsOpenId,
    events: reportsEvents,
    empty: "Select a report.",
    onOpen: openReportsHistory,
    onBack: () => {
      reportsOpenId = 0;
      reportsEvents = [];
      paintReportsLog();
      paintReportsRows();
    },
    onSaved: (data) => {
      if (data && data.report) {
        reportsRows = reportsRows.map((item) => item.id === data.report.id ? data.report : item);
      }
      reportsEvents = (data && data.events) || [];
      paintReportsLog();
      paintReportsRows();
    }
  };
}

function paintReportsLog() {
  const host = document.getElementById("reports-log");
  if (!host || typeof paintUsersReports !== "function") return;
  paintUsersReports(host, reportsSearchView());
}

function paintReportsRows() {
  const host = document.getElementById("reports-search-list");
  if (!host || typeof usersReportRow !== "function") return;
  host.innerHTML = "";
  if (!reportsRows.length) {
    host.appendChild(adminEl("div", "users-empty", "No reports."));
    return;
  }
  reportsRows.forEach((row) => {
    const card = usersReportRow(row, false, openReportsHistory);
    if (row.id === reportsOpenId) card.classList.add("is-on");
    host.appendChild(card);
  });
  if (reportsHasMore) {
    const more = adminEl("button", "users-more", "Load more");
    more.type = "button";
    more.disabled = reportsLoading;
    more.addEventListener("click", () => loadReportsList(true));
    host.appendChild(more);
  }
}

function openReportsHistory(reportId) {
  reportsOpenId = reportId;
  reportsEvents = [];
  paintReportsRows();
  paintReportsLog();
  adminApi("/admin/feedback/" + reportId + "/events").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (reportsOpenId !== reportId) return;
    reportsEvents = (data && data.events) || [];
    paintReportsLog();
  }).catch(() => {
    if (reportsOpenId === reportId) paintReportsLog();
  });
}

function loadReportsList(more) {
  if (reportsLoading) return;
  if (more && !reportsHasMore) return;
  if (!more) {
    reportsOffset = 0;
    reportsRows = [];
    reportsHasMore = false;
  }
  reportsLoading = true;
  const params = new URLSearchParams();
  params.set("by", reportsBy);
  params.set("q", reportsQuery);
  params.set("sort", "id");
  params.set("order", "asc");
  params.set("scope", "search");
  params.set("flagged", reportsFlaggedOnly ? "1" : "0");
  params.set("offset", String(reportsOffset));
  params.set("limit", String(REPORTS_PAGE));
  adminApi("/admin/feedback?" + params.toString()).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    reportsLoading = false;
    const rows = (data && data.reports) || [];
    reportsHasMore = !!(data && data.has_more);
    reportsRows = more ? reportsRows.concat(rows) : rows;
    reportsOffset = reportsRows.length;
    paintReportsRows();
    paintReportsLog();
  }).catch(() => {
    reportsLoading = false;
  });
}

function queueReportsSearch() {
  window.clearTimeout(reportsTimer);
  reportsTimer = window.setTimeout(() => loadReportsList(false), 250);
}

function paintReportsSearch(main) {
  main.className = "is-users is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Search"],
    title: "Search",
    note: "Search bug reports and user or server reports.",
    clock: "est"
  }));
  const board = adminEl("div", "users-search");
  const left = adminEl("div", "users-stack is-left");
  const search = usersCard({ fill: true });
  const fields = adminEl("div", "users-search-fields");
  fields.appendChild(adminEl("div", "users-field-k", "Search by"));
  const select = adminEl("select", "users-search-by");
  REPORTS_BY.forEach((opt) => {
    const item = document.createElement("option");
    item.value = opt.id;
    item.textContent = opt.label;
    if (opt.id === reportsBy) item.selected = true;
    select.appendChild(item);
  });
  fields.appendChild(select);
  fields.appendChild(adminEl("div", "users-field-k", "Query"));
  const input = adminEl("input", "users-search-q");
  input.type = "text";
  input.value = reportsQuery;
  input.placeholder = reportsByMeta(reportsBy).hint;
  select.addEventListener("change", () => {
    reportsBy = select.value || "id";
    input.placeholder = reportsByMeta(reportsBy).hint;
    queueReportsSearch();
  });
  input.addEventListener("input", () => {
    reportsQuery = input.value || "";
    queueReportsSearch();
  });
  fields.appendChild(input);
  const filter = adminEl("button", "admin-filter-pill");
  filter.type = "button";
  filter.disabled = true;
  filter.appendChild(adminEl("span", "", "Filters"));
  filter.appendChild(adminIcon("down"));
  fields.appendChild(filter);
  fields.appendChild(usersSearchFlagged("Flagged Reports", reportsFlaggedOnly, (on) => {
    reportsFlaggedOnly = on;
    loadReportsList(false);
  }));
  search.appendChild(fields);
  left.appendChild(search);
  board.appendChild(left);
  const mid = adminEl("div", "users-stack is-mid");
  const listCard = usersCard({ title: "Reports", fill: true });
  const list = adminEl("div", "users-entry-list");
  list.id = "reports-search-list";
  listCard.appendChild(list);
  mid.appendChild(listCard);
  board.appendChild(mid);
  const right = adminEl("div", "users-stack is-right");
  right.id = "reports-log";
  board.appendChild(right);
  main.appendChild(board);
  main.appendChild(adminEl("div", "overview-page-foot", "Snapshot data · Updates every 5 minutes"));
  if (reportsRows.length) {
    paintReportsRows();
    paintReportsLog();
  } else {
    paintReportsLog();
    loadReportsList(false);
  }
}

function paintReportsFeedback(main) {
  main.className = "is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Feedback"],
    title: "Feedback",
    note: "General inquiries and feature requests.",
    clock: "est"
  }));
}

function paintReportsAuto(main) {
  main.className = "is-reports";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Reports", "Auto Reports"],
    title: "Auto Reports",
    note: "Reports made by auto moderation.",
    clock: "est"
  }));
}

function paintReports(main, sectionId) {
  if (sectionId === "feedback") return paintReportsFeedback(main);
  if (sectionId === "auto") return paintReportsAuto(main);
  paintReportsSearch(main);
}

registerAdminPage({
  id: "reports",
  label: "Reports",
  sections: [
    { id: "search", label: "Search", icon: "flag" },
    { id: "feedback", label: "Feedback", icon: "activity" },
    { id: "auto", label: "Auto Reports", icon: "shield" }
  ],
  paint: paintReports
});
