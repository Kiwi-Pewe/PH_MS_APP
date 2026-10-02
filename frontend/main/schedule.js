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
  const wrap = document.createElement("div");
  wrap.className = "schedule-block";
  wrap.style.top = scheduleMinuteTop(column, topMin) + "px";
  wrap.style.height = (scheduleMinuteTop(column, topMin + heightMin) - scheduleMinuteTop(column, topMin)) + "px";
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
  wrap.appendChild(cap);
  wrap.appendChild(foot);
  if (Number(block.user_id) === Number(myUserId)) {
    foot.classList.add("is-handle");
    foot.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      beginScheduleResize(event, block, wrap);
    });
    const own = document.createElement("div");
    own.className = "schedule-own";
    own.addEventListener("pointerdown", (event) => event.stopPropagation());
    own.appendChild(face);
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
    own.appendChild(remove);
    wrap.appendChild(own);
  } else {
    wrap.appendChild(face);
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

function scheduleColumnMinutes(event, column) {
  const slots = column.querySelectorAll(".schedule-slot");
  if (!slots.length) return 0;
  const y = event.clientY;
  if (y < slots[0].getBoundingClientRect().top) return 0;
  let index = slots.length - 1;
  for (let i = 0; i < slots.length; i += 1) {
    const rect = slots[i].getBoundingClientRect();
    if (y < rect.bottom) {
      index = i;
      break;
    }
  }
  const rect = slots[index].getBoundingClientRect();
  const ratio = rect.height ? (y - rect.top) / rect.height : 0;
  const snapped = Math.round((index * 60 + ratio * 60) / 30) * 30;
  return Math.max(0, Math.min(24 * 60, snapped));
}

function scheduleMinuteTop(column, minutes) {
  const capped = Math.max(0, Math.min(24 * 60, minutes));
  if (capped >= 24 * 60) {
    const last = scheduleSlot(column, 23);
    if (!last || !last.offsetHeight) return 24 * SCHEDULE_HOUR_PX;
    return last.offsetTop + last.offsetHeight;
  }
  const hour = Math.floor(capped / 60);
  const part = capped - hour * 60;
  const slot = scheduleSlot(column, hour);
  if (!slot || !slot.offsetHeight) return (capped / 60) * SCHEDULE_HOUR_PX;
  return slot.offsetTop + (part / 60) * slot.offsetHeight;
}

function scheduleBlockMinutes(block, day) {
  const dayStart = scheduleDayStart(day).getTime();
  const start = Math.max(new Date(block.starts_at).getTime(), dayStart);
  const end = Math.min(new Date(block.ends_at).getTime(), scheduleAddDays(scheduleDayStart(day), 1).getTime());
  return {
    start: Math.round((start - dayStart) / 60000),
    end: Math.round((end - dayStart) / 60000),
  };
}

function schedulePaintLength(wrap, column, startMin, endMin) {
  const top = scheduleMinuteTop(column, startMin);
  wrap.style.top = top + "px";
  wrap.style.height = (scheduleMinuteTop(column, endMin) - top) + "px";
}

function schedulePointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".schedule-face, .schedule-remove, .schedule-cap-foot.is-handle")) return;
  const column = event.target.closest(".schedule-day");
  if (!column) return;
  closeScheduleCard();
  const board = event.currentTarget;
  const startMin = scheduleColumnMinutes(event, column);
  scheduleDrag = {
    mode: "place",
    day: Number(column.dataset.day),
    column,
    startHour: scheduleColumnHour(event, column),
    startMin,
    min: startMin,
    ratio: scheduleColumnRatio(event, column),
    moved: false,
    pointer: event.pointerId,
    originY: event.clientY,
  };
  board.setPointerCapture(event.pointerId);
  const move = (ev) => {
    if (!scheduleDrag || scheduleDrag.mode !== "place" || scheduleDrag.pointer !== ev.pointerId) return;
    if (Math.abs(ev.clientY - scheduleDrag.originY) > 6) scheduleDrag.moved = true;
    scheduleDrag.min = scheduleColumnMinutes(ev, scheduleDrag.column);
    paintScheduleGhost();
  };
  const up = (ev) => {
    if (!scheduleDrag || scheduleDrag.mode !== "place" || scheduleDrag.pointer !== ev.pointerId) return;
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
    if (drag.startMin === drag.min) return;
    const from = Math.min(drag.startMin, drag.min);
    const to = Math.max(drag.startMin, drag.min);
    createScheduleBlock(scheduleAtMinutes(day, from), scheduleAtMinutes(day, to), drag.ratio);
  };
  board.addEventListener("pointermove", move);
  board.addEventListener("pointerup", up);
}

function beginScheduleResize(event, block, wrap) {
  if (event.button !== 0) return;
  const column = wrap.closest(".schedule-day");
  const sheet = document.getElementById("schedule-sheet");
  if (!column || !sheet) return;
  const day = scheduleVisibleDays()[Number(column.dataset.day)];
  if (!day) return;
  closeScheduleCard();
  const minutes = scheduleBlockMinutes(block, day);
  scheduleDrag = {
    mode: "resize",
    pointer: event.pointerId,
    column,
    wrap,
    block,
    day,
    startMin: minutes.start,
    endMin: minutes.end,
  };
  sheet.setPointerCapture(event.pointerId);
  const move = (ev) => {
    if (!scheduleDrag || scheduleDrag.mode !== "resize" || scheduleDrag.pointer !== ev.pointerId) return;
    let next = scheduleColumnMinutes(ev, column);
    if (next < scheduleDrag.startMin + 30) next = scheduleDrag.startMin + 30;
    scheduleDrag.endMin = next;
    schedulePaintLength(wrap, column, scheduleDrag.startMin, next);
  };
  const up = (ev) => {
    if (!scheduleDrag || scheduleDrag.mode !== "resize" || scheduleDrag.pointer !== ev.pointerId) return;
    sheet.removeEventListener("pointermove", move);
    sheet.removeEventListener("pointerup", up);
    const drag = scheduleDrag;
    scheduleDrag = null;
    if (drag.endMin === minutes.end) return;
    updateScheduleBlock(drag.block.id, scheduleAtMinutes(drag.day, drag.endMin));
  };
  sheet.addEventListener("pointermove", move);
  sheet.addEventListener("pointerup", up);
}

function paintScheduleGhost() {
  clearScheduleGhost();
  if (!scheduleDrag || scheduleDrag.mode !== "place" || !scheduleDrag.moved || !scheduleDrag.column) return;
  if (scheduleDrag.startMin === scheduleDrag.min) return;
  const from = Math.min(scheduleDrag.startMin, scheduleDrag.min);
  const to = Math.max(scheduleDrag.startMin, scheduleDrag.min);
  const top = scheduleMinuteTop(scheduleDrag.column, from);
  const ghost = document.createElement("div");
  ghost.className = "schedule-block is-ghost";
  ghost.style.top = top + "px";
  ghost.style.height = (scheduleMinuteTop(scheduleDrag.column, to) - top) + "px";
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
  if (typeof positionMenu === "function") positionMenu(card, event.clientX, event.clientY);
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

async function updateScheduleBlock(blockId, end) {
  const response = await fetch(`https://${serverAddress}/update_schedule_block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      block_id: blockId,
      ends_at: end.toISOString(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    paintSchedule();
    window.alert((typeof data.detail === "string" && data.detail) || "Could not update that availability.");
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
