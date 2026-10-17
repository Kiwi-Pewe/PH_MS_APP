const OVERVIEW_STAFF_PERMS = ["update_server", "manage_roles", "kick_members", "ban_members"];

let overviewLoadToken = 0;

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

function overviewFrameTitle(text) {
  const title = document.createElement("div");
  title.className = "server-overview-frame-title";
  title.textContent = text;
  return title;
}

function overviewFillFrame(id, title, body) {
  const frame = document.getElementById(id);
  if (!frame) return;
  frame.replaceChildren();
  frame.appendChild(overviewFrameTitle(title));
  frame.appendChild(body);
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
  return String(zone).replace(/_/g, " ");
}

function overviewClock(zone) {
  if (!zone) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
  } catch (e) {
    return "";
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

function overviewEventWindows(events) {
  const now = Date.now();
  const from = new Date(now - 24 * 60 * 60 * 1000);
  const until = new Date(now + 120 * 24 * 60 * 60 * 1000);
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
  const upcoming = rows.filter((row) => row.start > now);
  return { current: current[0] || null, upcoming: upcoming.slice(0, 5) };
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
  body.className = "server-overview-frame-body";
  const owner = (members || []).find((member) => member.is_owner);
  if (owner) body.appendChild(overviewPersonRow(owner, "Owner"));
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
    body.appendChild(overviewPersonRow(member, (role && role.name) || "Admin"));
  });
  if (!owner && !staff.length) body.appendChild(overviewEmptyLine("No staff yet."));
  else if (!staff.length && owner) body.appendChild(overviewEmptyLine("No admins."));
  overviewFillFrame("overview-frame-staff", "Owner & Admins", body);
}

function overviewPaintMembers(members) {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
  const list = members || [];
  const online = list.filter((member) => (typeof memberAppearsOnline === "function" ? memberAppearsOnline(member.status) : member.status === "online")).length;
  const rows = [
    ["Total", list.length],
    ["Online", online],
    ["Offline", Math.max(0, list.length - online)],
  ];
  rows.forEach((pair) => {
    const row = document.createElement("div");
    row.className = "server-overview-stat";
    const label = document.createElement("span");
    label.textContent = pair[0];
    const value = document.createElement("span");
    value.className = "server-overview-stat-value";
    value.textContent = String(pair[1]);
    row.appendChild(label);
    row.appendChild(value);
    body.appendChild(row);
  });
  overviewFillFrame("overview-frame-members", "Members", body);
}

function overviewPaintTimezone() {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
  const zone = (currentServerData && currentServerData.timezone) || "";
  if (!zone) {
    body.appendChild(overviewEmptyLine("No timezone."));
  } else {
    const name = document.createElement("div");
    name.className = "server-overview-timezone";
    name.textContent = overviewTimezoneLabel(zone);
    body.appendChild(name);
    const clock = overviewClock(zone);
    if (clock) {
      const when = document.createElement("div");
      when.className = "server-overview-timezone-clock";
      when.textContent = clock;
      body.appendChild(when);
    }
  }
  overviewFillFrame("overview-frame-timezone", "Timezone", body);
}

function overviewPaintAbout() {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
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
  overviewFillFrame("overview-frame-about", "Description", body);
}

function overviewPaintPost(posts) {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
  const post = (posts || [])[0];
  if (!post) {
    body.appendChild(overviewEmptyLine("No posts yet."));
    overviewFillFrame("overview-frame-post", "Latest Post", body);
    return;
  }
  const card = document.createElement("button");
  card.type = "button";
  card.className = "server-overview-card";
  const where = document.createElement("div");
  where.className = "server-overview-channel";
  where.textContent = "#" + (post.channel_name || "announcements");
  const title = document.createElement("div");
  title.className = "server-overview-card-title";
  title.textContent = post.title || "Announcement";
  const meta = document.createElement("div");
  meta.className = "server-overview-card-meta";
  meta.textContent = post.username || "";
  card.appendChild(where);
  card.appendChild(title);
  card.appendChild(meta);
  if (post.body) {
    const snippet = document.createElement("div");
    snippet.className = "server-overview-card-body";
    snippet.textContent = String(post.body).replace(/\s+/g, " ").trim();
    card.appendChild(snippet);
  }
  card.addEventListener("click", () => openOverviewAnnouncement(post));
  body.appendChild(card);
  overviewFillFrame("overview-frame-post", "Latest Post", body);
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

function overviewPaintCurrentEvent(windows) {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
  if (!windows.current) body.appendChild(overviewEmptyLine("No event right now."));
  else body.appendChild(overviewEventRow(windows.current));
  overviewFillFrame("overview-frame-now", "Current Event", body);
}

function overviewPaintUpcoming(windows) {
  const body = document.createElement("div");
  body.className = "server-overview-frame-body";
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

async function openServerOverview() {
  if (!currentServerId) return;
  const token = ++overviewLoadToken;
  const serverId = currentServerId;
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
}

const serverSectionOverview = document.getElementById("server-section-overview");
if (serverSectionOverview) {
  serverSectionOverview.addEventListener("click", () => openServerOverview());
}
