const CALENDAR_COLORS = [14910017, 3900150, 11027223, 2278750, 16344086, 15680580, 440276, 15472921];

let currentCalendarEvents = [];
let calendarYear = 2026;
let calendarMonth = 0;
let calendarView = "month";
let calendarZone = "server";
let calendarEditingId = null;
let calendarColor = CALENDAR_COLORS[0];
let calendarRoles = [];
let calendarMembers = [];
let calendarRoleIds = [];
let calendarInviteIds = [];
let calendarOccurrence = "";
let calendarInfoItem = null;

function canCreateEvents() {
  return typeof channelPerm === "function" && channelPerm("create_events");
}

function canEditCalendarEvent(event) {
  if (!event) return false;
  if (Number(event.sender_id) === Number(myUserId)) return true;
  return typeof channelPerm === "function" && channelPerm("manage_events");
}

function canDeleteCalendarEvent(event) {
  if (!event) return false;
  if (Number(event.sender_id) === Number(myUserId)) return true;
  return typeof channelPerm === "function" && channelPerm("remove_events");
}

function calendarServerZone() {
  const zone = currentServerData && currentServerData.timezone;
  return zone || "UTC";
}

function calendarActiveZone() {
  if (calendarZone === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return calendarServerZone();
}

function calendarZoneParts(date, timeZone) {
  const bag = { year: "1970", month: "01", day: "01", hour: "00", minute: "00" };
  new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).forEach((part) => {
    if (Object.prototype.hasOwnProperty.call(bag, part.type)) bag[part.type] = part.value;
  });
  if (bag.hour === "24") bag.hour = "00";
  return bag;
}

function calendarDate(stamp) {
  if (!stamp) return new Date();
  if (typeof parseUtcTimestamp === "function") return parseUtcTimestamp(stamp);
  return new Date(stamp);
}

function calendarKeyFromParts(parts) {
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function calendarEventWhen(event) {
  return calendarDate(event.occurs_at || event.starts_at);
}

function calendarEventKey(event) {
  return calendarKeyFromParts(calendarZoneParts(calendarEventWhen(event), calendarActiveZone()));
}

function calendarCellKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function calendarAbbrev(timeZone) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", timeZoneName: "short" })
      .formatToParts(new Date())
      .find((row) => row.type === "timeZoneName");
    return (part && part.value) || timeZone || "UTC";
  } catch (err) {
    return "UTC";
  }
}

function calendarShortTime(date) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: calendarActiveZone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return text.replace(" AM", "a").replace(" PM", "p").replace(/\s/g, "");
}

function calendarLongWhen(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: calendarActiveZone(),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function calendarInputToDate(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return null;
  const want = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let utc = want;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = calendarZoneParts(new Date(utc), timeZone);
    const got = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    if (got === want) break;
    utc += want - got;
  }
  return new Date(utc);
}

function calendarDateToInput(date) {
  const parts = calendarZoneParts(date, calendarActiveZone());
  return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":" + parts.minute;
}

function calendarMinute(date) {
  return date.toISOString().slice(0, 16) + ":00Z";
}

