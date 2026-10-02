const EVENT_GROUP = { invited: true, going: true, maybe: true, waitlisted: true };

let eventRailRows = [];
let eventRailToken = 0;
let openEventId = null;
let openEventChannelId = null;
let openEventRecord = null;

function eventStillOpen(event) {
  if (!event || event.cancelled_at) return false;
  const end = event.ends_at ? new Date(event.ends_at) : null;
  if (!end || Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

function eventInMyGroup(event) {
  if (!eventStillOpen(event)) return false;
  return (event.rsvps || []).some((row) => Number(row.user_id) === Number(myUserId) && EVENT_GROUP[row.status]);
}

function eventUnreadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem("oneira-event-unread") || "[]");
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch (err) {
    return [];
  }
}

function noteEventUnread(event) {
  if (!eventInMyGroup(event)) return;
  if (openEventId && Number(openEventId) === Number(event.id)) return;
  if ((eventRailRows || []).some((row) => Number(row.id) === Number(event.id))) return;
  const ids = eventUnreadIds();
  if (ids.includes(Number(event.id))) return;
  ids.push(Number(event.id));
  localStorage.setItem("oneira-event-unread", JSON.stringify(ids));
}

function clearEventUnread(eventId) {
  const ids = eventUnreadIds().filter((id) => id !== Number(eventId));
  localStorage.setItem("oneira-event-unread", JSON.stringify(ids));
}

async function refreshEventRows() {
  const token = ++eventRailToken;
  if (typeof currentServerId === "undefined" || !currentServerId) {
    eventRailRows = [];
    paintEventRailRows();
    return;
  }
  const response = await fetch(`https://${serverAddress}/get_event_rows/${currentServerId}`, { credentials: "include" });
  if (token !== eventRailToken) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  eventRailRows = data.events || [];
  paintEventRailRows();
}

function paintEventRailRows() {
  document.querySelectorAll(".event-rail-row").forEach((node) => node.remove());
  const unread = new Set(eventUnreadIds());
  const groups = new Map();
  (eventRailRows || []).forEach((event) => {
    const key = String(event.channel_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  groups.forEach((events, channelId) => {
    const parent = document.querySelector(`#category-list .channel-row[data-channel-id="${channelId}"]`);
    if (!parent) return;
    let after = parent;
    events.forEach((event) => {
      const row = document.createElement("div");
      row.className = "channel-row event-rail-row";
      row.dataset.eventId = String(event.id);
      if (unread.has(Number(event.id))) row.classList.add("has-unread");
      if (openEventId && Number(openEventId) === Number(event.id)) row.classList.add("active");
      const icon = document.createElement("span");
      icon.className = "channel-icon";
      icon.textContent = typeof channelTypeIcon === "function" ? channelTypeIcon("events") : "#";
      const label = document.createElement("span");
      label.className = "channel-label";
      label.textContent = event.name || "Event";
      row.appendChild(icon);
      row.appendChild(label);
      if (unread.has(Number(event.id))) {
        const badge = document.createElement("span");
        badge.className = "channel-mention-badge";
        badge.textContent = "1";
        row.appendChild(badge);
      }
      row.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        openEventPage(event);
      });
      after.insertAdjacentElement("afterend", row);
      after = row;
    });
  });
}

function eventAgo(stamp) {
  const then = stamp ? new Date(stamp) : null;
  if (!then || Number.isNaN(then.getTime())) return "";
  const sec = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (sec < 60) return "Just now";
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : minutes + " minutes ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : hours + " hours ago";
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : days + " days ago";
}

function eventWhenText(event) {
  if (typeof calendarDate !== "function" || typeof calendarClock !== "function") return "";
  const start = calendarDate(event.starts_at);
  const end = event.ends_at ? calendarDate(event.ends_at) : null;
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const server = typeof calendarServerZone === "function" ? calendarServerZone() : local;
  const localSpan = calendarClock(start, local) + (end ? (" \u2013 " + calendarClock(end, local)) : "");
  let text = calendarWeekday(start, local) + " · " + localSpan + " " + local;
  if (calendarClock(start, local) !== calendarClock(start, server) || (end && calendarClock(end, local) !== calendarClock(end, server))) {
    const serverSpan = calendarClock(start, server) + (end ? (" \u2013 " + calendarClock(end, server)) : "");
    text += "\n" + calendarWeekday(start, server) + " · " + serverSpan + " " + server;
  }
  return text;
}

function eventMemberByName(name) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const pools = [];
  if (typeof memberList !== "undefined" && Array.isArray(memberList)) pools.push(memberList);
  if (typeof calendarMembers !== "undefined" && Array.isArray(calendarMembers)) pools.push(calendarMembers);
  for (let i = 0; i < pools.length; i += 1) {
    const found = pools[i].find((row) => String(row.username || "").toLowerCase() === wanted);
    if (found) return found;
  }
  return null;
}

