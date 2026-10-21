const APPLICATION_QUESTION_TYPES = [
  { id: "multi", label: "Pick all that apply" },
  { id: "choice", label: "Multiple choice" },
  { id: "text", label: "Written reply" },
  { id: "signature", label: "Signature" }
];
const APPLICATION_QUESTION_MAX = 5;

function emptyApplicationForm() {
  return { version: 1, questions: [] };
}

function parseApplicationForm(raw) {
  const empty = emptyApplicationForm();
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const questions = [];
  (Array.isArray(parsed.questions) ? parsed.questions : []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const type = String(item.type || "").toLowerCase();
    if (!APPLICATION_QUESTION_TYPES.some((row) => row.id === type)) return;
    const prompt = String(item.prompt || "").trim();
    if (!prompt) return;
    const question = {
      id: String(item.id || "") || ("q" + String(questions.length + 1)),
      type: type,
      prompt: prompt
    };
    if (type === "multi" || type === "choice") {
      question.options = [];
      (item.options || []).forEach((option) => {
        const text = String(option || "").trim();
        if (text && question.options.indexOf(text) < 0) question.options.push(text);
      });
    }
    questions.push(question);
  });
  return {
    version: Math.max(1, parseInt(parsed.version, 10) || 1),
    questions: questions.slice(0, APPLICATION_QUESTION_MAX)
  };
}

function savedServerPrivacy() {
  const data = typeof currentServerData !== "undefined" && currentServerData ? currentServerData : {};
  return {
    privacy_mode: String(data.privacy_mode || "private").toLowerCase(),
    discoverable: !!data.discoverable,
    explicit: !!data.explicit,
    applications_enabled: !!data.applications_enabled,
    application_form: parseApplicationForm(data.application_form)
  };
}

function applyServerPrivacy(serverId, fields) {
  if (!fields) return;
  if (typeof currentServerData !== "undefined" && currentServerData && String(currentServerId) === String(serverId)) {
    if (fields.privacy_mode != null) currentServerData.privacy_mode = fields.privacy_mode || "private";
    if (fields.discoverable != null) currentServerData.discoverable = !!fields.discoverable;
    if (fields.explicit != null) currentServerData.explicit = !!fields.explicit;
    if (fields.applications_enabled != null) currentServerData.applications_enabled = !!fields.applications_enabled;
    if (fields.application_form != null) currentServerData.application_form = parseApplicationForm(fields.application_form);
    if (typeof paintServerPrivacyPage === "function") paintServerPrivacyPage();
  }
}

