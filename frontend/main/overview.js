const OVERVIEW_STAFF_PERMS = ["update_server", "manage_roles", "kick_members", "ban_members"];

let overviewLoadToken = 0;
let overviewTickTimer = null;
let overviewTickState = { zone: "", current: null };

function overviewFetchJson(url) {
  return fetch(url, { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).catch(() => null);
}

function overviewEmptyLine(text) {
  const line = document.createElement("div");
  line.className = "server-overview-placeholder";
  line.textContent = text;
  return line;
}

function overviewFillFrame(id, title, body, foot, centered) {
  const frame = document.getElementById(id);
  if (!frame) return;
  frame.replaceChildren();
  const head = document.createElement("div");
  head.className = "server-overview-frame-head" + (centered ? " is-centered" : "");
  const heading = document.createElement("div");
  heading.className = "server-overview-frame-title";
  heading.textContent = title;
  head.appendChild(heading);
  frame.appendChild(head);
  body.classList.add("server-overview-frame-body");
  frame.appendChild(body);
  if (foot) {
    foot.classList.add("server-overview-frame-foot");
    frame.appendChild(foot);
  }
}

function overviewPersonName(member) {
  if (!member) return "";
  if (member.nickname) return member.nickname;
  return member.display_name || member.username || "";
}

function overviewRoleById(roles, id) {
  return (roles || []).find((role) => Number(role.id) === Number(id)) || null;
}

function overviewHighestRole(member, roles) {
  const high = member && member.highest_role;
  if (!high) return null;
  return overviewRoleById(roles, high.id) || high;
}

function overviewMemberIsStaff(member, roles) {
  if (!member || member.is_owner) return false;
  const role = overviewHighestRole(member, roles);
  const perms = (role && role.permissions) || {};
  return OVERVIEW_STAFF_PERMS.some((key) => perms[key]);
}

function overviewTimezoneLabel(zone) {
  if (!zone) return "";
  if (typeof serverTimezoneLabel === "function") return serverTimezoneLabel(zone);
  return String(zone).replace(/_/g, " ");
}

function overviewClockParts(zone) {
  if (!zone) return null;
  try {
    const now = new Date();
    return {
      time: new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
      }).format(now),
      date: new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(now),
    };
  } catch (e) {
    return null;
  }
}

function overviewEventWhen(event) {
  if (typeof calendarDate === "function") return calendarDate(event.occurs_at || event.starts_at);
  const stamp = event.occurs_at || event.starts_at;
  return stamp ? new Date(stamp) : new Date();
}

function overviewEventLength(event) {
  if (!event || !event.starts_at || !event.ends_at) return 60 * 60 * 1000;
  const start = overviewEventWhen({ starts_at: event.starts_at }).getTime();
  const end = overviewEventWhen({ starts_at: event.ends_at }).getTime();
  return end > start ? end - start : 60 * 60 * 1000;
}

