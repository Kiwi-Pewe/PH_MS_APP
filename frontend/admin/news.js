const NEWS_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let newsCal = new Date();
newsCal.setDate(1);

function paintNewsMonth(host) {
  if (!host) return;
  host.innerHTML = "";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name) => {
    host.appendChild(adminEl("div", "news-cal-dow", name));
  });
  const first = new Date(newsCal.getFullYear(), newsCal.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = new Date();
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const cell = adminEl("div", "news-cal-day");
    if (day.getMonth() !== newsCal.getMonth()) cell.classList.add("is-outside");
    if (day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate()) {
      cell.classList.add("is-today");
    }
    cell.appendChild(adminEl("div", "news-cal-num", String(day.getDate())));
    host.appendChild(cell);
  }
}

let newsPosts = [];
let newsQuery = "";
let newsSearchTimer = 0;
let newsPosting = false;

function newsWhen(raw) {
  if (typeof usersWhen === "function") return usersWhen(raw);
  return raw || "—";
}

function fillNewsMarkdown(el, text) {
  if (!el) return;
  el.replaceChildren();
  const source = String(text || "");
  if (!source) return;
  if (typeof mdAppend === "function") mdAppend(el, source);
  else if (typeof fillMentionText === "function") fillMentionText(el, source, {}, {}, { rich: true });
  else el.textContent = source;
}

function paintNewsPostCard(row) {
  const card = adminEl("article", "news-announce-card");
  const head = adminEl("div", "news-announce-head");
  const top = adminEl("div", "news-announce-top");
  const face = adminEl("div", "users-entry-face");
  if (typeof usersFace === "function") usersFace(face, row, row.display_name || row.username);
  const names = adminEl("div", "news-announce-meta");
  names.appendChild(adminEl("div", "news-announce-name", row.display_name || row.username || "kiwi"));
  names.appendChild(adminEl("div", "news-announce-date", newsWhen(row.created_at)));
  top.appendChild(face);
  top.appendChild(names);
  head.appendChild(top);
  const title = adminEl("div", "news-announce-title", row.title || "—");
  if (row.edited) title.appendChild(adminEl("span", "edited-tag", "edited"));
  head.appendChild(title);
  card.appendChild(head);
  const body = adminEl("div", "news-announce-body");
  const source = String(row.body || "").trim();
  if (source) fillNewsMarkdown(body, source);
  else body.textContent = "No additional information";
  card.appendChild(body);
  const foot = adminEl("div", "news-announce-foot");
  foot.appendChild(adminEl("span", "", adminNum(row.comment_count) + " comments"));
  foot.appendChild(adminEl("span", "", "Reactions"));
  card.appendChild(foot);
  return card;
}

function paintNewsPostList() {
  const host = document.getElementById("news-admin-posts");
  if (!host) return;
  host.innerHTML = "";
  newsPosts.forEach((row) => host.appendChild(paintNewsPostCard(row)));
  host.appendChild(adminEl("div", "news-end", newsPosts.length ? "You're up to date!" : (newsQuery ? "No announcements matched that search." : "You're up to date!")));
}

function loadNewsPosts() {
  const params = new URLSearchParams();
  if (newsQuery) params.set("q", newsQuery);
  const qs = params.toString();
  adminApi("/news/posts" + (qs ? "?" + qs : "")).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsPosts = (data && data.posts) || [];
    paintNewsPostList();
  }).catch(() => {
    const host = document.getElementById("news-admin-posts");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(adminEl("div", "news-end", "Could not load announcements."));
  });
}

function showNewsComposer(on) {
  const idle = document.getElementById("news-composer-idle");
  const edit = document.getElementById("news-composer-editing");
  if (idle) idle.hidden = !!on;
  if (edit) edit.hidden = !on;
  if (on) {
    const title = document.getElementById("news-title-input");
    const body = document.getElementById("news-body-input");
    if (title) {
      title.value = "";
      title.focus();
    }
    if (body) {
      body.value = "";
      body.style.height = "";
    }
    const comments = document.getElementById("news-comments-input");
    if (comments) comments.checked = true;
    const err = document.getElementById("news-compose-error");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
  }
}

