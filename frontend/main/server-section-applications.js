let serverSectionApplications = [];
let serverSectionApplicationsLoadedFor = null;
let serverSectionApplicationOpenId = null;
let serverSectionApplicationsBusy = false;

function serverShowsApplicationsSection() {
  if (!(currentServerData && currentServerData.applications_enabled)) return false;
  return typeof canUpdateServer === "function" && canUpdateServer();
}

function serverApplicationsSectionOpen() {
  const page = document.getElementById("server-applications-section");
  return !!(page && page.style.display === "flex");
}

function paintServerSectionApplicationsRow() {
  const row = document.getElementById("server-section-applications");
  if (!row) return;
  const shown = serverShowsApplicationsSection();
  row.hidden = !shown;
  if (!shown && serverApplicationsSectionOpen()) {
    if (typeof openServerOverview === "function") openServerOverview();
    else {
      const page = document.getElementById("server-applications-section");
      if (page) page.style.display = "none";
      if (typeof markServerSectionActive === "function") markServerSectionActive("server-section-overview");
    }
  }
}

function applicationStatusLabel(status) {
  if (status === "accepted") return "Accepted";
  if (status === "denied") return "Denied";
  return "Pending";
}

function applicationAnswerText(answer) {
  if (Array.isArray(answer)) return answer.filter((item) => String(item || "").trim()).join(", ");
  return String(answer || "").trim();
}

function applicationSubmittedLabel(ts) {
  if (typeof formatRosterAge === "function") return formatRosterAge(ts);
  return ts || "—";
}

function closeServerApplicationCard() {
  const overlay = document.getElementById("server-application-overlay");
  if (overlay) overlay.style.display = "none";
  serverSectionApplicationOpenId = null;
  serverSectionApplicationsBusy = false;
}

function paintServerApplicationCard(row) {
  const title = document.getElementById("server-application-title");
  const body = document.getElementById("server-application-body");
  const err = document.getElementById("server-application-error");
  const footer = document.getElementById("server-application-footer");
  const cancel = document.getElementById("server-application-cancel");
  const deny = document.getElementById("server-application-deny");
  const accept = document.getElementById("server-application-accept");
  if (!body || !row) return;
  const display = String(row.display_name || row.username || "Application").trim();
  if (title) title.textContent = display;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  body.innerHTML = "";
  const pending = row.status === "pending";
  const questions = row.questions || [];
  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "moderation-copy";
    empty.textContent = "No answers were saved.";
    body.appendChild(empty);
  } else {
    questions.forEach((question) => {
      const block = document.createElement("div");
      block.className = "server-application-question";
      const prompt = document.createElement("div");
      prompt.className = "server-modal-label";
      prompt.textContent = question.prompt || "Question";
      const answer = document.createElement("p");
      answer.className = "server-application-answer";
      answer.textContent = applicationAnswerText(question.answer) || "—";
      block.appendChild(prompt);
      block.appendChild(answer);
      body.appendChild(block);
    });
  }
  if (footer) footer.classList.toggle("is-pending", pending);
  if (cancel) cancel.hidden = pending;
  if (deny) {
    deny.hidden = !pending;
    deny.disabled = serverSectionApplicationsBusy;
  }
  if (accept) {
    accept.hidden = !pending;
    accept.disabled = serverSectionApplicationsBusy;
  }
}

function openServerApplicationCard(row) {
  if (!row) return;
  const overlay = document.getElementById("server-application-overlay");
  if (!overlay) return;
  serverSectionApplicationOpenId = row.id;
  paintServerApplicationCard(row);
  overlay.style.display = "flex";
}

function buildServerSectionApplicationCard(row) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "server-section-applications-row";
  card.dataset.applicationId = String(row.id);
  const face = document.createElement("div");
  face.className = "avatar-dot";
  card.appendChild(face);
  const text = document.createElement("div");
  text.className = "server-section-applications-text";
  const display = document.createElement("div");
  display.className = "server-section-applications-display";
  display.textContent = row.display_name || row.username || "";
  const account = document.createElement("div");
  account.className = "server-section-applications-username";
  account.textContent = row.username || "";
  const when = document.createElement("div");
  when.className = "server-section-applications-time";
  when.textContent = applicationSubmittedLabel(row.submitted_at);
  const preview = document.createElement("div");
  preview.className = "server-section-applications-preview";
  preview.textContent = row.preview || "";
  text.appendChild(display);
  if (row.username && row.display_name && row.username !== row.display_name) text.appendChild(account);
  text.appendChild(when);
  if (row.preview) text.appendChild(preview);
  card.appendChild(text);
  const status = document.createElement("div");
  status.className = "server-section-applications-status is-" + (row.status || "pending");
  status.textContent = applicationStatusLabel(row.status);
  card.appendChild(status);
  if (typeof paintUserFace === "function") {
    paintUserFace(face, row, { name: row.username, userId: row.user_id });
  }
  card.addEventListener("click", () => openServerApplicationCard(row));
  return card;
}