function calendarShiftParts(year, month, day, kind) {
  if (kind === "everyMonth") {
    const next = new Date(Date.UTC(year, month, 1));
    const yy = next.getUTCFullYear();
    const mm = next.getUTCMonth();
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return { y: yy, m: mm + 1, d: Math.min(day, last) };
  }
  const extra = kind === "everyWeek" ? 7 : 1;
  const next = new Date(Date.UTC(year, month - 1, day + extra));
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

function calendarStepDate(date, kind) {
  const zone = calendarServerZone();
  const parts = calendarZoneParts(date, zone);
  const shifted = calendarShiftParts(Number(parts.year), Number(parts.month), Number(parts.day), kind);
  const mm = String(shifted.m).padStart(2, "0");
  const dd = String(shifted.d).padStart(2, "0");
  return calendarInputToDate(shifted.y + "-" + mm + "-" + dd + "T" + parts.hour + ":" + parts.minute, zone);
}

function calendarExpand(event, from, until) {
  const kind = event.repeat_kind || "once";
  const start = calendarDate(event.starts_at);
  const cap = new Date(start.getTime() + 366 * 24 * 60 * 60 * 1000);
  const stop = until < cap ? until : cap;
  const found = [];
  let cursor = start;
  let guard = 0;
  while (cursor && cursor < stop && guard < 400) {
    if (cursor >= from) found.push(new Date(cursor));
    if (kind === "once") break;
    const next = calendarStepDate(cursor, kind);
    if (!next || next.getTime() <= cursor.getTime()) break;
    cursor = next;
    guard += 1;
  }
  return found;
}

function calendarInstance(event, when) {
  return Object.assign({}, event, { occurs_at: calendarMinute(when) });
}

function calendarHex(color) {
  return "#" + Number(color || CALENDAR_COLORS[0]).toString(16).padStart(6, "0");
}

function applyCalendarEvent(event) {
  if (!event || Number(event.channel_id) !== Number(currentChannelId)) return;
  const index = currentCalendarEvents.findIndex((row) => Number(row.id) === Number(event.id));
  if (index === -1) currentCalendarEvents.push(event);
  else currentCalendarEvents[index] = event;
  currentCalendarEvents.sort((a, b) => calendarDate(a.starts_at) - calendarDate(b.starts_at));
  renderCalendar();
  if (Number(calendarEditingId) === Number(event.id)) {
    const fresh = currentCalendarEvents.find((row) => Number(row.id) === Number(event.id));
    if (fresh) paintCalendarRsvp(Object.assign({}, fresh, { occurs_at: calendarOccurrence || fresh.starts_at }));
  }
  if (calendarInfoItem && Number(calendarInfoItem.id) === Number(event.id)) {
    const fresh = currentCalendarEvents.find((row) => Number(row.id) === Number(event.id));
    if (fresh) openCalendarInfo(Object.assign({}, fresh, { occurs_at: calendarInfoItem.occurs_at || fresh.starts_at }));
  }
}

function removeCalendarEvent(eventId) {
  currentCalendarEvents = currentCalendarEvents.filter((row) => Number(row.id) !== Number(eventId));
  if (Number(calendarEditingId) === Number(eventId)) closeCalendarEvent();
  if (calendarInfoItem && Number(calendarInfoItem.id) === Number(eventId)) closeCalendarInfo();
  renderCalendar();
}

async function loadCalendar(channelId) {
  closeCalendarEvent();
  closeCalendarInfo();
  currentCalendarEvents = [];
  calendarView = "month";
  calendarZone = "server";
  const today = calendarZoneParts(new Date(), calendarActiveZone());
  calendarYear = Number(today.year);
  calendarMonth = Number(today.month) - 1;
  renderCalendar();
  const response = await fetch(`https://${serverAddress}/get_calendar/${channelId}`, { credentials: "include" });
  if (!response.ok) return;
  const data = await response.json();
  if (Number(currentChannelId) !== Number(channelId)) return;
  currentCalendarEvents = data.events || [];
  calendarRoles = data.roles || [];
  calendarMembers = data.members || [];
  renderCalendar();
}

function renderCalendar() {
  const serverPill = document.getElementById("calendar-zone-server");
  const localPill = document.getElementById("calendar-zone-local");
  const monthPill = document.getElementById("calendar-view-month");
  const upcomingPill = document.getElementById("calendar-view-upcoming");
  const label = document.getElementById("calendar-month-label");
  if (serverPill) {
    serverPill.textContent = calendarAbbrev(calendarServerZone());
    serverPill.classList.toggle("is-on", calendarZone === "server");
  }
  if (localPill) {
    localPill.textContent = calendarAbbrev(Intl.DateTimeFormat().resolvedOptions().timeZone);
    localPill.classList.toggle("is-on", calendarZone === "local");
  }
  if (monthPill) monthPill.classList.toggle("is-on", calendarView === "month");
  if (upcomingPill) upcomingPill.classList.toggle("is-on", calendarView === "upcoming");
  if (label) {
    label.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(calendarYear, calendarMonth, 1));
  }
  const addBtn = document.getElementById("calendar-add");
  if (addBtn) addBtn.hidden = !canCreateEvents();
  const grid = document.getElementById("calendar-grid");
  const upcoming = document.getElementById("calendar-upcoming");
  const showUpcoming = calendarView === "upcoming";
  if (grid) grid.hidden = showUpcoming;
  if (upcoming) upcoming.hidden = !showUpcoming;
  if (showUpcoming) paintCalendarUpcoming();
  else paintCalendarMonth();
}