function submitNewsPost() {
  if (newsPosting) return;
  const titleEl = document.getElementById("news-title-input");
  const bodyEl = document.getElementById("news-body-input");
  const commentsEl = document.getElementById("news-comments-input");
  const err = document.getElementById("news-compose-error");
  const title = titleEl ? titleEl.value.trim() : "";
  const body = bodyEl ? bodyEl.value.trim() : "";
  if (!title || !body) {
    if (err) {
      err.textContent = "Title and body are required.";
      err.hidden = false;
    }
    return;
  }
  newsPosting = true;
  const save = document.getElementById("news-post-btn");
  if (save) save.disabled = true;
  adminApi("/news/posts", {
    method: "POST",
    body: {
      title: title,
      body: body,
      comments_open: !commentsEl || commentsEl.checked
    }
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsPosting = false;
    if (save) save.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      if (err) {
        err.textContent = typeof detail === "string" ? detail : "Could not post that announcement.";
        err.hidden = false;
      }
      return;
    }
    if (result.data && result.data.id) newsPosts.unshift(result.data);
    showNewsComposer(false);
    paintNewsPostList();
  }).catch(() => {
    newsPosting = false;
    if (save) save.disabled = false;
    if (err) {
      err.textContent = "Could not post that announcement.";
      err.hidden = false;
    }
  });
}

function paintNewsAnnouncements(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Announcements"],
    title: "Announcements",
    note: "Post site-wide News. Everyone is alerted, and a red count stays on the News tab until they open it.",
    clock: "est"
  }));
  const bar = adminEl("div", "news-composer-bar");
  const idle = adminEl("div", "news-composer-idle");
  idle.id = "news-composer-idle";
  const search = adminEl("input", "news-search");
  search.type = "search";
  search.placeholder = "Search";
  search.value = newsQuery;
  search.addEventListener("input", () => {
    newsQuery = search.value || "";
    window.clearTimeout(newsSearchTimer);
    newsSearchTimer = window.setTimeout(() => loadNewsPosts(), 250);
  });
  const create = adminEl("button", "admin-mod-confirm");
  create.type = "button";
  create.textContent = "New Post";
  create.addEventListener("click", () => showNewsComposer(true));
  idle.appendChild(search);
  idle.appendChild(create);
  bar.appendChild(idle);
  const edit = adminEl("div", "news-composer-editing");
  edit.id = "news-composer-editing";
  edit.hidden = true;
  const titleRow = adminEl("div", "news-compose-title-row");
  const cancel = adminEl("button", "news-compose-x", "×");
  cancel.type = "button";
  cancel.title = "Cancel";
  cancel.addEventListener("click", () => showNewsComposer(false));
  const title = adminEl("input", "news-title-input");
  title.id = "news-title-input";
  title.type = "text";
  title.maxLength = 200;
  title.placeholder = "Title";
  titleRow.appendChild(cancel);
  titleRow.appendChild(title);
  edit.appendChild(titleRow);
  const body = adminEl("textarea", "news-body-input");
  body.id = "news-body-input";
  body.rows = 5;
  body.placeholder = "Enter a message...";
  body.addEventListener("input", () => {
    body.style.height = "auto";
    body.style.height = Math.max(body.scrollHeight, 120) + "px";
  });
  edit.appendChild(body);
  const tools = adminEl("div", "news-compose-tools");
  const commentsLine = adminEl("div", "admin-report-check");
  commentsLine.appendChild(adminEl("span", "", "Comments"));
  const comments = usersToggle(true);
  comments.input.id = "news-comments-input";
  commentsLine.appendChild(comments.label);
  tools.appendChild(commentsLine);
  const post = adminEl("button", "admin-mod-confirm");
  post.type = "button";
  post.id = "news-post-btn";
  post.textContent = "Post";
  post.addEventListener("click", submitNewsPost);
  tools.appendChild(post);
  edit.appendChild(tools);
  const err = adminEl("p", "news-compose-error");
  err.id = "news-compose-error";
  err.hidden = true;
  edit.appendChild(err);
  bar.appendChild(edit);
  main.appendChild(bar);
  const list = adminEl("div", "news-announce-list");
  list.id = "news-admin-posts";
  main.appendChild(list);
  paintNewsPostList();
  loadNewsPosts();
}

