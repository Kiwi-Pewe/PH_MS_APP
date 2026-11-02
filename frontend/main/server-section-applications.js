let serverSectionPending = [];
let serverSectionReviewed = [];
let serverSectionPendingMore = false;
let serverSectionReviewedMore = false;
let serverSectionApplicationsLoadedFor = null;
let serverSectionApplicationOpenId = null;
let serverSectionApplicationsBusy = false;
let serverSectionPendingLoading = false;
let serverSectionReviewedLoading = false;

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

function serverSectionApplicationById(id) {
  return serverSectionPending.concat(serverSectionReviewed).find((row) => row.id === id) || null;
}

function resetServerSectionApplicationLists() {
  serverSectionPending = [];
  serverSectionReviewed = [];
  serverSectionPendingMore = false;
  serverSectionReviewedMore = false;
  serverSectionApplicationsLoadedFor = null;
}

function closeServerApplicationCard() {
  const overlay = document.getElementById("server-application-overlay");
  if (overlay) overlay.hidden = true;
  serverSectionApplicationOpenId = null;
  serverSectionApplicationsBusy = false;
}

function applicationOptionPicked(question, option) {
  const answer = question && question.answer;
  if (Array.isArray(answer)) return answer.indexOf(option) !== -1;
  return String(answer || "") === String(option);
}

function paintServerApplicationCard(row) {
  const title = document.getElementById("server-application-title");
  const body = document.getElementById("server-application-body");
  const err = document.getElementById("server-application-error");
  const deny = document.getElementById("server-application-deny");
  const accept = document.getElementById("server-application-accept");
  if (!body || !row) return;
  const username = String(row.username || "member").trim();
  if (title) title.textContent = username + "'s Application";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  body.innerHTML = "";
  const pending = row.status === "pending";
  const questions = row.questions || [];
  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "No answers were saved.";
    body.appendChild(empty);
  } else {
    questions.forEach((question, index) => {
      const block = document.createElement("div");
      block.className = "application-question";
      const prompt = document.createElement("div");
      prompt.className = "application-question-title";
      prompt.textContent = (index + 1) + ". " + (question.prompt || "Question");
      block.appendChild(prompt);
      if (question.type === "multi" || question.type === "choice") {
        const options = document.createElement("div");
        options.className = "application-question-options";
        (question.options || []).forEach((option) => {
          const line = document.createElement("div");
          line.className = "application-choice is-static"
            + (question.type === "choice" ? " is-choice" : "")
            + (applicationOptionPicked(question, option) ? " is-on" : "");
          const mark = document.createElement("span");
          mark.className = "application-choice-mark";
          const label = document.createElement("span");
          label.className = "application-choice-label";
          label.textContent = option;
          line.appendChild(mark);
          line.appendChild(label);
          options.appendChild(line);
        });
        block.appendChild(options);
      } else {
        const answer = document.createElement("p");
        answer.className = "application-question-answer";
        answer.textContent = applicationAnswerText(question.answer) || "—";
        block.appendChild(answer);
      }
      body.appendChild(block);
    });
  }
  if (deny) deny.disabled = serverSectionApplicationsBusy || !pending;
  if (accept) accept.disabled = serverSectionApplicationsBusy || !pending;
}

function openServerApplicationCard(row) {
  if (!row) return;
  const overlay = document.getElementById("server-application-overlay");
  if (!overlay) return;
  serverSectionApplicationOpenId = row.id;
  paintServerApplicationCard(row);
  overlay.hidden = false;
}

function applicationFirstSnippet(row) {
  const question = ((row && row.questions) || [])[0];
  if (!question) return "";
  const prompt = String(question.prompt || "Question").trim();
  const answer = applicationAnswerText(question.answer);
  if (!answer) return prompt;
  return prompt + " — " + answer;
}

function buildServerSectionApplicationCard(row) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "server-section-applications-row";
  card.dataset.applicationId = String(row.id);

  const user = document.createElement("div");
  user.className = "server-section-applications-user";
  const face = document.createElement("div");
  face.className = "avatar-dot";
  user.appendChild(face);
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
  text.appendChild(display);
  text.appendChild(account);
  text.appendChild(when);
  user.appendChild(text);
  card.appendChild(user);

  const snippet = document.createElement("div");
  snippet.className = "server-section-applications-snippet";
  const snippetText = document.createElement("div");
  snippetText.className = "server-section-applications-snippet-text";
  snippetText.textContent = applicationFirstSnippet(row) || "—";
  snippet.appendChild(snippetText);
  card.appendChild(snippet);

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
  const section = document.getElementById("server-applications-section");
  const body = document.getElementById("server-applications-section-list");
  const empty = document.getElementById("server-applications-section-empty");
  const pendingEmpty = document.getElementById("server-applications-pending-empty");
  const pendingHost = document.getElementById("server-applications-pending");
  const pendingMore = document.getElementById("server-applications-pending-more");
  const rule = document.getElementById("server-applications-reviewed-rule");
  const reviewedHost = document.getElementById("server-applications-reviewed");
  const reviewedMore = document.getElementById("server-applications-reviewed-more");
  if (!body || !serverApplicationsSectionOpen()) return;
  const noPending = !serverSectionPending.length;
  const noReviewed = !serverSectionReviewed.length;
  const barren = noPending && noReviewed && !serverSectionPendingMore && !serverSectionReviewedMore;
  if (section) section.classList.toggle("is-empty", barren);
  if (empty) empty.hidden = !barren;
  body.hidden = barren;
  if (barren) return;
  if (pendingEmpty) pendingEmpty.hidden = !noPending || serverSectionPendingMore;
  if (pendingHost) {
    pendingHost.hidden = noPending;
    pendingHost.innerHTML = "";
    serverSectionPending.forEach((row) => pendingHost.appendChild(buildServerSectionApplicationCard(row)));
  }
  if (pendingMore) {
    pendingMore.hidden = !serverSectionPendingMore;
    pendingMore.disabled = serverSectionPendingLoading;
  }
  if (rule) rule.hidden = noReviewed;
  if (reviewedHost) {
    reviewedHost.hidden = noReviewed;
    reviewedHost.innerHTML = "";
    serverSectionReviewed.forEach((row) => reviewedHost.appendChild(buildServerSectionApplicationCard(row)));
  }
  if (reviewedMore) {
    reviewedMore.hidden = !serverSectionReviewedMore;
    reviewedMore.disabled = serverSectionReviewedLoading;
  }
}