function overviewMonthEnd() {
  const zone = (typeof calendarServerZone === "function")
    ? calendarServerZone()
    : ((currentServerData && currentServerData.timezone) || "UTC");
  const now = new Date();
  let year;
  let month;
  if (typeof calendarZoneParts === "function") {
    const parts = calendarZoneParts(now, zone);
    year = Number(parts.year);
    month = Number(parts.month);
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const stamp = nextYear + "-" + String(nextMonth).padStart(2, "0") + "-01T00:00";
  if (typeof calendarInputToDate === "function") return calendarInputToDate(stamp, zone);
  return new Date(nextYear, nextMonth - 1, 1);
}

function overviewEventWindows(events) {
  const now = Date.now();
  const monthEnd = overviewMonthEnd();
  const from = new Date(now - 24 * 60 * 60 * 1000);
  const until = monthEnd && monthEnd.getTime() > now ? monthEnd : new Date(now + 40 * 24 * 60 * 60 * 1000);
  const rows = [];
  (events || []).forEach((event) => {
    if (!event || event.cancelled_at) return;
    const length = overviewEventLength(event);
    const seen = new Set();
    const pushWhen = (when) => {
      if (!when || Number.isNaN(when.getTime())) return;
      const start = when.getTime();
      if (seen.has(start)) return;
      seen.add(start);
      rows.push({ event, when, start, end: start + length });
    };
    if (event.starts_at) pushWhen(overviewEventWhen(event));
    if (typeof calendarExpand === "function") calendarExpand(event, from, until).forEach(pushWhen);
  });
  rows.sort((a, b) => a.start - b.start);
  const current = rows.filter((row) => now >= row.start && now < row.end);
  const monthLimit = monthEnd ? monthEnd.getTime() : Infinity;
  const upcoming = rows.filter((row) => row.start > now && row.start < monthLimit);
  return { current: current[0] || null, upcoming: upcoming.slice(0, 5) };
}

function overviewGoingCount(event) {
  return (event.rsvps || []).filter((row) => row.status === "going").length;
}

function overviewPad(n) {
  return String(n).padStart(2, "0");
}

function overviewFormatTimer(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return (h > 0 ? String(h) + ":" : "") + overviewPad(m) + ":" + overviewPad(s);
}

function overviewFormatSpan(ms) {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return totalMin + "m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? h + "h " + m + "m" : h + "h";
}

function overviewBindPerson(row, member) {
  if (!member || !member.id) return;
  row.style.cursor = "pointer";
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(row, member.id);
}

function overviewPersonRow(member, roleLabel) {
  const row = document.createElement("div");
  row.className = "server-overview-person";
  const face = document.createElement("div");
  face.className = "avatar-dot";
  const pip = document.createElement("div");
  const online = typeof memberAppearsOnline === "function" ? memberAppearsOnline(member.status) : member.status === "online";
  pip.className = "status-dot status-" + (online ? (member.status || "online") : "offline");
  face.appendChild(pip);
  row.appendChild(face);
  if (typeof paintUserFace === "function") {
    paintUserFace(face, member, { userId: member.id, name: overviewPersonName(member) });
  }
  const text = document.createElement("div");
  text.className = "server-overview-person-text";
  const name = document.createElement("div");
  name.className = "server-overview-person-name";
  name.textContent = overviewPersonName(member);
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, member.id, member.name_role);
  text.appendChild(name);
  if (roleLabel) {
    const role = document.createElement("div");
    role.className = "server-overview-person-role";
    role.textContent = roleLabel;
    text.appendChild(role);
  }
  row.appendChild(text);
  overviewBindPerson(row, member);
  return row;
}

function overviewPaintStaff(members, roles) {
  const body = document.createElement("div");
  const people = [];
  const owner = (members || []).find((member) => member.is_owner);
  if (owner) people.push({ member: owner, label: "Owner" });
  const staff = (members || []).filter((member) => overviewMemberIsStaff(member, roles));
  staff.sort((a, b) => {
    const roleA = overviewHighestRole(a, roles);
    const roleB = overviewHighestRole(b, roles);
    const posA = roleA ? Number(roleA.position || 0) : 9999;
    const posB = roleB ? Number(roleB.position || 0) : 9999;
    return posA - posB || overviewPersonName(a).localeCompare(overviewPersonName(b));
  });
  staff.forEach((member) => {
    const role = overviewHighestRole(member, roles);
    people.push({ member, label: (role && role.name) || "Admin" });
  });
  if (!people.length) {
    body.appendChild(overviewEmptyLine("No staff yet."));
  } else {
    const shown = people.slice(0, 5);
    shown.forEach((row) => body.appendChild(overviewPersonRow(row.member, row.label)));
    const extra = people.length - shown.length;
    if (extra > 0) {
      const more = document.createElement("div");
      more.className = "server-overview-more";
      more.textContent = "+" + extra + " more staff members.";
      body.appendChild(more);
    }
  }
  overviewFillFrame("overview-frame-staff", "Owner & Admins", body);
}

function overviewPaintMembers(members) {
  const body = document.createElement("div");
  const list = members || [];
  const online = list.filter((member) => (typeof memberAppearsOnline === "function" ? memberAppearsOnline(member.status) : member.status === "online")).length;
  [
    ["total", "Total", list.length, false],
    ["online", "Online", online, true],
    ["offline", "Offline", Math.max(0, list.length - online), true],
  ].forEach((row) => {
    const line = document.createElement("div");
    line.className = "server-overview-stat is-" + row[0];
    const label = document.createElement("span");
    label.className = "server-overview-stat-label";
    label.textContent = row[3] ? row[1] + ":" : row[1];
    const value = document.createElement("span");
    value.className = "server-overview-stat-value";
    value.textContent = String(row[2]);
    line.appendChild(label);
    line.appendChild(value);
    body.appendChild(line);
  });
  overviewFillFrame("overview-frame-members", "Members", body);
}

function overviewPaintTimezoneClockOnly() {
  const timeEl = document.getElementById("overview-clock-time");
  const dateEl = document.getElementById("overview-clock-date");
  if (!timeEl || !dateEl || !overviewTickState.zone) return;
  const parts = overviewClockParts(overviewTickState.zone);
  if (!parts) return;
  timeEl.textContent = parts.time;
  dateEl.textContent = parts.date;
}

