const SCHEDULE_HOUR_PX = 56;
const SCHEDULE_DAYS = 3;

let scheduleAnchor = null;
let scheduleBlocks = [];
let scheduleDrag = null;

function scheduleZoneLabel() {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date());
  const zone = parts.find((part) => part.type === "timeZoneName");
  return (zone && zone.value) || "Local";
}

function scheduleDayStart(date) {
  const day = new Date(date.getTime());
  day.setHours(0, 0, 0, 0);
  return day;
}

function scheduleToday() {
  return scheduleDayStart(new Date());
}

function scheduleAddDays(day, count) {
  const next = new Date(day.getTime());
  next.setDate(next.getDate() + count);
  return next;
}

function scheduleMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function scheduleAtMinutes(day, minutes) {
  const when = scheduleDayStart(day);
  when.setMinutes(minutes);
  return when;
}

function scheduleInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function scheduleClock(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scheduleDayTitle(day) {
  const today = scheduleToday().getTime();
  const stamp = scheduleDayStart(day).getTime();
  if (stamp === today) return "Today";
  if (stamp === scheduleAddDays(scheduleToday(), 1).getTime()) return "Tomorrow";
  return day.toLocaleDateString([], { weekday: "long" });
}

function scheduleDaySub(day) {
  return day.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scheduleVisibleDays() {
  const start = scheduleAnchor || scheduleToday();
  const days = [];
  for (let index = 0; index < SCHEDULE_DAYS; index += 1) days.push(scheduleAddDays(start, index));
  return days;
}

function scheduleColor(block) {
  const role = block && block.name_role;
  if (role && role.color) return role.color;
  return "#3ba55d";
}

function scheduleRank(block) {
  const role = block && block.highest_role;
  if (!role || role.position == null) return 999999;
  return Number(role.position);
}

function hideScheduleChrome() {
  const pins = document.getElementById("channel-pins-btn");
  if (pins && currentChannelType !== "scheduling") pins.style.display = "";
  closeScheduleCard();
}

function closeScheduleCard() {
  const card = document.getElementById("schedule-card");
  if (card) {
    card.hidden = true;
    card.replaceChildren();
  }
}

function scheduleOverlaps(block, start, end) {
  const blockStart = new Date(block.starts_at).getTime();
  const blockEnd = new Date(block.ends_at).getTime();
  return blockStart < end.getTime() && blockEnd > start.getTime();
}

function applyScheduleBlock(block) {
  if (!block || Number(block.channel_id) !== Number(currentChannelId) || currentChannelType !== "scheduling") return;
  scheduleBlocks = scheduleBlocks.filter((row) => Number(row.id) !== Number(block.id));
  scheduleBlocks.push(block);
  paintSchedule();
}

function removeScheduleBlock(blockId) {
  scheduleBlocks = scheduleBlocks.filter((row) => Number(row.id) !== Number(blockId));
  paintSchedule();
}

function paintScheduleHours(sheet) {
  for (let hour = 0; hour < 24; hour += 1) {
    const label = document.createElement("div");
    label.className = "schedule-hour-label";
    label.style.gridColumn = "1";
    label.style.gridRow = String(hour + 1);
    const when = new Date();
    when.setHours(hour, 0, 0, 0);
    label.textContent = when.toLocaleTimeString([], { hour: "numeric" });
    sheet.appendChild(label);
  }
}

function paintScheduleDays() {
  const host = document.getElementById("schedule-days");
  if (!host) return;
  host.replaceChildren();
  scheduleVisibleDays().forEach((day, index) => {
    const cell = document.createElement("div");
    cell.className = "schedule-day-head" + (index % 2 ? " is-alt" : "");
    const title = document.createElement("div");
    title.className = "schedule-day-title";
    title.textContent = scheduleDayTitle(day);
    const sub = document.createElement("div");
    sub.className = "schedule-day-sub";
    sub.textContent = scheduleDaySub(day);
    cell.appendChild(title);
    cell.appendChild(sub);
    host.appendChild(cell);
  });
  const zone = document.getElementById("schedule-zone");
  if (zone) zone.textContent = scheduleZoneLabel();
}

function scheduleDayBlocks(day) {
  const start = scheduleDayStart(day);
  const end = scheduleAddDays(start, 1);
  return scheduleBlocks.filter((block) => scheduleOverlaps(block, start, end));
}

function paintScheduleBoard(sheet) {
  const days = scheduleVisibleDays();
  const nowTop = (scheduleMinutes(new Date()) / 60) * SCHEDULE_HOUR_PX;
  days.forEach((day, index) => {
    const column = document.createElement("div");
    column.className = "schedule-day" + (index % 2 ? " is-alt" : "") + (index === days.length - 1 ? " is-end" : "");
    column.dataset.day = String(index);
    column.style.gridColumn = String(index + 3);
    column.style.gridRow = "1 / -1";
    for (let hour = 0; hour < 24; hour += 1) {
      const slot = document.createElement("div");
      slot.className = "schedule-slot";
      slot.dataset.hour = String(hour);
      column.appendChild(slot);
    }
    scheduleDayBlocks(day).forEach((block) => column.appendChild(scheduleBlockElement(block, day, column)));
    const now = document.createElement("div");
    now.className = "schedule-now";
    now.style.top = nowTop + "px";
    column.appendChild(now);
    sheet.appendChild(column);
  });
}

function scheduleSlot(column, hour) {
  if (!column) return null;
  return column.querySelector('.schedule-slot[data-hour="' + hour + '"]');
}

function scheduleSlotTop(column, hour) {
  const slot = scheduleSlot(column, hour);
  return slot ? slot.offsetTop : hour * SCHEDULE_HOUR_PX;
}

function scheduleBlockElement(block, day, column) {
  const dayStart = scheduleDayStart(day).getTime();
  const dayEnd = scheduleAddDays(day, 1).getTime();
  const start = Math.max(new Date(block.starts_at).getTime(), dayStart);
  const end = Math.min(new Date(block.ends_at).getTime(), dayEnd);
  const topMin = (start - dayStart) / 60000;
  const heightMin = Math.max(30, (end - start) / 60000);
  const ratio = block.x_ratio == null ? 0.5 : Number(block.x_ratio);
  const hourPx = scheduleSlotTop(column, 1) || SCHEDULE_HOUR_PX;
  const wrap = document.createElement("div");
  wrap.className = "schedule-block";
  wrap.style.top = ((topMin / 60) * hourPx) + "px";
  wrap.style.height = ((heightMin / 60) * hourPx) + "px";
  wrap.style.left = (ratio * 100) + "%";
  const stroke = document.createElement("div");
  stroke.className = "schedule-line";
  stroke.style.background = scheduleColor(block);
  wrap.appendChild(stroke);
  const face = document.createElement("button");
  face.type = "button";
  face.className = "avatar-dot schedule-face";
  if (typeof paintUserFace === "function") {
    paintUserFace(face, { id: block.user_id, username: block.username, avatar: block.avatar }, { userId: block.user_id, name: block.username });
  }
  face.addEventListener("pointerdown", (event) => event.stopPropagation());
  face.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(block.user_id, face);
  });
  const cap = document.createElement("span");
  cap.className = "schedule-cap schedule-cap-top";
  const foot = document.createElement("span");
  foot.className = "schedule-cap schedule-cap-foot";
  wrap.appendChild(face);
  wrap.appendChild(cap);
  wrap.appendChild(foot);
  if (Number(block.user_id) === Number(myUserId)) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "schedule-remove";
    remove.textContent = "\u00D7";
    remove.title = "Remove availability";
    remove.addEventListener("pointerdown", (event) => event.stopPropagation());
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      closeScheduleCard();
      deleteScheduleBlock(block.id);
    });
    wrap.appendChild(remove);
  }
  return wrap;
}