function paintServerSectionApplicationsList() {
  const body = document.getElementById("server-applications-section-list");
  if (!body || !serverApplicationsSectionOpen()) return;
  body.innerHTML = "";
  if (!serverSectionApplications.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "No applications.";
    body.appendChild(empty);
    return;
  }
  serverSectionApplications.forEach((row) => body.appendChild(buildServerSectionApplicationCard(row)));
}

async function loadServerSectionApplications(force) {
  if (!currentServerId || !serverShowsApplicationsSection()) return;
  if (!force && serverSectionApplicationsLoadedFor === currentServerId) {
    paintServerSectionApplicationsList();
    return;
  }
  try {
    const response = await fetch(
      `https://${serverAddress}/server_applications/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !serverApplicationsSectionOpen()) return;
    serverSectionApplications = data.applications || [];
    serverSectionApplicationsLoadedFor = currentServerId;
    paintServerSectionApplicationsList();
    if (serverSectionApplicationOpenId) {
      const open = serverSectionApplications.find((row) => row.id === serverSectionApplicationOpenId);
      if (open) paintServerApplicationCard(open);
      else closeServerApplicationCard();
    }
  } catch (e) {}
}

async function openServerApplicationsSection() {
  if (!currentServerId || !serverShowsApplicationsSection()) return;
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
  const page = document.getElementById("server-applications-section");
  if (page) page.style.display = "flex";
  if (typeof markServerSectionActive === "function") markServerSectionActive("server-section-applications");
  const title = document.getElementById("channel-header-title");
  if (title) title.textContent = "Applications";
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  paintServerSectionApplicationsList();
  await loadServerSectionApplications(true);
}

function applyServerApplicationEvent(data) {
  if (!data || String(data.server_id) !== String(currentServerId)) return;
  if (serverApplicationsSectionOpen()) loadServerSectionApplications(true);
}

async function reviewServerSectionApplication(accepted) {
  if (!currentServerId || !serverSectionApplicationOpenId || serverSectionApplicationsBusy) return;
  const err = document.getElementById("server-application-error");
  const deny = document.getElementById("server-application-deny");
  const accept = document.getElementById("server-application-accept");
  serverSectionApplicationsBusy = true;
  if (deny) deny.disabled = true;
  if (accept) accept.disabled = true;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const response = await fetch(`https://${serverAddress}/review_server_application`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        application_id: serverSectionApplicationOpenId,
        accepted: !!accepted
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not review that application.");
    const next = data.application;
    if (next) {
      serverSectionApplications = serverSectionApplications.map((row) => row.id === next.id ? next : row);
      paintServerSectionApplicationsList();
      paintServerApplicationCard(next);
    } else {
      await loadServerSectionApplications(true);
    }
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not review that application.";
    }
  } finally {
    serverSectionApplicationsBusy = false;
    if (deny) deny.disabled = false;
    if (accept) accept.disabled = false;
  }
}

(function bindServerSectionApplications() {
  const row = document.getElementById("server-section-applications");
  if (row) {
    row.addEventListener("click", () => {
      if (typeof beginBody === "function") {
        beginBody({
          view: "channel",
          titleEl: "channel-header-title",
          title: "Applications"
        });
      }
      openServerApplicationsSection();
    });
  }
  const close = document.getElementById("server-application-close");
  const cancel = document.getElementById("server-application-cancel");
  const overlay = document.getElementById("server-application-overlay");
  const deny = document.getElementById("server-application-deny");
  const accept = document.getElementById("server-application-accept");
  if (close) close.addEventListener("click", closeServerApplicationCard);
  if (cancel) cancel.addEventListener("click", closeServerApplicationCard);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "server-application-overlay") closeServerApplicationCard();
    });
  }
  if (deny) deny.addEventListener("click", () => reviewServerSectionApplication(false));
  if (accept) accept.addEventListener("click", () => reviewServerSectionApplication(true));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".context-menu")) return;
    if (overlay && overlay.style.display === "flex") closeServerApplicationCard();
  });
})();