function overviewPaintTimezone() {
  const body = document.createElement("div");
  body.classList.add("server-overview-timezone-body");
  const zone = (currentServerData && currentServerData.timezone) || "";
  overviewTickState.zone = zone;
  if (!zone) {
    body.appendChild(overviewEmptyLine("No timezone."));
  } else {
    const name = document.createElement("div");
    name.className = "server-overview-timezone";
    name.textContent = overviewTimezoneLabel(zone);
    const time = document.createElement("div");
    time.className = "server-overview-timezone-clock";
    time.id = "overview-clock-time";
    const date = document.createElement("div");
    date.className = "server-overview-timezone-date";
    date.id = "overview-clock-date";
    const parts = overviewClockParts(zone);
    time.textContent = parts ? parts.time : "";
    date.textContent = parts ? parts.date : "";
    body.appendChild(name);
    body.appendChild(time);
    body.appendChild(date);
  }
  overviewFillFrame("overview-frame-timezone", "Timezone", body, null, true);
}

function overviewPaintAbout() {
  const body = document.createElement("div");
  body.classList.add("server-overview-about-body");
  const about = (currentServerData && currentServerData.about) || "";
  if (!String(about).trim()) {
    body.appendChild(overviewEmptyLine("No description."));
  } else {
    const text = document.createElement("div");
    text.className = "server-overview-about";
    if (typeof mdAppend === "function") mdAppend(text, about);
    else text.textContent = about;
    body.appendChild(text);
  }
  overviewFillFrame("overview-frame-about", "Description", body, null, true);
}

function overviewPaintPost(posts) {
  const body = document.createElement("div");
  const post = (posts || [])[0];
  if (!post) {
    body.appendChild(overviewEmptyLine("No posts yet."));
    overviewFillFrame("overview-frame-post", "Latest Post", body, null, true);
    return;
  }
  body.classList.add("server-overview-post-body");
  const top = document.createElement("div");
  top.className = "announce-post-top";
  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, post, { name: post.username, userId: post.sender_id });
  else avatar.textContent = (post.username || "?").charAt(0).toUpperCase();
  if (post.sender_id && typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(avatar, post.sender_id);
  const meta = document.createElement("div");
  meta.className = "announce-post-meta";
  const name = document.createElement("div");
  name.className = "announce-post-name";
  name.textContent = post.username || "Unknown";
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, post.sender_id, post.name_role || post.nameRole);
  meta.appendChild(name);
  const where = document.createElement("div");
  where.className = "announce-post-role";
  where.textContent = "#" + (post.channel_name || "announcements");
  meta.appendChild(where);
  top.appendChild(avatar);
  top.appendChild(meta);
  const title = document.createElement("div");
  title.className = "announce-post-title";
  title.textContent = post.title || "Announcement";
  const snippet = document.createElement("div");
  snippet.className = "announce-post-body server-overview-post-snippet";
  if (post.body) {
    if (typeof fillMentionText === "function") fillMentionText(snippet, post.body, post.mentionUsers, post.mentionRoles, { rich: true });
    else snippet.textContent = post.body;
  }
  body.appendChild(top);
  body.appendChild(title);
  if (post.body) body.appendChild(snippet);
  const foot = document.createElement("div");
  foot.classList.add("server-overview-post-foot");
  const when = document.createElement("span");
  when.className = "server-overview-post-when";
  if (post.created_at && typeof formatClusterTime === "function") {
    const parsed = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(post.created_at) : new Date(post.created_at);
    when.textContent = formatClusterTime(parsed);
  }
  const comments = document.createElement("span");
  comments.className = "server-overview-post-comments";
  comments.textContent = `${Number(post.comment_count) || 0} comments`;
  foot.appendChild(when);
  foot.appendChild(comments);
  const openPost = (e) => {
    if (e.target.closest(".is-mini-profile-target")) return;
    openOverviewAnnouncement(post);
  };
  body.addEventListener("click", openPost);
  foot.addEventListener("click", openPost);
  overviewFillFrame("overview-frame-post", "Latest Post", body, foot, true);
}

