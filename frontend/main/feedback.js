// ==================================================================
// feedback.js - Top-bar Feedback card. Composer only this pass.
// ==================================================================

const FEEDBACK_TEXT_MIN = 10;
const FEEDBACK_TEXT_MAX = 1500;
const FEEDBACK_FILE_MAX = 3;
const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "inquiry", label: "General Inquiries" }
];

let feedbackOverlay = null;
let feedbackFiles = [];

function feedbackTextLength(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim().length;
}

function rejectFeedbackFile(file) {
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".mp3")) return "Feedback cannot take mp3 files.";
  if (name.endsWith(".mov")) return "Use mp4 or webm. iPhone .mov files are not supported yet.";
  const mime = typeof fileMime === "function" ? fileMime(file) : "";
  if (!mime || mime.indexOf("audio/") === 0) return "Only jpeg, png, gif, webp, mp4, or webm.";
  const image = mime.indexOf("image/") === 0;
  const cap = image ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > cap) return image ? "Images must be 5 MB or smaller." : "Videos must be 20 MB or smaller.";
  return "";
}

function clearFeedbackFiles() {
  feedbackFiles.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  feedbackFiles = [];
}

function closeFeedbackCard() {
  clearFeedbackFiles();
  if (feedbackOverlay) feedbackOverlay.remove();
  feedbackOverlay = null;
  const tab = document.getElementById("feedback-tab");
  if (tab) tab.classList.remove("active");
}

function feedbackContext() {
  const profileOn = document.getElementById("view-profile") && document.getElementById("view-profile").classList.contains("active");
  let view = "home";
  if (typeof isSettingsOpen !== "undefined" && isSettingsOpen) view = "settings";
  else if (currentServerId) view = "server";
  else if (profileOn) view = "profile";
  const serverName = (typeof currentServerSettingsName === "function" && currentServerId)
    ? currentServerSettingsName()
    : "";
  return {
    context_view: view,
    server_id: currentServerId || "",
    server_name: serverName || "",
    channel_id: currentChannelId || null,
    channel_name: currentChannelName || "",
    channel_type: currentChannelType || ""
  };
}

async function uploadFeedbackFile(file) {
  const mime = fileMime(file);
  const reason = rejectFeedbackFile(file);
  if (reason) throw new Error(reason);
  let intentRes;
  try {
    intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: mime,
        size: file.size,
        filename: file.name || "",
        purpose: "feedback"
      })
    });
  } catch (e) {
    throw new Error("Could not reach the API to start the upload. Is uvicorn running?");
  }
  const intent = await intentRes.json().catch(() => ({}));
  if (!intentRes.ok) throw new Error(intent.detail || "Could not start upload.");
  let putRes;
  try {
    putRes = await fetch(intent.upload_url, {
      method: "PUT",
      headers: { "Content-Type": intent.mime },
      body: file
    });
  } catch (e) {
    throw new Error("R2 blocked the browser upload. Re-save the bucket CORS policy.");
  }
  if (!putRes.ok) throw new Error("R2 rejected the file (HTTP " + putRes.status + ").");
  return {
    key: intent.key,
    mime: intent.mime,
    size: file.size,
    name: file.name || ""
  };
}