function paintCalendarMonth() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.replaceChildren();
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name) => {
    const head = document.createElement("div");
    head.className = "calendar-dow";
    head.textContent = name;
    grid.appendChild(head);
  });
  const byDay = {};
  const first = new Date(calendarYear, calendarMonth, 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  const windowStart = new Date(gridStart.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(gridStart.getTime() + 43 * 24 * 60 * 60 * 1000);
  currentCalendarEvents.forEach((event) => {
    calendarExpand(event, windowStart, windowEnd).forEach((when) => {
      const instance = calendarInstance(event, when);
      const key = calendarEventKey(instance);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(instance);
    });
  });
  const todayKey = calendarKeyFromParts(calendarZoneParts(new Date(), calendarActiveZone()));
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const key = calendarCellKey(day);
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (day.getMonth() !== calendarMonth) cell.classList.add("is-outside");
    if (key === todayKey) cell.classList.add("is-today");
    const top = document.createElement("div");
    top.className = "calendar-day-top";
    const number = document.createElement("div");
    number.className = "calendar-day-num";
    number.textContent = String(day.getDate());
    top.appendChild(number);
    if (canCreateEvents()) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "calendar-day-add";
      add.textContent = "+";
      add.title = "Add event";
      add.addEventListener("click", (event) => {
        event.stopPropagation();
        openCalendarEvent(null, key + "T12:00");
      });
      top.appendChild(add);
    }
    cell.appendChild(top);
    (byDay[key] || []).forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "calendar-chip" + (item.cancelled_at ? " is-cancelled" : "");
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.style.background = calendarHex(item.color);
      const when = document.createElement("span");
      when.className = "calendar-chip-time";
      when.textContent = calendarShortTime(calendarEventWhen(item));
      const name = document.createElement("span");
      name.className = "calendar-chip-name";
      name.textContent = item.name || "Event";
      row.appendChild(dot);
      row.appendChild(when);
      row.appendChild(name);
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        openCalendarInfo(item);
      });
      cell.appendChild(row);
    });
    grid.appendChild(cell);
  }
}

function paintCalendarUpcoming() {
  const host = document.getElementById("calendar-upcoming");
  if (!host) return;
  host.replaceChildren();
  const startOfToday = calendarInputToDate(
    calendarKeyFromParts(calendarZoneParts(new Date(), calendarActiveZone())) + "T00:00",
    calendarActiveZone()
  );
  const until = new Date(startOfToday.getTime() + 120 * 24 * 60 * 60 * 1000);
  const rows = [];
  currentCalendarEvents.forEach((event) => {
    calendarExpand(event, startOfToday, until).forEach((when) => rows.push(calendarInstance(event, when)));
  });
  rows.sort((a, b) => calendarEventWhen(a) - calendarEventWhen(b));
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-upcoming-empty";
    empty.textContent = "No upcoming events.";
    host.appendChild(empty);
    return;
  }
  rows.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "calendar-upcoming-row";
    const dot = document.createElement("span");
    dot.className = "calendar-dot";
    dot.style.background = calendarHex(item.color);
    const text = document.createElement("div");
    text.className = "calendar-upcoming-text";
    const name = document.createElement("div");
    name.className = "calendar-upcoming-name";
    name.textContent = item.name || "Event";
    const when = document.createElement("div");
    when.className = "calendar-upcoming-when";
    when.textContent = (item.cancelled_at ? "Cancelled · " : "") + calendarLongWhen(calendarEventWhen(item));
    text.appendChild(name);
    text.appendChild(when);
    row.appendChild(dot);
    row.appendChild(text);
    row.addEventListener("click", () => openCalendarInfo(item));
    host.appendChild(row);
  });
}