function paintCalendarInfoRsvp(item) {
  const foot = document.getElementById("calendar-info-rsvp");
  if (!foot || !item) return;
  foot.replaceChildren();
  const off = item.rsvp_enabled === false || !!item.cancelled_at || !eventStillOpen(item);
  const mine = (item.rsvps || []).find((row) => Number(row.user_id) === Number(myUserId));
  ["going", "maybe", "declined"].forEach((status) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-rsvp-choice";
    button.textContent = status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Declined";
    if (mine && mine.status === status) button.classList.add("is-on");
    button.disabled = off;
    if (!off) button.addEventListener("click", () => submitCalendarRsvp(item, status));
    foot.appendChild(button);
  });
}

async function submitCalendarRsvp(item, status) {
  if (!item) return;
  if (status === "declined" && !window.confirm("Leave this event?")) return;
  const response = await fetch(`https://${serverAddress}/calendar_event_rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      event_id: item.id,
      occurrence_at: item.occurs_at || item.starts_at,
      status,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that RSVP.");
    return;
  }
  if (typeof applyCalendarEvent === "function") applyCalendarEvent(data);
  if (typeof refreshEventRows === "function") refreshEventRows();
  if (status === "declined") {
    if (typeof closeCalendarInfo === "function") closeCalendarInfo();
    leaveEventPage();
    return;
  }
  if (typeof calendarInfoItem !== "undefined" && calendarInfoItem && Number(calendarInfoItem.id) === Number(data.id) && typeof openCalendarInfo === "function") {
    openCalendarInfo(Object.assign({}, data, { occurs_at: item.occurs_at || data.starts_at }));
  }
  paintOpenEventPage(data);
}

function eventChannelRecord(channelId) {
  const data = typeof currentServerData !== "undefined" ? currentServerData : null;
  if (!data || !Array.isArray(data.categories)) return null;
  for (let index = 0; index < data.categories.length; index += 1) {
    const found = (data.categories[index].channels || []).find((channel) => Number(channel.id) === Number(channelId));
    if (found) return found;
  }
  return null;
}

function hideEventBack() {
  const back = document.getElementById("event-page-back");
  if (back) back.style.display = "none";
}

function closeEventPageIf(eventId) {
  if (!openEventId || Number(openEventId) !== Number(eventId)) return;
  openEventId = null;
  const page = document.getElementById("event-page");
  if (page) page.style.display = "none";
  hideEventBack();
  paintEventRailRows();
}

function leaveEventPage() {
  const channel = eventChannelRecord(openEventChannelId);
  openEventId = null;
  hideEventBack();
  const page = document.getElementById("event-page");
  if (page) page.style.display = "none";
  if (channel && typeof selectChannel === "function") selectChannel(channel);
}

async function openEventPage(event) {
  if (!event) return;
  clearEventUnread(event.id);
  document.querySelectorAll(".channel-row").forEach((row) => row.classList.remove("active"));
  if (typeof switchMainView === "function") switchMainView("channel");
  if (typeof hideChannelSurfaces === "function") hideChannelSurfaces();
  openEventId = Number(event.id);
  openEventChannelId = event.channel_id;
  const page = document.getElementById("event-page");
  if (page) page.style.display = "flex";
  const channel = eventChannelRecord(event.channel_id);
  const title = document.getElementById("channel-header-title");
  if (title) title.textContent = (channel && channel.name) || "Calendar";
  const back = document.getElementById("event-page-back");
  if (back) back.style.display = "inline-flex";
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  paintEventRailRows();
  if (typeof refreshEventRows === "function") refreshEventRows();
  await reloadOpenEventPage(event.id);
}

function paintOpenEventPage(event) {
  if (!openEventId || !event || Number(event.id) !== Number(openEventId)) return;
  reloadOpenEventPage(event.id);
}

async function reloadOpenEventPage(eventId) {
  if (!openEventId || Number(openEventId) !== Number(eventId)) return;
  const response = await fetch(`https://${serverAddress}/get_event_page/${eventId}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    closeEventPageIf(eventId);
    return;
  }
  paintEventPage(data);
}

function paintEventFace(person) {
  const face = document.createElement("button");
  face.type = "button";
  face.className = "avatar-dot event-page-face";
  if (typeof paintUserFace === "function") {
    paintUserFace(face, { username: person.username }, { userId: person.user_id, name: person.username, circle: true });
  }
  face.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(person.user_id, face);
  });
  return face;
}

