let overviewStats = null;
let overviewStatsAt = 0;
let overviewStatsLoading = false;

function overviewNum(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function overviewPct(now, prev, suffix) {
  const a = Number(now) || 0;
  const b = Number(prev) || 0;
  if (b <= 0) {
    if (a <= 0) return { text: "0% " + suffix, tone: "flat" };
    return { text: "↑ " + suffix, tone: "up" };
  }
  const pct = Math.round(((a - b) * 1000) / b) / 10;
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const arrow = pct > 0 ? "↑ " : pct < 0 ? "↓ " : "";
  return { text: arrow + Math.abs(pct) + "% " + suffix, tone: tone };
}

function overviewMax(bars) {
  let max = 0;
  (bars || []).forEach((bar) => {
    const n = Number(bar.value) || 0;
    if (n > max) max = n;
  });
  return max || 1;
}

function paintOverviewStatistics(main, stats) {
  main.className = "is-fit";
  const accounts = (stats && stats.accounts) || {};
  const reports = (stats && stats.reports) || {};
  const servers = (stats && stats.servers) || {};
  const community = (stats && stats.community) || {};
  const growth = (stats && stats.growth) || {};
  const pulse = (stats && stats.pulse) || {};
  const accountDelta = overviewPct(accounts.new_24h, accounts.new_prev_24h, "new vs previous day");
  const reportDelta = overviewPct(reports.new_24h, reports.new_prev_24h, "new vs previous day");
  const communityDelta = overviewPct(community.posts_24h, community.posts_prev_24h, "vs previous day");
  const weekDelta = overviewPct(growth.week, growth.prev_week, "vs previous week");
  const activeDelta = overviewPct(pulse.active_24h, pulse.active_prev_24h, "");
  const messageDelta = overviewPct(pulse.messages_24h, pulse.messages_prev_24h, "");
  const growthWord = growth.vs_week === "below" ? "below" : growth.vs_week === "even" ? "even with" : "above";
  const bars = growth.bars || [];
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Statistics"],
    title: "Statistics",
    note: "Oneira at a glance. Activity, growth, and signals worth knowing about.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  main.appendChild(adminBanner(
    "All systems operational",
    overviewNum(reports.open) + " open reports. Account growth is " + growthWord + " the weekly baseline."
  ));
  adminKpiRow(main, [
    {
      label: "Accounts",
      value: overviewNum(accounts.total),
      icon: "users",
      detail: overviewNum(accounts.new_24h) + " new in the last 24h",
      delta: accountDelta.text,
      tone: accountDelta.tone
    },
    {
      label: "Reports",
      value: overviewNum(reports.open),
      icon: "flag",
      detail: "Open reports",
      delta: reportDelta.text,
      tone: reportDelta.tone
    },
    {
      label: "Auto mod",
      value: "0",
      icon: "shield",
      detail: "Flags only · never acts on accounts",
      delta: "0% flags vs previous day",
      tone: "flat"
    },
    {
      label: "Servers",
      value: overviewNum(servers.total),
      icon: "grid",
      detail: overviewNum(servers.active_24h) + " active in the last 24h",
      delta: "+" + overviewNum(servers.created_24h) + " created in the last 24h",
      tone: Number(servers.created_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Community",
      value: overviewNum(community.posts_24h),
      icon: "share",
      detail: "Posts submitted in the last 24h",
      delta: communityDelta.text,
      tone: communityDelta.tone
    }
  ]);
  const dash = adminEl("div", "overview-dash");
  const left = adminEl("div", "overview-stack");
  const growthPanel = adminPanel({ title: "Account growth", meta: growth.range || "Last 7 days" });
  const line = adminEl("div", "overview-growth-line");
  const total = adminEl("div", "overview-growth-n", overviewNum(growth.week));
  total.appendChild(adminEl("span", "", "new accounts this week"));
  line.appendChild(total);
  line.appendChild(adminEl("div", "overview-delta is-" + weekDelta.tone, weekDelta.text));
  growthPanel.body.appendChild(line);
  const max = overviewMax(bars);
  growthPanel.body.appendChild(adminBarChart({
    max: max,
    scale: [String(max), String(Math.round(max / 2)), "0"],
    bars: bars
  }));
  left.appendChild(growthPanel.panel);
  const queue = adminPanel({
    title: "Report queue snapshot",
    meta: overviewNum(reports.open) + " open",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  queue.body.appendChild(adminTable(
    ["Priority", "Open", "Oldest", "Share"],
    [
      ["High priority", "—", "—", "—"],
      ["Normal priority", "—", "—", "—"],
      ["Low priority", "—", "—", "—"]
    ]
  ));
  left.appendChild(queue.panel);
  const right = adminEl("div", "overview-stack");
  const pulsePanel = adminPanel({ title: "Site pulse", meta: "Last 24h" });
  pulsePanel.body.appendChild(adminPulse(
    [
      { label: "Platform availability", pill: "Operational" },
      { label: "Active accounts", value: overviewNum(pulse.active_24h), delta: activeDelta.text.replace(/\s+$/, ""), tone: activeDelta.tone },
      { label: "Messages", value: overviewNum(pulse.messages_24h), delta: messageDelta.text.replace(/\s+$/, ""), tone: messageDelta.tone },
      {
        label: "New servers",
        value: overviewNum(pulse.servers_24h),
        delta: "+" + overviewNum(pulse.servers_today) + " today",
        tone: Number(pulse.servers_today) > 0 ? "up" : "flat"
      }
    ],
    "No service incidents in the last 24 hours."
  ));
  right.appendChild(pulsePanel.panel);
  right.appendChild(adminPanel({ title: "Worth noting", meta: "Today" }).panel);
  dash.appendChild(left);
  dash.appendChild(right);
  main.appendChild(dash);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function loadOverviewStats() {
  if (overviewStatsLoading) return;
  if (overviewStats && Date.now() - overviewStatsAt < 30000) return;
  overviewStatsLoading = true;
  adminApi("/admin/overview/stats").then((response) => response.json().then((data) => {
    overviewStatsLoading = false;
    if (!response.ok) return;
    overviewStats = data;
    overviewStatsAt = Date.now();
    if (adminPage === "overview" && (adminSection === "statistics" || adminSection === "accounts" || adminSection === "reports" || adminSection === "servers")) paintAdminMain();
  })).catch(() => {
    overviewStatsLoading = false;
  });
}

function overviewJoinedClock(raw) {
  if (!raw) return "";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  const diff = Math.round((today - day) / 86400000);
  const hm = adminPad(when.getUTCHours()) + ":" + adminPad(when.getUTCMinutes());
  if (diff <= 0) return "Today, " + hm;
  if (diff === 1) return "Yesterday, " + hm;
  return adminPad(when.getUTCDate()) + " " + ADMIN_MONTHS[when.getUTCMonth()] + ", " + hm;
}

function paintOverviewAccounts(main, stats) {
  main.className = "is-fit";
  const accounts = (stats && stats.accounts) || {};
  const pulse = (stats && stats.pulse) || {};
  const standing = accounts.standing || {};
  const recent = accounts.recent || [];
  const total = Number(accounts.total) || 0;
  const fresh = Number(accounts.new_24h) || 0;
  const active = Number(pulse.active_24h) || 0;
  const online = Number(accounts.online) || 0;
  const clear = Number(standing.clear) || 0;
  const warned = Number(standing.warned) || 0;
  const banned = Number(standing.banned) || 0;
  const newDelta = overviewPct(accounts.new_24h, accounts.new_prev_24h, "vs previous 24h");
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Accounts"],
    title: "Accounts",
    note: "Account growth and recent registrations across the site.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Total accounts",
      value: overviewNum(total),
      icon: "users",
      detail: "All registered accounts"
    },
    {
      label: "New accounts",
      value: overviewNum(fresh),
      icon: "plus",
      delta: newDelta.text.replace("↑ ", "+").replace("↓ ", "−"),
      tone: newDelta.tone
    },
    {
      label: "Online now",
      value: overviewNum(online),
      icon: "eye",
      detail: "Connected right now"
    },
    {
      label: "Active accounts",
      value: overviewNum(active),
      icon: "activity",
      detail: "Signed in during the last 24h"
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const status = adminPanel({ title: "Account standing", meta: overviewNum(total) + " accounts" });
  status.body.appendChild(adminMeterList(
    [
      { label: "Clear", value: clear, total: total },
      { label: "Warned", value: warned, total: total },
      { label: "Banned", value: banned, total: total }
    ],
    overviewNum(banned) + " currently banned · " + overviewNum(warned) + " with a warning"
  ));
  dash.appendChild(status.panel);
  dash.appendChild(adminPanel({ title: "" }).panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recent registrations",
    meta: "Latest " + recent.length,
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  const rows = recent.map((row) => [
    row.username || "—",
    row.display_name || row.username || "—",
    overviewJoinedClock(row.created_at)
  ]);
  list.body.appendChild(adminTable(
    ["Username", "Display name", "Created"],
    rows.length ? rows : [["No recent registrations", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function overviewReportCategory(kind) {
  if (kind === "bug") return "Bug";
  if (kind === "feature") return "Feature";
  if (kind === "inquiry") return "Inquiry";
  if (kind === "report") return "Report";
  return kind || "—";
}

function overviewReportKind(kind) {
  if (kind === "harassment") return "Harassment";
  if (kind === "privacy") return "Privacy";
  if (kind === "scam") return "Scam";
  if (kind === "inappropriate") return "Inappropriate content";
  if (kind === "other") return "Other";
  return "—";
}

function paintOverviewReports(main, stats) {
  main.className = "is-fit";
  const reports = (stats && stats.reports) || {};
  const types = reports.types || {};
  const kinds = reports.kinds || {};
  const recent = (reports.recent || []).slice(0, 5);
  const open = Number(reports.open) || 0;
  const userServer = Number(reports.user_server) || 0;
  const fresh = Number(reports.new_24h) || 0;
  const newDelta = overviewPct(reports.new_24h, reports.new_prev_24h, "vs previous 24h");
  const share = open > 0 ? ((userServer * 1000) / open / 10).toFixed(1) + "% of the open queue" : "0% of the open queue";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Reports"],
    title: "Reports",
    note: "Queue volume and incoming tickets. Completing a ticket happens on Reports.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Open reports",
      value: overviewNum(open),
      icon: "flag",
      detail: "Waiting for review"
    },
    {
      label: "Report",
      value: overviewNum(userServer),
      icon: "users",
      detail: share
    },
    {
      label: "Received",
      value: overviewNum(fresh),
      icon: "plus",
      delta: newDelta.text.replace("↑ ", "+").replace("↓ ", "−"),
      tone: newDelta.tone,
      detail: "Submitted in the last 24h"
    },
    {
      label: "Completed",
      value: overviewNum(reports.completed),
      icon: "check",
      detail: "Still on file"
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const cats = adminPanel({ title: "Open by category", meta: overviewNum(open) + " open" });
  cats.body.appendChild(adminMeterList([
    { label: "Bug", value: Number(types.bug) || 0, total: open },
    { label: "Feature", value: Number(types.feature) || 0, total: open },
    { label: "Inquiry", value: Number(types.inquiry) || 0, total: open },
    { label: "Report", value: Number(types.report) || 0, total: open }
  ]));
  dash.appendChild(cats.panel);
  const typePanel = adminPanel({ title: "Open reports by type", meta: overviewNum(userServer) + " reports" });
  typePanel.body.appendChild(adminMeterList([
    { label: "Harassment", value: Number(kinds.harassment) || 0, total: userServer },
    { label: "Privacy", value: Number(kinds.privacy) || 0, total: userServer },
    { label: "Scam", value: Number(kinds.scam) || 0, total: userServer },
    { label: "Inappropriate content", value: Number(kinds.inappropriate) || 0, total: userServer },
    { label: "Other", value: Number(kinds.other) || 0, total: userServer }
  ]));
  dash.appendChild(typePanel.panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recent incoming reports",
    meta: "Latest " + recent.length,
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  const rows = recent.map((row) => [
    row.id != null ? String(row.id) : "—",
    overviewReportCategory(row.feedback_type),
    row.feedback_type === "report" ? overviewReportKind(row.report_kind) : "—",
    row.report_score != null ? String(row.report_score) : "—",
    overviewJoinedClock(row.created_at)
  ]);
  list.body.appendChild(adminTable(
    ["Report", "Category", "Type", "Score", "Created"],
    rows.length ? rows : [["No reports", "", "", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function paintOverviewAutoMod(main) {
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Auto mod"],
    title: "Auto mod",
    note: "Silent flags on the Community page. Auto moderation never warns, bans, hides, or deletes.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Detection events",
      value: "0",
      icon: "shield",
      delta: "0% vs previous 24h",
      tone: "flat"
    },
    {
      label: "Flags reviewed",
      value: "0",
      icon: "check",
      detail: "0% of detection events"
    },
    {
      label: "Flagged for review",
      value: "0",
      icon: "flag",
      detail: "0% of detection events"
    },
    {
      label: "Servers affected",
      value: "0",
      icon: "grid",
      detail: "Public Community listings"
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const surfaces = adminPanel({ title: "Flags by surface", meta: "0 total" });
  surfaces.body.appendChild(adminMeterList([
    { label: "Posts flagged", value: 0, total: 0 },
    { label: "Rooms flagged", value: 0, total: 0 },
    { label: "Phone flagged", value: 0, total: 0 },
    { label: "Listings flagged", value: 0, total: 0 }
  ]));
  dash.appendChild(surfaces.panel);
  const outcomes = adminPanel({ title: "Detection outcomes", meta: "Last 24h" });
  outcomes.body.appendChild(adminMeterList([
    { label: "Flagged for review", value: 0, total: 0 },
    { label: "Flags reviewed", value: 0, total: 0 }
  ]));
  dash.appendChild(outcomes.panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recent detection events",
    meta: "Latest 0",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  list.body.appendChild(adminTable(
    ["Event", "Rule", "Server", "Detected", "Outcome"],
    [["No flags", "", "", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function overviewShare(part, whole, suffix) {
  const a = Number(part) || 0;
  const b = Number(whole) || 0;
  const pct = b > 0 ? ((a * 1000) / b / 10).toFixed(1) : "0.0";
  return pct + "% " + suffix;
}

function paintOverviewServers(main, stats) {
  main.className = "is-fit";
  const servers = (stats && stats.servers) || {};
  const recent = (servers.recent || []).slice(0, 5);
  const total = Number(servers.total) || 0;
  const active = Number(servers.active_24h) || 0;
  const fresh = Number(servers.created_24h) || 0;
  const listed = Number(servers.public) || 0;
  const hidden = Math.max(0, total - listed);
  const quiet = Math.max(0, total - active);
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Servers"],
    title: "Servers",
    note: "Server growth, visibility and activity across the network.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Total servers",
      value: overviewNum(total),
      icon: "grid",
      detail: "All site communities"
    },
    {
      label: "Active servers",
      value: overviewNum(active),
      icon: "activity",
      detail: overviewShare(active, total, "active in the last 24h")
    },
    {
      label: "New servers",
      value: overviewNum(fresh),
      icon: "plus",
      detail: "Created in the last 24h"
    },
    {
      label: "Public servers",
      value: overviewNum(listed),
      icon: "share",
      detail: overviewShare(listed, total, "of the network")
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const visibility = adminPanel({ title: "Server visibility", meta: overviewNum(total) + " total" });
  visibility.body.appendChild(adminMeterList([
    { label: "Public", value: listed, total: total },
    { label: "Private", value: hidden, total: total }
  ]));
  dash.appendChild(visibility.panel);
  const activity = adminPanel({ title: "Activity distribution", meta: "Last 24h" });
  activity.body.appendChild(adminMeterList([
    { label: "Active", value: active, total: total },
    { label: "No recorded activity", value: quiet, total: total }
  ]));
  dash.appendChild(activity.panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recently created servers",
    meta: "Latest " + recent.length + (fresh ? " of " + overviewNum(fresh) : "") + " · Last 24h",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  const rows = recent.map((row) => [
    row.name || row.id || "—",
    overviewJoinedClock(row.created_at),
    row.public ? "Public" : "Private",
    overviewNum(row.members),
    row.active ? "Active" : "No activity"
  ]);
  list.body.appendChild(adminTable(
    ["Server", "Created", "Visibility", "Members", "Activity"],
    rows.length ? rows : [["No servers created", "", "", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function overviewPostLine(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  if (text.length <= 72) return text;
  return text.slice(0, 72).replace(/\s+\S*$/, "").trim() + "…";
}

function paintOverviewCommunity(main, stats) {
  main.className = "is-fit";
  const community = (stats && stats.community) || {};
  const recent = (community.recent || []).slice(0, 5);
  const posts = Number(community.posts_24h) || 0;
  const rooms = Number(community.rooms) || 0;
  const occupied = Number(community.rooms_occupied) || 0;
  const empty = Number(community.rooms_empty) || 0;
  const active = Number(community.rooms_active) || 0;
  const quiet = Number(community.rooms_quiet) || 0;
  const inRooms = Number(community.in_rooms) || 0;
  const inCall = Number(community.in_call) || 0;
  const waiting = Number(community.waiting) || 0;
  const onPhone = Number(community.on_phone) || 0;
  const listings = Number(community.listings) || 0;
  const live = inRooms + inCall + waiting;
  const postDelta = overviewPct(community.posts_24h, community.posts_prev_24h, "vs previous 24h");
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Community"],
    title: "Community",
    note: "Posts, rooms, Phone a User, and finder listings.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Posts",
      value: overviewNum(posts),
      icon: "share",
      detail: "Submitted in the last 24h",
      delta: postDelta.text,
      tone: postDelta.tone
    },
    {
      label: "Rooms",
      value: overviewNum(rooms),
      icon: "users",
      detail: overviewShare(occupied, rooms, "occupied")
    },
    {
      label: "On the phone",
      value: overviewNum(onPhone),
      icon: "phone",
      detail: overviewNum(inCall) + " in a call · " + overviewNum(waiting) + " waiting"
    },
    {
      label: "Listings",
      value: overviewNum(listings),
      icon: "grid",
      detail: "On the finder"
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const now = adminPanel({ title: "Live now", meta: overviewNum(live) + " people" });
  now.body.appendChild(adminMeterList([
    { label: "In a room", value: inRooms, total: live },
    { label: "On a call", value: inCall, total: live },
    { label: "Waiting for a call", value: waiting, total: live }
  ]));
  dash.appendChild(now.panel);
  const roomMix = adminPanel({ title: "Rooms", meta: overviewNum(rooms) + " total" });
  roomMix.body.appendChild(adminMeterList([
    { label: "Occupied", value: occupied, total: rooms },
    { label: "Empty", value: empty, total: rooms },
    { label: "Active", value: active, total: rooms },
    { label: "Quiet", value: quiet, total: rooms }
  ]));
  dash.appendChild(roomMix.panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recent posts",
    meta: "Latest " + recent.length + (posts ? " of " + overviewNum(posts) : "") + " · Last 24h",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  const rows = recent.map((row) => [
    overviewPostLine(row.body),
    row.username || "—",
    overviewJoinedClock(row.created_at)
  ]);
  list.body.appendChild(adminTable(
    ["Post", "Author", "Created"],
    rows.length ? rows : [["No posts", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function paintOverview(main, sectionId) {
  if (sectionId === "accounts") {
    paintOverviewAccounts(main, overviewStats);
    loadOverviewStats();
    return;
  }
  if (sectionId === "reports") {
    paintOverviewReports(main, overviewStats);
    loadOverviewStats();
    return;
  }
  if (sectionId === "auto-mod") return paintOverviewAutoMod(main);
  if (sectionId === "servers") {
    paintOverviewServers(main, overviewStats);
    loadOverviewStats();
    return;
  }
  if (sectionId === "community") {
    paintOverviewCommunity(main, overviewStats);
    loadOverviewStats();
    return;
  }
  paintOverviewStatistics(main, overviewStats);
  loadOverviewStats();
}

registerAdminPage({
  id: "overview",
  label: "Overview",
  sections: [
    { id: "statistics", label: "Statistics", icon: "chart" },
    { id: "accounts", label: "Accounts", icon: "users" },
    { id: "reports", label: "Reports", icon: "flag" },
    { id: "auto-mod", label: "Auto mod", icon: "shield" },
    { id: "servers", label: "Servers", icon: "grid" },
    { id: "community", label: "Community", icon: "share" }
  ],
  paint: paintOverview
});