function openFeedbackCard() {
  if (feedbackOverlay) {
    closeFeedbackCard();
    return;
  }
  const tab = document.getElementById("feedback-tab");
  if (tab) tab.classList.add("active");

  const overlay = document.createElement("div");
  overlay.className = "settings-form-overlay";
  const box = document.createElement("div");
  box.className = "profile-opt feedback-opt";

  const top = document.createElement("div");
  top.className = "profile-opt-top";
  const name = document.createElement("div");
  name.className = "profile-opt-name";
  name.textContent = "Feedback";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "profile-opt-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "\u00d7";

  const main = document.createElement("div");
  main.className = "feedback-opt-main";

  const bottom = document.createElement("div");
  bottom.className = "profile-opt-bottom";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const hintEl = document.createElement("div");
  hintEl.className = "profile-opt-hint";
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "settings-form-save";
  submit.textContent = "Submit";
  bottom.appendChild(cancel);
  bottom.appendChild(hintEl);
  bottom.appendChild(submit);

  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Type";
  const typeSelect = document.createElement("select");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select…";
  typeSelect.appendChild(blank);
  FEEDBACK_TYPES.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    typeSelect.appendChild(opt);
  });
  typeLabel.appendChild(typeSelect);

  const bodyLabel = document.createElement("label");
  bodyLabel.textContent = "Message";
  const body = document.createElement("textarea");
  body.rows = 3;
  body.maxLength = FEEDBACK_TEXT_MAX;
  body.spellcheck = true;
  bodyLabel.appendChild(body);

  const mediaLabel = document.createElement("div");
  mediaLabel.className = "profile-opt-field-label";
  mediaLabel.textContent = "Pictures or videos";
  const mediaRow = document.createElement("div");
  mediaRow.className = "feedback-media-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "settings-row-btn";
  addBtn.textContent = "Add file";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
  fileInput.hidden = true;
  const strip = document.createElement("div");
  strip.className = "feedback-media-strip";
  mediaRow.appendChild(addBtn);
  mediaRow.appendChild(fileInput);
  mediaRow.appendChild(strip);

  main.appendChild(typeLabel);
  main.appendChild(bodyLabel);
  main.appendChild(mediaLabel);
  main.appendChild(mediaRow);

  function setHint(text) {
    hintEl.textContent = text || "";
  }

  function growFeedbackBody() {
    body.style.height = "auto";
    body.style.height = body.scrollHeight + "px";
  }

  function paintStrip() {
    mediaRow.classList.toggle("has-files", feedbackFiles.length > 0);
    strip.innerHTML = "";
    feedbackFiles.forEach((item, index) => {
      const chip = document.createElement("div");
      chip.className = "feedback-media-chip";
      chip.textContent = item.file.name || "File";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "\u00d7";
      remove.setAttribute("aria-label", "Remove");
      remove.addEventListener("click", () => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        feedbackFiles.splice(index, 1);
        paintStrip();
        refreshHint();
      });
      chip.appendChild(remove);
      strip.appendChild(chip);
    });
    addBtn.disabled = feedbackFiles.length >= FEEDBACK_FILE_MAX;
  }

  function refreshHint() {
    const n = feedbackTextLength(body.value);
    setHint(n + " / " + FEEDBACK_TEXT_MAX);
  }

  let sent = false;

  function showSent() {
    sent = true;
    main.innerHTML = "";
    const done = document.createElement("div");
    done.className = "feedback-sent";
    done.textContent = "Your feedback was submitted.";
    main.appendChild(done);
    cancel.hidden = true;
    submit.textContent = "Close";
    submit.disabled = false;
    setHint("");
  }

  addBtn.addEventListener("click", () => {
    if (feedbackFiles.length >= FEEDBACK_FILE_MAX) return;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const incoming = [...(fileInput.files || [])];
    incoming.forEach((file) => {
      if (feedbackFiles.length >= FEEDBACK_FILE_MAX) {
        setHint("Up to 3 files.");
        return;
      }
      const reason = rejectFeedbackFile(file);
      if (reason) {
        setHint(reason);
        return;
      }
      feedbackFiles.push({
        file,
        previewUrl: URL.createObjectURL(file)
      });
    });
    paintStrip();
    if (!hintEl.textContent || hintEl.textContent.indexOf(" / ") >= 0) refreshHint();
  });

  body.addEventListener("input", () => {
    growFeedbackBody();
    refreshHint();
  });
  typeSelect.addEventListener("change", refreshHint);
  cancel.addEventListener("click", () => closeFeedbackCard());
  close.addEventListener("click", () => closeFeedbackCard());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFeedbackCard();
  });

  submit.addEventListener("click", async () => {
    if (sent) {
      closeFeedbackCard();
      return;
    }
    const kind = typeSelect.value;
    const text = body.value.replace(/\r\n/g, "\n").trim();
    if (!kind) {
      setHint("Choose a feedback type.");
      return;
    }
    if (feedbackTextLength(text) < FEEDBACK_TEXT_MIN) {
      setHint("Write at least 10 characters.");
      return;
    }
    submit.disabled = true;
    cancel.disabled = true;
    setHint("Sending…");
    try {
      const attachments = [];
      for (const item of feedbackFiles) {
        attachments.push(await uploadFeedbackFile(item.file));
      }
      const response = await fetch(`https://${serverAddress}/submit_feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({
          feedback_type: kind,
          report: text,
          attachments
        }, feedbackContext()))
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not submit.");
      showSent();
    } catch (e) {
      submit.disabled = false;
      cancel.disabled = false;
      setHint(e.message || "Could not submit.");
    }
  });

  top.appendChild(name);
  top.appendChild(close);
  box.appendChild(top);
  box.appendChild(main);
  box.appendChild(bottom);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  feedbackOverlay = overlay;
  paintStrip();
  growFeedbackBody();
  refreshHint();
  typeSelect.focus();
}