function setServerPrivacyStatus(text) {
  const status = document.getElementById("server-privacy-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function paintServerPrivacyPage() {
  const saved = savedServerPrivacy();
  const canEdit = typeof canOpenServerPrivacy === "function" && canOpenServerPrivacy();
  const toggle = document.getElementById("server-privacy-discoverable");
  const wrap = document.getElementById("server-privacy-discover-switch");
  if (toggle) {
    toggle.checked = saved.discoverable;
    toggle.disabled = !canEdit;
  }
  if (wrap) wrap.classList.toggle("is-disabled", !canEdit);
  const apps = document.getElementById("server-privacy-applications-block");
  if (apps) apps.hidden = !saved.discoverable;
  const appsToggle = document.getElementById("server-privacy-applications");
  const appsWrap = document.getElementById("server-privacy-applications-switch");
  if (appsToggle) {
    appsToggle.checked = saved.applications_enabled;
    appsToggle.disabled = !canEdit;
  }
  if (appsWrap) appsWrap.classList.toggle("is-disabled", !canEdit);
  const editBtn = document.getElementById("server-privacy-edit-application");
  if (editBtn) editBtn.disabled = !canEdit;
  const explicitToggle = document.getElementById("server-privacy-explicit");
  const explicitWrap = document.getElementById("server-privacy-explicit-switch");
  if (explicitToggle) {
    explicitToggle.checked = saved.explicit;
    explicitToggle.disabled = !canEdit;
  }
  if (explicitWrap) explicitWrap.classList.toggle("is-disabled", !canEdit);
}

async function loadServerPrivacyPage() {
  setServerPrivacyStatus("");
  paintServerPrivacyPage();
  if (typeof syncServerSettingsType === "function") syncServerSettingsType(typeof savedServerSettingsType === "function" ? savedServerSettingsType() : "");
  if (typeof paintServerListingTags === "function") paintServerListingTags();
  if (typeof syncServerSettingsTimezone === "function") syncServerSettingsTimezone(typeof savedServerSettingsTimezone === "function" ? savedServerSettingsTimezone() : "");
}

async function saveServerPrivacy(nextDiscoverable, nextApplications, nextExplicit) {
  if (!currentServerId || typeof canOpenServerPrivacy !== "function" || !canOpenServerPrivacy()) return;
  const previous = savedServerPrivacy();
  const discoverable = !!nextDiscoverable;
  const applicationsEnabled = nextApplications == null ? previous.applications_enabled : !!nextApplications;
  const explicit = nextExplicit == null ? previous.explicit : !!nextExplicit;
  applyServerPrivacy(currentServerId, {
    discoverable: discoverable,
    applications_enabled: applicationsEnabled,
    explicit: explicit,
    application_form: previous.application_form
  });
  setServerPrivacyStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_privacy`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        discoverable: discoverable,
        applications_enabled: applicationsEnabled,
        explicit: explicit
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save Discovery.");
    applyServerPrivacy(currentServerId, data);
  } catch (e) {
    applyServerPrivacy(currentServerId, previous);
    setServerPrivacyStatus(e.message || "Could not save Discovery.");
  }
}

let applicationFormDraft = [];

function setEditApplicationStatus(text) {
  const status = document.getElementById("edit-application-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function cloneApplicationQuestions(questions) {
  return (questions || []).map((item) => ({
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    options: item.options ? item.options.slice() : undefined
  }));
}

function newApplicationQuestion() {
  return { id: "", type: "text", prompt: "" };
}

function readApplicationDraft() {
  const host = document.getElementById("edit-application-questions");
  if (!host) return applicationFormDraft.slice();
  const next = [];
  host.querySelectorAll(".edit-application-question").forEach((card) => {
    const type = (card.querySelector("[data-application-type]") || {}).value || "text";
    const prompt = ((card.querySelector("[data-application-prompt]") || {}).value || "").trim();
    const question = { id: card.getAttribute("data-question-id") || "", type: type, prompt: prompt };
    if (type === "multi" || type === "choice") {
      question.options = [];
      card.querySelectorAll("[data-application-option]").forEach((input) => {
        const text = String(input.value || "").trim();
        if (text && question.options.indexOf(text) < 0) question.options.push(text);
      });
    }
    next.push(question);
  });
  return next;
}

function paintEditApplication() {
  const host = document.getElementById("edit-application-questions");
  const add = document.getElementById("edit-application-add");
  if (!host) return;
  host.replaceChildren();
  applicationFormDraft.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "edit-application-question";
    card.setAttribute("data-question-id", question.id || "");
    const top = document.createElement("div");
    top.className = "edit-application-question-top";
    const select = document.createElement("select");
    select.className = "settings-select server-settings-select";
    select.setAttribute("data-application-type", "");
    APPLICATION_QUESTION_TYPES.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.label;
      if (row.id === question.type) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      applicationFormDraft = readApplicationDraft();
      const current = applicationFormDraft[index];
      if (current && (current.type === "multi" || current.type === "choice") && (!current.options || current.options.length < 2)) {
        current.options = ["", ""];
      }
      paintEditApplication();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-btn edit-application-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      applicationFormDraft = readApplicationDraft();
      applicationFormDraft.splice(index, 1);
      paintEditApplication();
    });
    top.appendChild(select);
    top.appendChild(remove);
    const prompt = document.createElement("textarea");
    prompt.className = "server-settings-input server-settings-textarea edit-application-prompt";
    prompt.setAttribute("data-application-prompt", "");
    prompt.rows = 5;
    prompt.maxLength = 200;
    prompt.placeholder = question.type === "signature" ? "Type your username to submit." : "Ask a question";
    prompt.value = question.prompt || "";
    card.appendChild(top);
    card.appendChild(prompt);
    if (question.type === "multi" || question.type === "choice") {
      const options = document.createElement("div");
      options.className = "edit-application-options";
      const values = question.options && question.options.length ? question.options.slice() : ["", ""];
      values.forEach((value, optionIndex) => {
        const row = document.createElement("div");
        row.className = "edit-application-option-row";
        const mark = document.createElement("span");
        mark.className = "edit-application-option-mark" + (question.type === "choice" ? " is-choice" : "");
        const input = document.createElement("input");
        input.className = "server-settings-input";
        input.type = "text";
        input.maxLength = 80;
        input.setAttribute("data-application-option", "");
        input.placeholder = "Option";
        input.value = value || "";
        const drop = document.createElement("button");
        drop.type = "button";
        drop.className = "ghost-btn";
        drop.textContent = "Remove";
        drop.disabled = values.length <= 2;
        drop.addEventListener("click", () => {
          applicationFormDraft = readApplicationDraft();
          const current = applicationFormDraft[index];
          if (!current || !current.options) return;
          current.options.splice(optionIndex, 1);
          paintEditApplication();
        });
        row.appendChild(mark);
        row.appendChild(input);
        row.appendChild(drop);
        options.appendChild(row);
      });
      if (values.length < 8) {
        const addOption = document.createElement("button");
        addOption.type = "button";
        addOption.className = "ghost-btn";
        addOption.textContent = "Add option";
        addOption.addEventListener("click", () => {
          applicationFormDraft = readApplicationDraft();
          const current = applicationFormDraft[index];
          if (!current) return;
          current.options = current.options || [];
          current.options.push("");
          paintEditApplication();
        });
        options.appendChild(addOption);
      }
      card.appendChild(options);
    }
    if (question.type === "signature") {
      const help = document.createElement("p");
      help.className = "server-settings-help edit-application-help";
      help.textContent = "The applicant must type their username to submit.";
      card.appendChild(help);
    }
    host.appendChild(card);
  });
  if (add) add.hidden = applicationFormDraft.length >= APPLICATION_QUESTION_MAX;
}

function closeGraphicMaterial() {
  const overlay = document.getElementById("graphic-material-overlay");
  if (overlay) overlay.hidden = true;
}

function openGraphicMaterial() {
  const overlay = document.getElementById("graphic-material-overlay");
  if (overlay) overlay.hidden = false;
}

function closeEditApplication() {
  const overlay = document.getElementById("edit-application-overlay");
  if (overlay) overlay.hidden = true;
  applicationFormDraft = [];
  setEditApplicationStatus("");
}

function openEditApplication() {
  if (typeof canOpenServerPrivacy === "function" && !canOpenServerPrivacy()) return;
  applicationFormDraft = cloneApplicationQuestions(savedServerPrivacy().application_form.questions);
  setEditApplicationStatus("");
  paintEditApplication();
  const overlay = document.getElementById("edit-application-overlay");
  if (overlay) overlay.hidden = false;
}

function collectApplicationQuestions() {
  const questions = readApplicationDraft();
  const clean = [];
  for (let i = 0; i < questions.length; i += 1) {
    const item = questions[i];
    const type = String(item.type || "").toLowerCase();
    const prompt = String(item.prompt || "").trim();
    if (!prompt) return { error: "Each question needs a prompt." };
    if (type === "multi" || type === "choice") {
      const options = (item.options || []).map((option) => String(option || "").trim()).filter(Boolean);
      const unique = [];
      options.forEach((option) => {
        if (unique.indexOf(option) < 0) unique.push(option);
      });
      if (unique.length < 2) return { error: "Choice questions need at least two options." };
      clean.push({ id: item.id || "", type: type, prompt: prompt, options: unique });
    } else {
      clean.push({ id: item.id || "", type: type, prompt: prompt });
    }
  }
  return { questions: clean };
}

async function saveEditApplication() {
  if (!currentServerId || typeof canOpenServerPrivacy !== "function" || !canOpenServerPrivacy()) return;
  const packed = collectApplicationQuestions();
  if (packed.error) {
    setEditApplicationStatus(packed.error);
    return;
  }
  const previous = savedServerPrivacy();
  setEditApplicationStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_application`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, questions: packed.questions })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the application.");
    applyServerPrivacy(currentServerId, data);
    closeEditApplication();
  } catch (e) {
    applyServerPrivacy(currentServerId, previous);
    setEditApplicationStatus(e.message || "Could not save the application.");
  }
}