function newsDonateWhen(raw) {
  if (typeof usersWhen === "function") return usersWhen(raw);
  return raw || "—";
}

function newsDonateDelta(now, prev, suffix) {
  if (typeof overviewPct === "function") return overviewPct(now, prev, suffix);
  return { text: "0% " + suffix, tone: "flat" };
}

function paintNewsDonate(main, stats) {
  if (stats === undefined) {
    paintNewsDonate(main, null);
    adminApi("/admin/kofi/stats").then((response) => response.ok ? response.json() : null).then((data) => {
      if (adminPage !== "news" || adminSection !== "donate") return;
      const host = document.getElementById("admin-main");
      if (!host) return;
      host.innerHTML = "";
      paintNewsDonate(host, data || {});
    }).catch(() => {});
    return;
  }
  const data = stats || {};
  const bars = (data.bars && data.bars.length) ? data.bars.map((bar) => ({
    label: bar.label,
    value: Number(bar.value) || 0
  })) : [{ label: "—", value: 0 }];
  const max = Math.max.apply(null, bars.map((bar) => Number(bar.value) || 0).concat([1]));
  const incomeDelta = newsDonateDelta(data.income_24h_raw, data.income_prev_raw, "vs previous day");
  const weekDelta = newsDonateDelta(data.week_raw, data.prev_week_raw, "vs previous week");
  const dayCount = Number(data.payments_24h) || 0;
  const donationsShare = dayCount ? Math.round(((Number(data.donations_24h) || 0) * 1000) / dayCount) / 10 : 0;
  const subsShare = dayCount ? Math.round(((Number(data.subscriptions_24h) || 0) * 1000) / dayCount) / 10 : 0;
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Donate"],
    title: "Donate",
    note: "Ko-fi income for Oneira. Donations and memberships are the two sources that count here.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  let bannerLead = data.connected ? "Ko-fi connected" : "Ko-fi webhook idle";
  if (data.last_webhook_at && !data.last_webhook_ok) bannerLead = "Ko-fi webhook rejected";
  main.appendChild(adminBanner(
    bannerLead,
    adminNum(data.donations || 0) + " donations · " + adminNum(data.subscriptions || 0) + " membership payments."
  ));
  adminKpiRow(main, [
    {
      label: "Income",
      value: data.income || "$0.00",
      icon: "activity",
      detail: "Donations + memberships",
      delta: incomeDelta.text,
      tone: incomeDelta.tone
    },
    {
      label: "Donations",
      value: adminNum(data.donations),
      icon: "plus",
      detail: "One-off tips",
      delta: adminNum(data.donations_24h) + " in the last 24h",
      tone: Number(data.donations_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Subscriptions",
      value: adminNum(data.subscriptions),
      icon: "users",
      detail: "Membership payments",
      delta: adminNum(data.subscriptions_24h) + " in the last 24h",
      tone: Number(data.subscriptions_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Last 24h",
      value: data.income_24h || "$0.00",
      icon: "chart",
      detail: "Income in this window",
      delta: incomeDelta.text,
      tone: incomeDelta.tone
    }
  ]);
  const dash = adminEl("div", "overview-dash");
  const left = adminEl("div", "overview-stack");
  const growthPanel = adminPanel({ title: "Income", meta: "Last 7 days" });
  const line = adminEl("div", "overview-growth-line");
  const total = adminEl("div", "overview-growth-n", data.week || "$0.00");
  total.appendChild(adminEl("span", "", "this week"));
  line.appendChild(total);
  line.appendChild(adminEl("div", "overview-delta is-" + weekDelta.tone, weekDelta.text));
  growthPanel.body.appendChild(line);
  growthPanel.body.appendChild(adminBarChart({
    max: max,
    scale: [String(max), String(Math.round(max / 2 * 10) / 10), "0"],
    bars: bars
  }));
  left.appendChild(growthPanel.panel);
  const recentRows = (data.recent || []).map((row) => [
    row.kind || "—",
    row.from_name || "Anonymous",
    row.amount || "$0.00",
    newsDonateWhen(row.paid_at),
    row.is_public ? "Public" : "Private"
  ]);
  const recent = adminPanel({
    title: "Recent payments",
    meta: "Latest " + adminNum(recentRows.length),
    foot: "From Ko-fi · webhook only"
  });
  recent.body.appendChild(adminTable(
    ["Type", "From", "Amount", "When", "Public"],
    recentRows.length ? recentRows : [["No payments yet", "", "", "", ""]]
  ));
  left.appendChild(recent.panel);
  const right = adminEl("div", "overview-stack");
  const mix = adminPanel({ title: "Mix", meta: "Last 24h" });
  mix.body.appendChild(adminPulse(
    [
      { label: "Webhook", pill: data.connected ? "Connected" : "Idle" },
      { label: "Donations", value: adminNum(data.donations_24h), delta: donationsShare + "%", tone: "flat" },
      { label: "Subscriptions", value: adminNum(data.subscriptions_24h), delta: subsShare + "%", tone: "flat" },
      { label: "Public payments", value: adminNum(data.public_24h), delta: adminNum(data.public_24h) + " of " + adminNum(dayCount), tone: "flat" }
    ],
    "Shop orders and commissions are not counted on this page."
  ));
  right.appendChild(mix.panel);
  const noting = adminPanel({ title: "Worth noting", meta: "Today" });
  noting.body.appendChild(adminNotes([
    {
      title: "History",
      copy: "Ko-fi does not send payments from before the webhook. This page only shows what Oneira has received."
    }
  ]));
  right.appendChild(noting.panel);
  dash.appendChild(left);
  dash.appendChild(right);
  main.appendChild(dash);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function paintNewsEvents(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Events"],
    title: "Events",
    note: "Read-only calendar of site-wide events. Create the event from Announcements. No RSVP.",
    clock: "est"
  }));
  const board = adminEl("div", "news-cal-board");
  const tools = adminEl("div", "news-cal-toolbar");
  const prev = adminEl("button", "news-cal-nav", "‹");
  prev.type = "button";
  const label = adminEl("div", "news-cal-label", NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear());
  const next = adminEl("button", "news-cal-nav", "›");
  next.type = "button";
  prev.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() - 1);
    label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
    paintNewsMonth(grid);
  });
  next.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() + 1);
    label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
    paintNewsMonth(grid);
  });
  tools.appendChild(prev);
  tools.appendChild(label);
  tools.appendChild(next);
  board.appendChild(tools);
  const grid = adminEl("div", "news-cal-grid");
  board.appendChild(grid);
  main.appendChild(board);
  paintNewsMonth(grid);
}