function paintEventName(person) {
  const name = document.createElement("button");
  name.type = "button";
  name.className = "event-page-person-name";
  name.textContent = person.username || "Member";
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, person.user_id);
  name.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(person.user_id, name);
  });
  return name;
}

function eventZoneShort(zone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date());
    const found = parts.find((part) => part.type === "timeZoneName");
    return found ? found.value : zone;
  } catch (err) {
    return zone;
  }
}

function eventClockCompact(date, zone) {
  if (typeof calendarClock !== "function") return "";
  return calendarClock(date, zone).replace(/\s/g, "").toLowerCase();
}

function eventReactionTarget(event) {
  return {
    id: event.id,
    chatKind: "calendar_event",
    senderId: event.sender_id,
    reactions: (event && event.reactions) || []
  };
}

function paintEventReactions(event) {
  const host = document.getElementById("event-page-reactions");
  if (!host || !event) return;
  host.replaceChildren();
  const add = document.createElement("button");
  add.type = "button";
  add.className = "announce-add-reaction-btn";
  add.title = "Add Reaction";
  add.textContent = "+";
  add.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    if (typeof openReactionPicker === "function") openReactionPicker(eventReactionTarget(openEventRecord || event), clickEvent.clientX, clickEvent.clientY);
  });
  host.appendChild(add);
  (event.reactions || []).forEach((reaction) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "reaction-pill" + (reaction.me ? " mine" : "");
    const emoji = document.createElement("span");
    emoji.className = "reaction-emoji";
    emoji.textContent = reaction.emoji;
    const count = document.createElement("span");
    count.className = "reaction-count";
    count.textContent = String(reaction.count);
    pill.appendChild(emoji);
    pill.appendChild(count);
    pill.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      if (typeof toggleReaction === "function") toggleReaction(eventReactionTarget(openEventRecord || event), reaction.emoji);
    });
    host.insertBefore(pill, add);
  });
}

function patchEventReactions(eventId, reactions) {
  if (!openEventRecord || Number(openEventRecord.id) !== Number(eventId)) return;
  openEventRecord.reactions = typeof applyReactionMe === "function" ? applyReactionMe(reactions || []) : (reactions || []);
  paintEventReactions(openEventRecord);
}

function rememberEventRow(event) {
  if (!event || !eventStillOpen(event)) return;
  if (!eventInMyGroup(event) && Number(event.sender_id) !== Number(myUserId)) return;
  const index = eventRailRows.findIndex((row) => Number(row.id) === Number(event.id));
  if (index === -1) eventRailRows.push(event);
  else eventRailRows[index] = event;
  paintEventRailRows();
}

function paintEventPage(event) {
  openEventRecord = event;
  const title = document.getElementById("event-page-title");
  if (title) title.textContent = event.name || "Event";
  const rsvp = document.getElementById("event-page-rsvp");
  const mine = (event.rsvps || []).find((row) => Number(row.user_id) === Number(myUserId));
  if (rsvp) {
    rsvp.replaceChildren();
    const off = event.rsvp_enabled === false || !!event.cancelled_at || !eventStillOpen(event);
    [
      ["going", "\u2713 Going"],
      ["maybe", "? Maybe"],
      ["declined", "\u2715 Declined"],
    ].forEach((pair) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = pair[1];
      if (mine && mine.status === pair[0]) button.classList.add("is-on");
      button.disabled = off;
      if (!off) button.addEventListener("click", () => submitCalendarRsvp(event, pair[0]));
      rsvp.appendChild(button);
    });
  }
  const invited = document.getElementById("event-page-invited");
  if (invited) {
    invited.replaceChildren();
    if (mine && mine.invited_by_username && Number(event.sender_id) !== Number(myUserId)) {
      invited.hidden = false;
      invited.appendChild(paintEventFace({ user_id: mine.invited_by_id, username: mine.invited_by_username }));
      const line = document.createElement("span");
      line.append("Invited by ");
      line.appendChild(paintEventName({ user_id: mine.invited_by_id, username: mine.invited_by_username }));
      invited.appendChild(line);
    } else {
      invited.hidden = true;
    }
  }
  const empty = document.getElementById("event-page-discuss-empty");
  const comments = event.comments || [];
  if (empty) empty.hidden = comments.length > 0;
  paintEventComments(comments);
  paintEventMeta(event);
  paintEventReactions(event);
  paintEventPeople(event);
  rememberEventRow(event);
  const replyFace = document.getElementById("event-page-reply-face");
  if (replyFace && typeof paintUserFace === "function") {
    paintUserFace(replyFace, { username: typeof myUsername !== "undefined" ? myUsername : "" }, {
      userId: myUserId,
      name: typeof myUsername !== "undefined" ? myUsername : "",
      circle: true,
    });
  }
}