function paintCalendarColors() {
  const host = document.getElementById("calendar-colors");
  if (!host) return;
  host.replaceChildren();
  CALENDAR_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-swatch" + (color === calendarColor ? " is-on" : "");
    button.style.background = calendarHex(color);
    button.addEventListener("click", () => {
      calendarColor = color;
      paintCalendarColors();
    });
    host.appendChild(button);
  });
}

function calendarSameMinute(left, right) {
  return String(left || "").slice(0, 16) === String(right || "").slice(0, 16);
}

function paintCalendarRoles() {
  const host = document.getElementById("calendar-roles");
  if (!host) return;
  host.replaceChildren();
  if (!calendarRoles.length) {
    const empty = document.createElement("div");
    empty.className = "calendar-upcoming-when";
    empty.textContent = "Any role";
    host.appendChild(empty);
    return;
  }
  calendarRoles.forEach((role) => {
    const row = document.createElement("div");
    row.className = "calendar-option";
    const name = document.createElement("span");
    name.className = "calendar-option-name";
    name.textContent = role.name || "Role";
    const label = document.createElement("label");
    label.className = "toggle-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = calendarRoleIds.includes(Number(role.id));
    input.addEventListener("change", () => {
      const id = Number(role.id);
      if (input.checked) calendarRoleIds.push(id);
      else calendarRoleIds = calendarRoleIds.filter((roleId) => roleId !== id);
    });
    const track = document.createElement("span");
    track.className = "toggle-track";
    const thumb = document.createElement("span");
    thumb.className = "toggle-thumb";
    track.appendChild(thumb);
    label.appendChild(input);
    label.appendChild(track);
    row.appendChild(name);
    row.appendChild(label);
    host.appendChild(row);
  });
}

function paintCalendarInvites() {
  const host = document.getElementById("calendar-invites");
  if (!host) return;
  host.replaceChildren();
  calendarInviteIds.forEach((userId) => {
    const member = calendarMembers.find((row) => Number(row.id) === Number(userId));
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "calendar-invite-chip";
    chip.textContent = (member && member.username) || "Member";
    chip.title = "Remove invite";
    chip.addEventListener("click", () => {
      calendarInviteIds = calendarInviteIds.filter((id) => Number(id) !== Number(userId));
      paintCalendarInvites();
    });
    host.appendChild(chip);
  });
}

function paintCalendarRsvp(event) {
  const host = document.getElementById("calendar-rsvp");
  if (!host) return;
  host.replaceChildren();
  if (!event || event.rsvp_enabled === false) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const when = event.occurs_at || event.starts_at;
  const rows = (event.rsvps || []).filter((row) => calendarSameMinute(row.occurrence_at, when) && row.status !== "invited");
  const counts = { going: 0, maybe: 0, declined: 0, waitlisted: 0 };
  let mine = "";
  rows.forEach((row) => {
    if (counts[row.status] != null) counts[row.status] += 1;
    if (Number(row.user_id) === Number(myUserId)) mine = row.status;
  });
  const bar = document.createElement("div");
  bar.className = "calendar-rsvp-bar";
  [["going", "Going"], ["maybe", "Maybe"], ["declined", "Declined"]].forEach((pair) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-btn" + (mine === pair[0] ? " is-on" : "");
    button.textContent = pair[1];
    button.disabled = !!event.cancelled_at;
    button.addEventListener("click", () => setCalendarRsvp(pair[0]));
    bar.appendChild(button);
  });
  host.appendChild(bar);
  const summary = document.createElement("div");
  summary.className = "calendar-rsvp-summary";
  summary.textContent = counts.going + " going · " + counts.maybe + " maybe · " + counts.declined + " declined · " + counts.waitlisted + " waitlist";
  host.appendChild(summary);
}