function paintSchedule() {
  const sheet = document.getElementById("schedule-sheet");
  paintScheduleDays();
  if (!sheet) return;
  sheet.replaceChildren();
  paintScheduleHours(sheet);
  paintScheduleBoard(sheet);
}

function scheduleScrollToNow() {
  const scroller = document.getElementById("schedule-scroll");
  if (!scroller) return;
  const top = ((scheduleMinutes(new Date()) / 60) * SCHEDULE_HOUR_PX) - scroller.clientHeight * 0.35;
  scroller.scrollTop = Math.max(0, top);
}

function scheduleColumnHour(event, column) {
  const slots = column.querySelectorAll(".schedule-slot");
  const y = event.clientY;
  for (let index = 0; index < slots.length; index += 1) {
    const rect = slots[index].getBoundingClientRect();
    if (y >= rect.top && y < rect.bottom) return Number(slots[index].dataset.hour);
  }
  if (!slots.length) return 0;
  if (y < slots[0].getBoundingClientRect().top) return 0;
  return 23;
}

function scheduleColumnRatio(event, column) {
  const rect = column.getBoundingClientRect();
  if (!rect.width) return 0.5;
  return Math.max(0.08, Math.min(0.92, (event.clientX - rect.left) / rect.width));
}

function scheduleDragSpan(drag) {
  const from = Math.min(drag.startHour, drag.hour);
  const to = Math.min(24, Math.max(drag.startHour, drag.hour) + 1);
  return { from, to };
}

function schedulePointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".schedule-face, .schedule-remove")) return;
  const column = event.target.closest(".schedule-day");
  if (!column) return;
  closeScheduleCard();
  const board = event.currentTarget;
  scheduleDrag = {
    day: Number(column.dataset.day),
    column,
    startHour: scheduleColumnHour(event, column),
    hour: scheduleColumnHour(event, column),
    ratio: scheduleColumnRatio(event, column),
    moved: false,
    pointer: event.pointerId,
    originY: event.clientY,
  };
  board.setPointerCapture(event.pointerId);
  const move = (ev) => {
    if (!scheduleDrag || scheduleDrag.pointer !== ev.pointerId) return;
    if (Math.abs(ev.clientY - scheduleDrag.originY) > 6) scheduleDrag.moved = true;
    scheduleDrag.hour = scheduleColumnHour(ev, scheduleDrag.column);
    paintScheduleGhost();
  };
  const up = (ev) => {
    if (!scheduleDrag || scheduleDrag.pointer !== ev.pointerId) return;
    board.removeEventListener("pointermove", move);
    board.removeEventListener("pointerup", up);
    const drag = scheduleDrag;
    scheduleDrag = null;
    clearScheduleGhost();
    const day = scheduleVisibleDays()[drag.day];
    if (!day) return;
    if (!drag.moved) {
      openScheduleCard(ev, day, drag.startHour);
      return;
    }
    const span = scheduleDragSpan(drag);
    createScheduleBlock(scheduleAtMinutes(day, span.from * 60), scheduleAtMinutes(day, span.to * 60), drag.ratio);
  };
  board.addEventListener("pointermove", move);
  board.addEventListener("pointerup", up);
}

function paintScheduleGhost() {
  clearScheduleGhost();
  if (!scheduleDrag || !scheduleDrag.moved || !scheduleDrag.column) return;
  const span = scheduleDragSpan(scheduleDrag);
  const top = scheduleSlotTop(scheduleDrag.column, span.from);
  const bottom = span.to >= 24 ? scheduleSlotTop(scheduleDrag.column, 23) + (scheduleSlotTop(scheduleDrag.column, 1) || SCHEDULE_HOUR_PX) : scheduleSlotTop(scheduleDrag.column, span.to);
  const ghost = document.createElement("div");
  ghost.className = "schedule-block is-ghost";
  ghost.style.top = top + "px";
  ghost.style.height = Math.max(bottom - top, scheduleSlotTop(scheduleDrag.column, 1) || SCHEDULE_HOUR_PX) + "px";
  ghost.style.left = (scheduleDrag.ratio * 100) + "%";
  scheduleDrag.column.appendChild(ghost);
}

function clearScheduleGhost() {
  document.querySelectorAll(".schedule-block.is-ghost").forEach((node) => node.remove());
}