function paintNewsBroadcastPreview(host, text) {
  if (!host) return;
  host.replaceChildren();
  const source = String(text || "").trim();
  if (!source) {
    host.textContent = "Broadcast";
    host.classList.add("is-later");
    return;
  }
  host.classList.remove("is-later");
  fillNewsMarkdown(host, source);
}

function paintNewsBroadcast(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Broadcast"],
    title: "Broadcast",
    note: "Stapled to the top rail between the page tabs and Feedback. Stays up until you clear it.",
    clock: "est"
  }));
  const preview = adminEl("div", "news-broadcast-preview");
  preview.id = "news-broadcast-preview";
  main.appendChild(preview);
  const panel = adminPanel({ title: "Alert", fill: true });
  panel.body.appendChild(adminEl("div", "users-field-k", "Message"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.id = "news-broadcast-input";
  area.rows = 5;
  area.maxLength = 500;
  area.placeholder = "Maintenance window, outage, or other site-wide notice";
  area.addEventListener("input", () => paintNewsBroadcastPreview(preview, area.value));
  panel.body.appendChild(area);
  const err = adminEl("p", "admin-settings-error");
  err.id = "news-broadcast-error";
  err.hidden = true;
  panel.body.appendChild(err);
  const row = adminEl("div", "news-broadcast-actions");
  const clear = adminEl("button", "admin-mod-cancel");
  clear.type = "button";
  clear.textContent = "Clear";
  const save = adminEl("button", "admin-mod-confirm");
  save.type = "button";
  save.textContent = "Save";
  function showBroadcastError(text) {
    err.textContent = text || "";
    err.hidden = !text;
  }
  function applyBroadcastMessage(message) {
    area.value = message || "";
    paintNewsBroadcastPreview(preview, area.value);
  }
  clear.addEventListener("click", () => {
    showBroadcastError("");
    clear.disabled = true;
    save.disabled = true;
    adminApi("/news/broadcast", { method: "POST", body: { message: "" } }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      clear.disabled = false;
      save.disabled = false;
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not clear the broadcast.");
        return;
      }
      applyBroadcastMessage("");
    }).catch(() => {
      clear.disabled = false;
      save.disabled = false;
      showBroadcastError("Could not clear the broadcast.");
    });
  });
  save.addEventListener("click", () => {
    showBroadcastError("");
    clear.disabled = true;
    save.disabled = true;
    adminApi("/news/broadcast", { method: "POST", body: { message: area.value } }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      clear.disabled = false;
      save.disabled = false;
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not save the broadcast.");
        return;
      }
      applyBroadcastMessage(result.data && result.data.message);
    }).catch(() => {
      clear.disabled = false;
      save.disabled = false;
      showBroadcastError("Could not save the broadcast.");
    });
  });
  row.appendChild(clear);
  row.appendChild(save);
  panel.body.appendChild(row);
  main.appendChild(panel.panel);
  paintNewsBroadcastPreview(preview, "");
  adminApi("/news/broadcast").then((response) => response.ok ? response.json() : null).then((data) => {
    if (adminPage !== "news" || adminSection !== "broadcast") return;
    applyBroadcastMessage(data && data.message);
  }).catch(() => {});
}