function openCalendarEvent(event, inputValue) {
  if (event && !canEditCalendarEvent(event)) {
    openCalendarInfo(event);
    return;
  }
  if (!event && !canCreateEvents()) return;
  closeCalendarInfo();
  calendarEditingId = event ? event.id : null;
  calendarOccurrence = event ? (event.occurs_at || event.starts_at || "") : "";
  calendarColor = event ? (CALENDAR_COLORS.includes(Number(event.color)) ? Number(event.color) : CALENDAR_COLORS[0]) : CALENDAR_COLORS[0];
  calendarRoleIds = event && Array.isArray(event.role_ids) ? event.role_ids.map(Number) : [];
  calendarInviteIds = event ? (event.rsvps || []).filter((row) => row.status === "invited").map((row) => Number(row.user_id)) : [];
  const overlay = document.getElementById("calendar-event-overlay");
  const title = document.getElementById("calendar-event-heading");
  const name = document.getElementById("calendar-event-name");
  const start = document.getElementById("calendar-event-start");
  const repeat = document.getElementById("calendar-repeat");
  const description = document.getElementById("calendar-description");
  const priv = document.getElementById("calendar-private");
  const rsvpOn = document.getElementById("calendar-rsvp-enabled");
  const limit = document.getElementById("calendar-limit");
  const remove = document.getElementById("calendar-event-delete");
  const cancel = document.getElementById("calendar-event-cancel");
  if (title) title.textContent = "Event";
  if (name) name.value = event ? (event.name || "") : "";
  if (start) {
    if (event) start.value = calendarDateToInput(calendarDate(event.starts_at));
    else start.value = inputValue || calendarDateToInput(new Date());
  }
  if (repeat) repeat.value = (event && event.repeat_kind) || "once";
  if (description) description.value = event ? (event.description || "") : "";
  if (priv) priv.checked = !!(event && event.is_private);
  if (rsvpOn) rsvpOn.checked = event ? event.rsvp_enabled !== false : true;
  if (limit) limit.value = event && event.rsvp_limit ? String(event.rsvp_limit) : "";
  if (remove) remove.hidden = !event || !canDeleteCalendarEvent(event);
  if (cancel) {
    cancel.hidden = !event || !canEditCalendarEvent(event);
    cancel.textContent = event && event.cancelled_at ? "Restore event" : "Cancel event";
  }
  paintCalendarColors();
  paintCalendarRoles();
  paintCalendarInvites();
  paintCalendarRsvp(event);
  if (overlay) overlay.hidden = false;
  if (name) name.focus();
}

function closeCalendarEvent() {
  calendarEditingId = null;
  const overlay = document.getElementById("calendar-event-overlay");
  if (overlay) overlay.hidden = true;
}

async function saveCalendarEvent() {
  if (!currentChannelId) return;
  const nameInput = document.getElementById("calendar-event-name");
  const startInput = document.getElementById("calendar-event-start");
  const name = nameInput ? nameInput.value.trim() : "";
  const when = calendarInputToDate(startInput && startInput.value, calendarActiveZone());
  if (!name || !when) {
    window.alert("Name and start time are required.");
    return;
  }
  const repeat = document.getElementById("calendar-repeat");
  const description = document.getElementById("calendar-description");
  const priv = document.getElementById("calendar-private");
  const rsvpOn = document.getElementById("calendar-rsvp-enabled");
  const limitInput = document.getElementById("calendar-limit");
  const limitValue = limitInput && limitInput.value.trim() ? Number(limitInput.value) : null;
  const fields = {
    name,
    starts_at: when.toISOString(),
    color: calendarColor,
    description: description ? description.value : "",
    repeat_kind: repeat ? repeat.value : "once",
    is_private: !!(priv && priv.checked),
    rsvp_enabled: !!(rsvpOn && rsvpOn.checked),
    rsvp_limit: Number.isFinite(limitValue) ? limitValue : null,
    role_ids: calendarRoleIds.slice(),
    invite_ids: calendarInviteIds.slice(),
  };
  const editing = calendarEditingId;
  const path = editing ? "edit_calendar_event" : "calendar_event";
  const body = editing ? Object.assign({ event_id: editing }, fields) : Object.assign({ channel_id: currentChannelId }, fields);
  const response = await fetch(`https://${serverAddress}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that event.");
    return;
  }
  applyCalendarEvent(data);
  closeCalendarEvent();
}

async function deleteCalendarEvent(eventId) {
  const id = eventId || calendarEditingId;
  if (!id) return;
  const response = await fetch(`https://${serverAddress}/delete_calendar_event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: id }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not delete that event.");
    return;
  }
  removeCalendarEvent(data.event_id || id);
}