function openScheduleCard(event, day, hour) {
  const start = scheduleAtMinutes(day, hour * 60);
  const end = scheduleAtMinutes(day, (hour + 1) * 60);
  const people = scheduleBlocks.filter((block) => scheduleOverlaps(block, start, end));
  const seen = new Set();
  const unique = [];
  people.forEach((block) => {
    if (seen.has(block.user_id)) return;
    seen.add(block.user_id);
    unique.push(block);
  });
  unique.sort((a, b) => scheduleRank(a) - scheduleRank(b) || String(a.username).localeCompare(String(b.username)));
  const card = document.getElementById("schedule-card");
  if (!card) return;
  card.replaceChildren();
  const title = document.createElement("div");
  title.className = "schedule-card-title";
  title.textContent = scheduleClock(start) + " \u2013 " + scheduleClock(end) + " " + scheduleDaySub(day);
  const count = document.createElement("div");
  count.className = "schedule-card-count";
  count.textContent = unique.length + " available";
  card.appendChild(title);
  card.appendChild(count);
  unique.slice(0, 5).forEach((block) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "schedule-card-person";
    const dot = document.createElement("span");
    dot.className = "schedule-card-dot";
    dot.style.background = scheduleColor(block);
    const name = document.createElement("span");
    name.textContent = block.username || "Someone";
    name.style.color = scheduleColor(block);
    row.appendChild(dot);
    row.appendChild(name);
    row.addEventListener("click", () => {
      if (typeof openMiniProfile === "function") openMiniProfile(block.user_id, row);
    });
    card.appendChild(row);
  });
  const create = document.createElement("button");
  create.type = "button";
  create.className = "pill-btn schedule-card-create";
  create.textContent = "Create event";
  create.addEventListener("click", () => {
    closeScheduleCard();
    if (typeof openCalendarEvent !== "function") return;
    openCalendarEvent(null, scheduleInputValue(start), {
      inviteIds: unique.map((block) => Number(block.user_id)),
      label: scheduleClock(start) + " \u2013 " + scheduleClock(end),
    });
  });
  card.appendChild(create);
  card.hidden = false;
  const left = Math.min(event.clientX + 12, window.innerWidth - 280);
  const top = Math.min(event.clientY + 8, window.innerHeight - 220);
  card.style.left = Math.max(8, left) + "px";
  card.style.top = Math.max(8, top) + "px";
}

async function loadSchedule(channelId, keepScroll) {
  scheduleBlocks = [];
  if (!scheduleAnchor) scheduleAnchor = scheduleToday();
  closeScheduleCard();
  paintSchedule();
  if (!keepScroll) scheduleScrollToNow();
  const days = scheduleVisibleDays();
  const start = scheduleDayStart(days[0]).toISOString();
  const end = scheduleAddDays(days[days.length - 1], 1).toISOString();
  const response = await fetch(`https://${serverAddress}/get_schedule_blocks/${channelId}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(currentChannelId) !== Number(channelId)) return;
  scheduleBlocks = data.blocks || [];
  paintSchedule();
}

async function createScheduleBlock(start, end, ratio) {
  if (!currentChannelId || currentChannelType !== "scheduling") return;
  const response = await fetch(`https://${serverAddress}/create_schedule_block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      channel_id: currentChannelId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      x_ratio: ratio == null ? 0.5 : ratio,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that availability.");
    return;
  }
  if (data.block) applyScheduleBlock(data.block);
}

async function deleteScheduleBlock(blockId) {
  const response = await fetch(`https://${serverAddress}/delete_schedule_block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ block_id: blockId }),
  });
  if (!response.ok) return;
  removeScheduleBlock(blockId);
}

function shiftSchedule(step) {
  scheduleAnchor = scheduleAddDays(scheduleAnchor || scheduleToday(), step);
  if (currentChannelId && currentChannelType === "scheduling") loadSchedule(currentChannelId, true);
}

const scheduleSheet = document.getElementById("schedule-sheet");
if (scheduleSheet) scheduleSheet.addEventListener("pointerdown", schedulePointerDown);
const schedulePrev = document.getElementById("schedule-prev");
if (schedulePrev) schedulePrev.addEventListener("click", () => shiftSchedule(-1));
const scheduleNext = document.getElementById("schedule-next");
if (scheduleNext) scheduleNext.addEventListener("click", () => shiftSchedule(1));
document.addEventListener("pointerdown", (event) => {
  const card = document.getElementById("schedule-card");
  if (!card || card.hidden) return;
  if (card.contains(event.target)) return;
  closeScheduleCard();
});