function fillNewsDonateCard(disclaimer, href) {
  const note = document.getElementById("news-donate-disclaimer");
  const text = String(disclaimer || "").trim();
  if (note) {
    if (text) fillNewsMarkdown(note, text);
    else note.textContent = "Disclaimer will be set later.";
  }
  const go = document.getElementById("news-donate-continue");
  if (!go) return;
  const url = String(href || "").trim();
  go.dataset.href = url;
  go.disabled = !(url && text);
}

function openNewsDonateCard(disclaimer, href) {
  fillNewsDonateCard(disclaimer, href);
  const overlay = document.getElementById("news-donate-overlay");
  if (!overlay) return;
  overlay.hidden = false;
}

function closeNewsDonateCard() {
  const overlay = document.getElementById("news-donate-overlay");
  if (overlay) overlay.hidden = true;
}

function paintNews(main, sectionId) {
  if (sectionId === "donate") return paintNewsDonate(main);
  if (sectionId === "events") return paintNewsEvents(main);
  if (sectionId === "broadcast") return paintNewsBroadcast(main);
  paintNewsAnnouncements(main);
}

registerAdminPage({
  id: "news",
  label: "News",
  sections: [
    { id: "announcements", label: "Announcements", icon: "flag" },
    { id: "donate", label: "Donate", icon: "plus" },
    { id: "events", label: "Events", icon: "calendar" },
    { id: "broadcast", label: "Broadcast", icon: "activity" }
  ],
  paint: paintNews
});

document.addEventListener("click", (event) => {
  if (event.target && event.target.id === "news-donate-overlay") closeNewsDonateCard();
});
const newsDonateCancel = document.getElementById("news-donate-cancel");
if (newsDonateCancel) newsDonateCancel.addEventListener("click", closeNewsDonateCard);
const newsDonateContinue = document.getElementById("news-donate-continue");
if (newsDonateContinue) {
  newsDonateContinue.addEventListener("click", () => {
    const href = newsDonateContinue.dataset.href || "";
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    closeNewsDonateCard();
  });
}