async function setCalendarRsvp(status) {
  if (!calendarEditingId || !calendarOccurrence) return;
  const response = await fetch(`https://${serverAddress}/calendar_event_rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: calendarEditingId, occurrence_at: calendarOccurrence, status }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that RSVP.");
    return;
  }
  applyCalendarEvent(data);
  const fresh = currentCalendarEvents.find((row) => Number(row.id) === Number(data.id));
  if (fresh) paintCalendarRsvp(Object.assign({}, fresh, { occurs_at: calendarOccurrence }));
}

async function cancelCalendarEvent(eventId) {
  const id = eventId || calendarEditingId;
  if (!id) return;
  const response = await fetch(`https://${serverAddress}/cancel_calendar_event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event_id: id }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not cancel that event.");
    return;
  }
  applyCalendarEvent(data);
  closeCalendarEvent();
  closeCalendarInfo();
}

function addCalendarInvite() {
  const input = document.getElementById("calendar-invite-input");
  const query = input ? input.value.trim().toLowerCase() : "";
  if (!query) return;
  const member = calendarMembers.find((row) => String(row.username || "").toLowerCase() === query);
  if (!member) {
    window.alert("That member is not in this server.");
    return;
  }
  if (!calendarInviteIds.includes(Number(member.id))) calendarInviteIds.push(Number(member.id));
  if (input) input.value = "";
  paintCalendarInvites();
}

function calendarClock(date, zone) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: zone || "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toLowerCase().replace(" ", "");
  return text + " " + calendarAbbrev(zone);
}

function calendarWeekday(date, zone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone || "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function calendarInfoIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  if (kind === "clock") {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "8");
    const hand = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hand.setAttribute("d", "M12 8v5l3 2");
    svg.appendChild(circle);
    svg.appendChild(hand);
  } else {
    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("cx", "9");
    head.setAttribute("cy", "8");
    head.setAttribute("r", "3");
    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.setAttribute("d", "M4 19v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1");
    const extra = document.createElementNS("http://www.w3.org/2000/svg", "path");
    extra.setAttribute("d", "M16 11a3 3 0 1 0-2-5M17 19v-1a3.5 3.5 0 0 0-2.5-3.4");
    svg.appendChild(head);
    svg.appendChild(body);
    svg.appendChild(extra);
  }
  return svg;
}

function closeCalendarInfo() {
  calendarInfoItem = null;
  const overlay = document.getElementById("calendar-info-overlay");
  if (overlay) overlay.hidden = true;
}