function paintEventComments(comments) {
  const list = document.getElementById("event-page-comments");
  if (!list) return;
  list.replaceChildren();
  if (!comments.length) return;
  comments.forEach((comment) => {
    const row = document.createElement("div");
    row.className = "event-page-comment";
    row.appendChild(paintEventFace(comment));
    const body = document.createElement("div");
    body.className = "event-page-comment-body";
    const top = document.createElement("div");
    top.className = "event-page-comment-top";
    top.appendChild(paintEventName(comment));
    const ago = document.createElement("span");
    ago.className = "event-page-ago";
    ago.textContent = eventAgo(comment.created_at);
    top.appendChild(ago);
    const text = document.createElement("div");
    text.className = "event-page-comment-text";
    text.textContent = comment.content || "";
    body.appendChild(top);
    body.appendChild(text);
    row.appendChild(body);
    list.appendChild(row);
  });
}

function eventMetaIcon(kind) {
  const slot = document.createElement("span");
  slot.className = "event-page-icon";
  if (typeof calendarInfoIcon === "function" && (kind === "clock" || kind === "people")) {
    slot.appendChild(calendarInfoIcon(kind === "people" ? "people" : "clock"));
    return slot;
  }
  slot.textContent = kind === "clock" ? "\u23F0" : kind === "note" ? "\u2261" : kind === "chat" ? "\u{1F4AC}" : "\u2022";
  return slot;
}

function paintEventMeta(event) {
  const meta = document.getElementById("event-page-meta");
  if (!meta) return;
  meta.replaceChildren();
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const server = typeof calendarServerZone === "function" ? calendarServerZone() : local;
  const start = typeof calendarDate === "function" ? calendarDate(event.starts_at) : null;
  const when = document.createElement("div");
  when.className = "event-page-line";
  when.appendChild(eventMetaIcon("clock"));
  const whenBody = document.createElement("div");
  whenBody.className = "event-page-line-body";
  const whenTop = document.createElement("div");
  whenTop.className = "event-page-line-top";
  const whenText = document.createElement("div");
  if (start) {
    const day = document.createElement("div");
    day.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: local, weekday: "long", month: "short", day: "numeric",
    }).format(start);
    const clock = document.createElement("div");
    clock.className = "event-page-time";
    const end = event.ends_at && typeof calendarDate === "function" ? calendarDate(event.ends_at) : null;
    clock.textContent = eventClockCompact(start, local) + (end ? " \u2013 " + eventClockCompact(end, local) : "") + " " + eventZoneShort(local);
    whenText.appendChild(day);
    whenText.appendChild(clock);
    if (eventClockCompact(start, local) !== eventClockCompact(start, server)) {
      const alt = document.createElement("div");
      alt.className = "event-page-time";
      alt.textContent = eventClockCompact(start, server) + (end ? " \u2013 " + eventClockCompact(end, server) : "") + " " + eventZoneShort(server);
      whenText.appendChild(alt);
    }
  }
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "event-page-menu";
  menu.textContent = "\u22EF";
  menu.title = "Event options";
  menu.addEventListener("click", () => {
    if (typeof openCalendarInfoMenu === "function") openCalendarInfoMenu(menu, event);
  });
  whenTop.appendChild(whenText);
  whenTop.appendChild(menu);
  whenBody.appendChild(whenTop);
  when.appendChild(whenBody);
  const by = document.createElement("div");
  by.className = "event-page-line";
  by.appendChild(eventMetaIcon("people"));
  const byBody = document.createElement("div");
  byBody.className = "event-page-by";
  byBody.append("Created by ");
  byBody.appendChild(paintEventFace({ user_id: event.sender_id, username: event.sender_username }));
  byBody.appendChild(paintEventName({ user_id: event.sender_id, username: event.sender_username }));
  by.appendChild(byBody);
  const note = document.createElement("div");
  note.className = "event-page-line";
  note.appendChild(eventMetaIcon("note"));
  const noteText = document.createElement("div");
  noteText.className = "event-page-note";
  const description = (event.description || "").trim();
  noteText.textContent = description || "No description";
  if (!description) noteText.classList.add("is-empty");
  note.appendChild(noteText);
  const ago = document.createElement("div");
  ago.className = "event-page-ago";
  const created = eventAgo(event.created_at);
  ago.textContent = !created || created === "Just now" ? "Created just now" : "Created " + created;
  const foot = document.createElement("div");
  foot.className = "event-page-foot";
  const countWrap = document.createElement("div");
  countWrap.className = "event-page-by";
  countWrap.appendChild(eventMetaIcon("chat"));
  const total = (event.comments || []).length;
  const count = document.createElement("span");
  count.textContent = total === 1 ? "1 comment" : total + " comments";
  countWrap.appendChild(count);
  const share = document.createElement("button");
  share.type = "button";
  share.className = "event-page-share";
  share.disabled = true;
  share.textContent = "Share";
  foot.appendChild(countWrap);
  foot.appendChild(share);
  meta.appendChild(when);
  meta.appendChild(by);
  meta.appendChild(note);
  meta.appendChild(ago);
  meta.appendChild(foot);
}