(function bindServerPrivacyChrome() {
  const toggle = document.getElementById("server-privacy-discoverable");
  if (toggle) {
    toggle.addEventListener("change", () => {
      if (typeof canOpenServerPrivacy !== "function" || !canOpenServerPrivacy()) {
        paintServerPrivacyPage();
        return;
      }
      const saved = savedServerPrivacy();
      saveServerPrivacy(toggle.checked, saved.applications_enabled, saved.explicit);
    });
  }
  const appsToggle = document.getElementById("server-privacy-applications");
  if (appsToggle) {
    appsToggle.addEventListener("change", () => {
      if (typeof canOpenServerPrivacy !== "function" || !canOpenServerPrivacy()) {
        paintServerPrivacyPage();
        return;
      }
      const saved = savedServerPrivacy();
      saveServerPrivacy(saved.discoverable, appsToggle.checked, saved.explicit);
    });
  }
  const explicitToggle = document.getElementById("server-privacy-explicit");
  if (explicitToggle) {
    explicitToggle.addEventListener("change", () => {
      if (typeof canOpenServerPrivacy !== "function" || !canOpenServerPrivacy()) {
        paintServerPrivacyPage();
        return;
      }
      const saved = savedServerPrivacy();
      saveServerPrivacy(saved.discoverable, saved.applications_enabled, explicitToggle.checked);
    });
  }
  const graphicLink = document.getElementById("server-privacy-graphic-link");
  if (graphicLink) graphicLink.addEventListener("click", openGraphicMaterial);
  ["graphic-material-close", "graphic-material-cancel", "graphic-material-confirm"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", closeGraphicMaterial);
  });
  const graphicOverlay = document.getElementById("graphic-material-overlay");
  if (graphicOverlay) {
    graphicOverlay.addEventListener("click", (e) => {
      if (e.target && e.target.id === "graphic-material-overlay") closeGraphicMaterial();
    });
  }
  const editBtn = document.getElementById("server-privacy-edit-application");
  if (editBtn) editBtn.addEventListener("click", openEditApplication);
  const add = document.getElementById("edit-application-add");
  if (add) {
    add.addEventListener("click", () => {
      applicationFormDraft = readApplicationDraft();
      if (applicationFormDraft.length >= APPLICATION_QUESTION_MAX) return;
      applicationFormDraft.push(newApplicationQuestion());
      paintEditApplication();
    });
  }
  ["edit-application-close", "edit-application-cancel"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", closeEditApplication);
  });
  const save = document.getElementById("edit-application-save");
  if (save) save.addEventListener("click", saveEditApplication);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const graphic = document.getElementById("graphic-material-overlay");
    if (graphic && !graphic.hidden) {
      closeGraphicMaterial();
      e.stopPropagation();
      return;
    }
    const overlay = document.getElementById("edit-application-overlay");
    if (!overlay || overlay.hidden) return;
    closeEditApplication();
    e.stopPropagation();
  });
})();