function openCalendarInfoMenu(anchor, item) {
  if (typeof openContextMenu !== "function" || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const options = [];
  if (canEditCalendarEvent(item)) {
    options.push({ label: "Edit", onSelect: () => openCalendarEvent(item) });
    options.push({
      label: item.cancelled_at ? "Restore event" : "Cancel event",
      onSelect: () => cancelCalendarEvent(item.id),
    });
  }
  if (canDeleteCalendarEvent(item)) {
    options.push({ label: "Delete", danger: true, onSelect: () => deleteCalendarEvent(item.id) });
  }
  if (!options.length) return;
  openContextMenu(rect.left, rect.bottom + 4, null, options);
}

function openCalendarInfo(item) {
  if (!item) return;
  calendarInfoItem = item;
  const overlay = document.getElementById("calendar-info-overlay");
  const title = document.getElementById("calendar-info-title");
  const dot = document.getElementById("calendar-info-dot");
  const body = document.getElementById("calendar-info-body");
  const menu = document.getElementById("calendar-info-menu");
  if (title) {
    title.textContent = item.name || "Event";
    title.classList.toggle("is-cancelled", !!item.cancelled_at);
  }
  if (dot) dot.style.background = calendarHex(item.color);
  const canMenu = canEditCalendarEvent(item) || canDeleteCalendarEvent(item);
  if (menu) menu.hidden = !canMenu;
  if (!body) {
    if (overlay) overlay.hidden = false;
    return;
  }
  body.replaceChildren();
  const when = calendarEventWhen(item);
  const zone = calendarActiveZone();
  const other = calendarZone === "local" ? calendarServerZone() : (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const whenRow = document.createElement("div");
  whenRow.className = "calendar-info-row";
  const clock = document.createElement("span");
  clock.className = "calendar-info-icon";
  clock.appendChild(calendarInfoIcon("clock"));
  const whenText = document.createElement("div");
  const dayLine = document.createElement("div");
  dayLine.textContent = (item.cancelled_at ? "Cancelled · " : "") + calendarWeekday(when, zone);
  const timeLine = document.createElement("div");
  timeLine.className = "calendar-info-time";
  timeLine.textContent = calendarClock(when, zone);
  whenText.appendChild(dayLine);
  whenText.appendChild(timeLine);
  if (calendarClock(when, zone) !== calendarClock(when, other)) {
    const alt = document.createElement("div");
    alt.className = "calendar-info-alt";
    alt.textContent = calendarClock(when, other);
    whenText.appendChild(alt);
  }
  whenRow.appendChild(clock);
  whenRow.appendChild(whenText);
  body.appendChild(whenRow);
  if (item.description) {
    const note = document.createElement("div");
    note.className = "calendar-info-note";
    note.textContent = item.description;
    body.appendChild(note);
  }
  const going = (item.rsvps || []).filter((row) => calendarSameMinute(row.occurrence_at, item.occurs_at || item.starts_at) && row.status === "going");
  const goingRow = document.createElement("div");
  goingRow.className = "calendar-info-row";
  const peopleIcon = document.createElement("span");
  peopleIcon.className = "calendar-info-icon";
  peopleIcon.appendChild(calendarInfoIcon("people"));
  const goingText = document.createElement("div");
  goingText.className = "calendar-info-going";
  const count = document.createElement("div");
  count.textContent = going.length === 1 ? "1 is going" : (going.length ? going.length + " are going" : "No one is going");
  const faces = document.createElement("div");
  faces.className = "calendar-info-faces";
  going.slice(0, 6).forEach((row) => {
    const face = document.createElement("button");
    face.type = "button";
    face.className = "calendar-info-face";
    face.title = row.username || "Member";
    if (typeof paintUserFace === "function") paintUserFace(face, { username: row.username }, { userId: row.user_id, name: row.username, circle: true });
    face.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof openMiniProfile === "function") openMiniProfile(row.user_id, face);
    });
    faces.appendChild(face);
  });
  goingText.appendChild(count);
  if (going.length) goingText.appendChild(faces);
  goingRow.appendChild(peopleIcon);
  goingRow.appendChild(goingText);
  body.appendChild(goingRow);
  const authorRow = document.createElement("div");
  authorRow.className = "calendar-info-row";
  const authorFace = document.createElement("button");
  authorFace.type = "button";
  authorFace.className = "calendar-info-face";
  const authorName = item.sender_username || "Someone";
  if (typeof paintUserFace === "function") paintUserFace(authorFace, { username: authorName }, { userId: item.sender_id, name: authorName, circle: true });
  authorFace.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(item.sender_id, authorFace);
  });
  const authorText = document.createElement("div");
  authorText.className = "calendar-info-author";
  const lead = document.createElement("span");
  lead.textContent = "Created by ";
  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "calendar-info-name";
  nameBtn.textContent = authorName;
  nameBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(item.sender_id, nameBtn);
  });
  authorText.appendChild(lead);
  authorText.appendChild(nameBtn);
  authorRow.appendChild(authorFace);
  authorRow.appendChild(authorText);
  body.appendChild(authorRow);
  if (overlay) overlay.hidden = false;
}