function paintEventPeople(event) {
  const counts = document.getElementById("event-page-count-line");
  const attend = document.getElementById("event-page-attend");
  const host = document.getElementById("event-page-people");
  const note = document.getElementById("event-page-invite-note");
  const rows = event.rsvps || [];
  const tally = (status) => rows.filter((row) => row.status === status).length;
  if (counts) {
    counts.textContent = tally("going") + " going \u00B7 " + tally("maybe") + " maybe \u00B7 " + tally("invited") + " invited \u00B7 " + tally("waitlisted") + " waiting";
  }
  if (attend) {
    attend.textContent = tally("going") ? "" : "Nobody is attending \"" + (event.name || "this event") + "\" yet.";
  }
  if (host) {
    host.replaceChildren();
    rows.filter((row) => EVENT_GROUP[row.status]).forEach((person) => {
      const row = document.createElement("div");
      row.className = "event-page-person";
      row.appendChild(paintEventFace(person));
      row.appendChild(paintEventName(person));
      if (Number(event.sender_id) === Number(myUserId) && Number(person.user_id) !== Number(myUserId)) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "event-page-remove";
        remove.title = "Remove";
        remove.textContent = "\u00d7";
        remove.addEventListener("click", () => removeEventMember(event, person));
        row.appendChild(remove);
      }
      host.appendChild(row);
    });
  }
  if (note) {
    const members = typeof memberList !== "undefined" && Array.isArray(memberList) ? memberList : [];
    const inside = new Set(rows.filter((row) => EVENT_GROUP[row.status]).map((row) => Number(row.user_id)));
    const pending = members.filter((member) => !inside.has(Number(member.id || member.user_id)));
    note.textContent = members.length && !pending.length ? "All members invited" : "";
  }
}

async function postEventComment() {
  if (!openEventId) return;
  const input = document.getElementById("event-page-input");
  const content = input ? input.value.trim() : "";
  if (!content) return;
  const response = await fetch(`https://${serverAddress}/calendar_event_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: openEventId, content }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not post that comment.");
    return;
  }
  if (input) input.value = "";
  await reloadOpenEventPage(openEventId);
}

async function inviteEventMember() {
  if (!openEventId) return;
  const input = document.getElementById("event-page-invite-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  const member = eventMemberByName(name);
  if (!member) {
    window.alert("That member is not in this server.");
    return;
  }
  const response = await fetch(`https://${serverAddress}/calendar_event_invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: openEventId, user_id: Number(member.id || member.user_id) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not invite that member.");
    return;
  }
  if (input) input.value = "";
  if (typeof refreshEventRows === "function") refreshEventRows();
  await reloadOpenEventPage(openEventId);
}

async function removeEventMember(event, person) {
  if (!event || !person) return;
  if (!window.confirm("Remove " + (person.username || "this member") + " from this event?")) return;
  const response = await fetch(`https://${serverAddress}/calendar_event_remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: event.id, user_id: person.user_id }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not remove that member.");
    return;
  }
  if (typeof refreshEventRows === "function") refreshEventRows();
  if (Number(person.user_id) === Number(myUserId)) {
    closeEventPageIf(event.id);
    return;
  }
  await reloadOpenEventPage(event.id);
}

const eventPagePost = document.getElementById("event-page-post");
if (eventPagePost) eventPagePost.addEventListener("click", () => postEventComment());
const eventPageInvite = document.getElementById("event-page-invite");
if (eventPageInvite) eventPageInvite.addEventListener("click", () => inviteEventMember());
const eventPageBack = document.getElementById("event-page-back");
if (eventPageBack) eventPageBack.addEventListener("click", () => leaveEventPage());
const eventPageSee = document.getElementById("event-page-see-all");
if (eventPageSee) {
  eventPageSee.addEventListener("click", () => {
    const people = document.getElementById("event-page-people");
    if (people) people.hidden = !people.hidden;
  });
}