function refreshOpenApplicationCard() {
  if (!serverSectionApplicationOpenId) return;
  const open = serverSectionApplicationById(serverSectionApplicationOpenId);
  if (open) paintServerApplicationCard(open);
  else closeServerApplicationCard();
}

async function fetchServerSectionApplications(group, offset) {
  const response = await fetch(
    `https://${serverAddress}/server_applications/${encodeURIComponent(currentServerId)}?group=${encodeURIComponent(group)}&offset=${offset}`,
    { credentials: "include" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load applications.");
  return data;
}

async function loadServerSectionApplications(force) {
  if (!currentServerId || !serverShowsApplicationsSection()) return;
  if (!force && serverSectionApplicationsLoadedFor === currentServerId) {
    paintServerSectionApplicationsList();
    return;
  }
  try {
    const packs = await Promise.all([
      fetchServerSectionApplications("pending", 0),
      fetchServerSectionApplications("reviewed", 0)
    ]);
    if (!serverApplicationsSectionOpen()) return;
    serverSectionPending = packs[0].applications || [];
    serverSectionPendingMore = !!packs[0].has_more;
    serverSectionReviewed = packs[1].applications || [];
    serverSectionReviewedMore = !!packs[1].has_more;
    serverSectionApplicationsLoadedFor = currentServerId;
    paintServerSectionApplicationsList();
    refreshOpenApplicationCard();
  } catch (e) {}
}

async function loadMoreServerSectionApplications(group) {
  if (!currentServerId || !serverShowsApplicationsSection() || !serverApplicationsSectionOpen()) return;
  const pending = group === "pending";
  if (pending) {
    if (!serverSectionPendingMore || serverSectionPendingLoading) return;
    serverSectionPendingLoading = true;
  } else {
    if (!serverSectionReviewedMore || serverSectionReviewedLoading) return;
    serverSectionReviewedLoading = true;
  }
  paintServerSectionApplicationsList();
  try {
    const offset = pending ? serverSectionPending.length : serverSectionReviewed.length;
    const data = await fetchServerSectionApplications(pending ? "pending" : "reviewed", offset);
    if (!serverApplicationsSectionOpen()) return;
    const rows = data.applications || [];
    if (pending) {
      serverSectionPending = serverSectionPending.concat(rows);
      serverSectionPendingMore = !!data.has_more;
    } else {
      serverSectionReviewed = serverSectionReviewed.concat(rows);
      serverSectionReviewedMore = !!data.has_more;
    }
  } catch (e) {
  } finally {
    if (pending) serverSectionPendingLoading = false;
    else serverSectionReviewedLoading = false;
    paintServerSectionApplicationsList();
  }
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
  if (serverSectionApplicationsLoadedFor !== currentServerId) resetServerSectionApplicationLists();
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
      serverSectionPending = serverSectionPending.filter((row) => row.id !== next.id);
      serverSectionReviewed = [next].concat(serverSectionReviewed.filter((row) => row.id !== next.id));
      paintServerSectionApplicationsList();
      paintServerApplicationCard(next);
      if (!serverSectionPending.length && serverSectionPendingMore) {
        await loadMoreServerSectionApplications("pending");
      }
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
    const open = serverSectionApplicationById(serverSectionApplicationOpenId);
    const pending = !!(open && open.status === "pending");
    if (deny) deny.disabled = !pending;
    if (accept) accept.disabled = !pending;
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
  const overlay = document.getElementById("server-application-overlay");
  const deny = document.getElementById("server-application-deny");
  const accept = document.getElementById("server-application-accept");
  if (close) close.addEventListener("click", closeServerApplicationCard);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "server-application-overlay") closeServerApplicationCard();
    });
  }
  if (deny) deny.addEventListener("click", () => reviewServerSectionApplication(false));
  if (accept) accept.addEventListener("click", () => reviewServerSectionApplication(true));
  const pendingMore = document.getElementById("server-applications-pending-more");
  const reviewedMore = document.getElementById("server-applications-reviewed-more");
  if (pendingMore) pendingMore.addEventListener("click", () => loadMoreServerSectionApplications("pending"));
  if (reviewedMore) reviewedMore.addEventListener("click", () => loadMoreServerSectionApplications("reviewed"));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".context-menu")) return;
    if (overlay && !overlay.hidden) closeServerApplicationCard();
  });
})();
