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

function paintNewsAnnouncements(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Announcements"],
    title: "Announcements",
    note: "Post site-wide News. Everyone is alerted, and a red count stays on the News tab until they open it.",
    clock: "est"
  }));
  const bar = adminEl("div", "news-composer-bar is-later");
  const search = adminEl("input", "news-search");
  search.type = "search";
  search.placeholder = "Search";
  search.disabled = true;
  const post = adminEl("button", "admin-mod-confirm");
  post.type = "button";
  post.textContent = "New Post";
  post.disabled = true;
  bar.appendChild(search);
  bar.appendChild(post);
  main.appendChild(bar);
  const list = adminEl("div", "news-announce-list");
  const card = adminEl("div", "news-announce-card is-later");
  const head = adminEl("div", "news-announce-head");
  head.appendChild(adminEl("div", "news-announce-title", "Title"));
  head.appendChild(adminEl("div", "news-announce-date", "Newest first"));
  card.appendChild(head);
  card.appendChild(adminEl("div", "news-announce-body", "Announcement body. Pictures, emoji, video, comments, and reactions use the same chrome as a server announcements channel."));
  const foot = adminEl("div", "news-announce-foot");
  foot.appendChild(adminEl("span", "", "0 comments"));
  foot.appendChild(adminEl("span", "", "Reactions"));
  card.appendChild(foot);
  list.appendChild(card);
  list.appendChild(adminEl("div", "news-end", "You're up to date!"));
  main.appendChild(list);
}

function paintNewsDonate(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Donate"],
    title: "Donate",
    note: "Ko-fi opens in a new tab after a leave-site card. Rewards are not offered yet.",
    clock: "est"
  }));
  const panel = adminPanel({ title: "Ko-fi", meta: "Off Oneira", fill: true });
  panel.body.appendChild(adminEl("div", "users-field-k", "Ko-fi page"));
  const url = adminEl("input", "admin-mod-input");
  url.type = "text";
  url.placeholder = "Ko-fi link";
  url.disabled = true;
  panel.body.appendChild(url);
  panel.body.appendChild(adminEl("div", "users-field-k", "Disclaimer"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  area.placeholder = "Disclaimer will be set later.";
  area.disabled = true;
  panel.body.appendChild(area);
  const preview = adminEl("button", "admin-mod-confirm");
  preview.type = "button";
  preview.textContent = "Preview leave-site card";
  preview.addEventListener("click", () => openNewsDonateCard(true));
  panel.body.appendChild(preview);
  main.appendChild(panel.panel);
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

function paintNewsBroadcast(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Broadcast"],
    title: "Broadcast",
    note: "Stapled to the top rail between the page tabs and Feedback. Stays up until you clear it.",
    clock: "est"
  }));
  const preview = adminEl("div", "news-broadcast-preview is-later");
  preview.appendChild(adminEl("span", "", "Broadcast"));
  main.appendChild(preview);
  const panel = adminPanel({ title: "Alert", fill: true });
  panel.body.appendChild(adminEl("div", "users-field-k", "Message"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  area.placeholder = "Maintenance window, outage, or other site-wide notice";
  area.disabled = true;
  panel.body.appendChild(area);
  const row = adminEl("div", "news-broadcast-actions");
  const clear = adminEl("button", "admin-mod-cancel");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.disabled = true;
  const save = adminEl("button", "admin-mod-confirm");
  save.type = "button";
  save.textContent = "Save";
  save.disabled = true;
  row.appendChild(clear);
  row.appendChild(save);
  panel.body.appendChild(row);
  main.appendChild(panel.panel);
}

function openNewsDonateCard(fromAdmin) {
  const overlay = document.getElementById("news-donate-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  const continueBtn = document.getElementById("news-donate-continue");
  if (continueBtn) continueBtn.disabled = true;
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
if (newsDonateContinue) newsDonateContinue.addEventListener("click", closeNewsDonateCard);