function overviewEventRow(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "server-overview-event";
  const dot = document.createElement("span");
  dot.className = "server-overview-event-dot";
  if (typeof calendarHex === "function") dot.style.background = calendarHex(item.event.color);
  const text = document.createElement("div");
  text.className = "server-overview-event-text";
  const name = document.createElement("div");
  name.className = "server-overview-event-name";
  name.textContent = item.event.name || "Event";
  const when = document.createElement("div");
  when.className = "server-overview-event-when";
  if (typeof calendarLongWhen === "function") when.textContent = calendarLongWhen(item.when);
  else when.textContent = item.when.toLocaleString();
  text.appendChild(name);
  text.appendChild(when);
  row.appendChild(dot);
  row.appendChild(text);
  row.addEventListener("click", () => {
    if (typeof openEventPage === "function") openEventPage(item.event);
  });
  return row;
}

function overviewPaintCurrentTimerOnly() {
  const timer = document.getElementById("overview-event-timer");
  const caption = document.getElementById("overview-event-timer-caption");
  const item = overviewTickState.current;
  if (!timer) return;
  if (!item) {
    timer.textContent = "—";
    if (caption) caption.textContent = "";
    return;
  }
  timer.textContent = overviewFormatTimer(item.end - Date.now());
  if (caption) caption.textContent = overviewFormatSpan(item.end - item.start) + " scheduled";
}

function overviewPaintCurrentEvent(windows) {
  const body = document.createElement("div");
  const foot = document.createElement("div");
  foot.classList.add("server-overview-timer-foot");
  const item = windows.current;
  overviewTickState.current = item;
  if (!item) {
    body.appendChild(overviewEmptyLine("No event right now."));
    const timer = document.createElement("div");
    timer.className = "server-overview-timer";
    timer.id = "overview-event-timer";
    timer.textContent = "—";
    const caption = document.createElement("div");
    caption.className = "server-overview-timer-caption";
    caption.id = "overview-event-timer-caption";
    foot.appendChild(timer);
    foot.appendChild(caption);
    overviewFillFrame("overview-frame-now", "Current Event", body, foot);
    return;
  }
  body.classList.add("server-overview-now-body");
  const title = document.createElement("div");
  title.className = "server-overview-now-title";
  title.textContent = item.event.name || "Event";
  const started = document.createElement("div");
  started.className = "server-overview-now-meta";
  started.textContent = (typeof calendarLongWhen === "function" ? calendarLongWhen(item.when) : item.when.toLocaleString());
  const going = document.createElement("div");
  going.className = "server-overview-now-meta";
  const count = overviewGoingCount(item.event);
  going.textContent = count === 1 ? "1 going" : count + " going";
  body.appendChild(title);
  body.appendChild(started);
  body.appendChild(going);
  const description = (item.event.description || "").trim();
  if (description) {
    const text = document.createElement("div");
    text.className = "server-overview-now-desc";
    if (typeof mdAppend === "function") mdAppend(text, description);
    else text.textContent = description;
    body.appendChild(text);
  }
  body.addEventListener("click", () => {
    if (typeof openEventPage === "function") openEventPage(item.event);
  });
  const timer = document.createElement("div");
  timer.className = "server-overview-timer";
  timer.id = "overview-event-timer";
  const caption = document.createElement("div");
  caption.className = "server-overview-timer-caption";
  caption.id = "overview-event-timer-caption";
  foot.appendChild(timer);
  foot.appendChild(caption);
  overviewFillFrame("overview-frame-now", "Current Event", body, foot);
  overviewPaintCurrentTimerOnly();
}

function overviewPaintUpcoming(windows) {
  const body = document.createElement("div");
  body.classList.add("server-overview-soon-body");
  if (!windows.upcoming.length) body.appendChild(overviewEmptyLine("No upcoming events."));
  else windows.upcoming.forEach((item) => body.appendChild(overviewEventRow(item)));
  overviewFillFrame("overview-frame-soon", "Upcoming Events", body);
}

function overviewPaintPlaceholders() {
  overviewPaintStaff([], []);
  overviewPaintMembers([]);
  overviewPaintTimezone();
  overviewPaintAbout();
  overviewPaintPost([]);
  const emptyWindows = { current: null, upcoming: [] };
  overviewPaintCurrentEvent(emptyWindows);
  overviewPaintUpcoming(emptyWindows);
}

function overviewStopTick() {
  if (overviewTickTimer) {
    clearInterval(overviewTickTimer);
    overviewTickTimer = null;
  }
}

function overviewStartTick() {
  overviewStopTick();
  overviewTickTimer = setInterval(() => {
    const overview = document.getElementById("server-overview");
    if (!overview || overview.style.display === "none") {
      overviewStopTick();
      return;
    }
    overviewPaintTimezoneClockOnly();
    overviewPaintCurrentTimerOnly();
  }, 1000);
}