const calendarPrev = document.getElementById("calendar-prev");
if (calendarPrev) {
  calendarPrev.addEventListener("click", () => {
    const cursor = new Date(calendarYear, calendarMonth - 1, 1);
    calendarYear = cursor.getFullYear();
    calendarMonth = cursor.getMonth();
    renderCalendar();
  });
}
const calendarNext = document.getElementById("calendar-next");
if (calendarNext) {
  calendarNext.addEventListener("click", () => {
    const cursor = new Date(calendarYear, calendarMonth + 1, 1);
    calendarYear = cursor.getFullYear();
    calendarMonth = cursor.getMonth();
    renderCalendar();
  });
}
const calendarAdd = document.getElementById("calendar-add");
if (calendarAdd) calendarAdd.addEventListener("click", () => openCalendarEvent(null));
const calendarZoneServer = document.getElementById("calendar-zone-server");
if (calendarZoneServer) {
  calendarZoneServer.addEventListener("click", () => {
    calendarZone = "server";
    renderCalendar();
  });
}
const calendarZoneLocal = document.getElementById("calendar-zone-local");
if (calendarZoneLocal) {
  calendarZoneLocal.addEventListener("click", () => {
    calendarZone = "local";
    renderCalendar();
  });
}
const calendarViewMonth = document.getElementById("calendar-view-month");
if (calendarViewMonth) {
  calendarViewMonth.addEventListener("click", () => {
    calendarView = "month";
    renderCalendar();
  });
}
const calendarViewUpcoming = document.getElementById("calendar-view-upcoming");
if (calendarViewUpcoming) {
  calendarViewUpcoming.addEventListener("click", () => {
    calendarView = "upcoming";
    renderCalendar();
  });
}
const calendarEventClose = document.getElementById("calendar-event-close");
if (calendarEventClose) calendarEventClose.addEventListener("click", closeCalendarEvent);
const calendarEventSave = document.getElementById("calendar-event-save");
if (calendarEventSave) calendarEventSave.addEventListener("click", saveCalendarEvent);
const calendarEventDelete = document.getElementById("calendar-event-delete");
if (calendarEventDelete) calendarEventDelete.addEventListener("click", () => deleteCalendarEvent());
const calendarEventCancel = document.getElementById("calendar-event-cancel");
if (calendarEventCancel) calendarEventCancel.addEventListener("click", () => cancelCalendarEvent());
const calendarInviteAdd = document.getElementById("calendar-invite-add");
if (calendarInviteAdd) calendarInviteAdd.addEventListener("click", addCalendarInvite);
const calendarEventOverlay = document.getElementById("calendar-event-overlay");
if (calendarEventOverlay) {
  calendarEventOverlay.addEventListener("click", (event) => {
    if (event.target === calendarEventOverlay) closeCalendarEvent();
  });
}
const calendarInfoMenu = document.getElementById("calendar-info-menu");
if (calendarInfoMenu) {
  calendarInfoMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    if (calendarInfoItem) openCalendarInfoMenu(calendarInfoMenu, calendarInfoItem);
  });
}
const calendarInfoOverlay = document.getElementById("calendar-info-overlay");
if (calendarInfoOverlay) {
  calendarInfoOverlay.addEventListener("click", (event) => {
    if (event.target === calendarInfoOverlay) closeCalendarInfo();
  });
}