async function openOverviewAnnouncement(post) {
  if (!post || !currentServerData) return;
  let target = null;
  (currentServerData.categories || []).forEach((category) => {
    (category.channels || []).forEach((channel) => {
      if (Number(channel.id) === Number(post.channel_id)) target = channel;
    });
  });
  if (target && typeof selectChannel === "function") await selectChannel(target);
  if (typeof jumpLoadAroundAnnouncement === "function") await jumpLoadAroundAnnouncement(post.id);
  const el = document.querySelector(`.announce-post[data-post-id="${CSS.escape(String(post.id))}"]`);
  if (el) el.scrollIntoView({ block: "center" });
}

async function openServerOverview(preload) {
  if (!currentServerId) return;
  const token = ++overviewLoadToken;
  const serverId = currentServerId;
  overviewStopTick();
  if (typeof switchMainView === "function") switchMainView("channel");
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof closePinsPanel === "function") closePinsPanel();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  if (typeof hideDocChannelChrome === "function") hideDocChannelChrome();
  if (typeof hideMediaChannelChrome === "function") hideMediaChannelChrome();
  if (typeof hideScheduleChrome === "function") hideScheduleChrome();
  if (typeof hideEventBack === "function") hideEventBack();
  if (typeof hideExplicitChannelGate === "function") hideExplicitChannelGate();
  if (typeof closeVoiceStage === "function") closeVoiceStage();
  openForumPostId = null;
  const forumBack = document.getElementById("forum-back-btn");
  if (forumBack) forumBack.style.display = "none";
  const eventPageBack = document.getElementById("event-page-back");
  if (eventPageBack) eventPageBack.style.display = "none";
  const forumOpener = document.getElementById("forum-thread-opener");
  if (forumOpener) {
    forumOpener.hidden = true;
    forumOpener.replaceChildren();
  }
  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  document.querySelectorAll(".channel-row.active").forEach((row) => row.classList.remove("active"));
  if (typeof hideChannelSurfaces === "function") hideChannelSurfaces();
  const voiceView = document.getElementById("voice-view");
  if (voiceView) voiceView.style.display = "none";
  const overview = document.getElementById("server-overview");
  const row = document.getElementById("server-section-overview");
  if (row) row.classList.add("active");
  if (overview) overview.style.display = "flex";
  const title = document.getElementById("channel-header-title");
  if (title) title.textContent = "Overview";
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  overviewPaintPlaceholders();
  if (preload && (preload.members || preload.roles || preload.posts)) {
    const members = preload.members || [];
    const roles = preload.roles || [];
    const posts = preload.posts || [];
    const events = preload.events || [];
    const windows = overviewEventWindows(events);
    overviewPaintStaff(members, roles);
    overviewPaintMembers(members);
    overviewPaintTimezone();
    overviewPaintAbout();
    overviewPaintPost(posts);
    overviewPaintCurrentEvent(windows);
    overviewPaintUpcoming(windows);
    overviewStartTick();
    return;
  }
  const [membersPayload, rolesPayload, postsPayload, eventsPayload] = await Promise.all([
    overviewFetchJson(`https://${serverAddress}/get_server_members/${serverId}`),
    overviewFetchJson(`https://${serverAddress}/get_server_roles/${serverId}`),
    overviewFetchJson(`https://${serverAddress}/server_overview/${serverId}`),
    overviewFetchJson(`https://${serverAddress}/get_event_rows/${serverId}`),
  ]);
  if (token !== overviewLoadToken || String(currentServerId) !== String(serverId)) return;
  const members = (membersPayload && membersPayload.members) || [];
  const roles = (rolesPayload && rolesPayload.roles) || [];
  const posts = (postsPayload && postsPayload.posts) || [];
  const events = (eventsPayload && eventsPayload.events) || [];
  const windows = overviewEventWindows(events);
  overviewPaintStaff(members, roles);
  overviewPaintMembers(members);
  overviewPaintTimezone();
  overviewPaintAbout();
  overviewPaintPost(posts);
  overviewPaintCurrentEvent(windows);
  overviewPaintUpcoming(windows);
  overviewStartTick();
}

const serverSectionOverview = document.getElementById("server-section-overview");
if (serverSectionOverview) {
  serverSectionOverview.addEventListener("click", () => {
    if (typeof beginBody === "function") {
      beginBody({
        view: "channel",
        titleEl: "channel-header-title",
        title: "Overview"
      });
    }
    openServerOverview();
  });
}
