// ==================================================================
// docs.js - Doc channel: one page, View / Edit, lock, save, toolbar.
// ==================================================================

let docsLastGoodHtml = "";

function docsPage() {
  return document.getElementById("docs-page");
}

function visibleDocLength() {
  return (docsPage().innerText || "").replace(/\n$/, "").length;
}

function updateDocsChrome() {
  const banner = document.getElementById("docs-editing-banner");
  const modeBtn = document.getElementById("docs-mode-btn");
  const saveBtn = document.getElementById("docs-save-btn");
  const toolbar = document.getElementById("docs-toolbar");
  const someoneElse = docsEditorId && docsEditorId !== myUserId;

  banner.style.display = (docsMode === "view" && docsEditorUsername) ? "block" : "none";
  banner.textContent = docsEditorUsername ? `${docsEditorUsername} is editing the page` : "";

  modeBtn.style.display = docsCanEdit ? "inline-flex" : "none";
  modeBtn.textContent = docsMode === "edit" ? "Edit" : "View";
  modeBtn.disabled = Boolean(someoneElse);
  modeBtn.title = someoneElse ? `${docsEditorUsername} is editing the page` : "Switch mode";

  saveBtn.style.display = (docsMode === "edit" && docsDirty) ? "inline-flex" : "none";
  toolbar.style.display = docsMode === "edit" ? "flex" : "none";
}

function setDocsPageEditable(on) {
  const page = docsPage();
  page.contentEditable = on ? "true" : "false";
  if (on) page.focus();
}

function hideDocsChrome() {
  document.getElementById("docs-view").style.display = "none";
  document.getElementById("docs-toolbar").style.display = "none";
  document.getElementById("docs-save-btn").style.display = "none";
  document.getElementById("docs-mode-btn").style.display = "none";
  document.getElementById("docs-editing-banner").style.display = "none";
  setDocsPageEditable(false);
  docsMode = "view";
  docsDirty = false;
  docsCanEdit = false;
  docsEditorId = null;
  docsEditorUsername = null;
  docsSavedHtml = "";
}

async function leaveDocIfNeeded() {
  if (docsMode !== "edit") return true;
  if (docsDirty && !confirm("Leave without saving?")) return false;
  await requestDocUnlock();
  docsMode = "view";
  docsDirty = false;
  return true;
}

async function loadDoc(channelId) {
  docsMode = "view";
  docsDirty = false;
  setDocsPageEditable(false);
  try {
    const response = await fetch(`https://${serverAddress}/get_doc/${channelId}`, { credentials: "include" });
    if (!response.ok) {
      docsPage().innerHTML = "";
      updateDocsChrome();
      return;
    }
    const data = await response.json();
    docsSavedHtml = data.content || "";
    docsLastGoodHtml = docsSavedHtml;
    docsPage().innerHTML = docsSavedHtml;
    docsCanEdit = Boolean(data.can_edit);
    docsEditorId = data.editor_id;
    docsEditorUsername = data.editor_username;
  } catch (e) {
    docsPage().innerHTML = "";
  }
  updateDocsChrome();
}

async function enterDocEdit() {
  if (docsMode === "edit" || !docsCanEdit || (docsEditorId && docsEditorId !== myUserId)) return;
  try {
    const response = await fetch(`https://${serverAddress}/lock_doc/${currentChannelId}`, {
      method: "POST", credentials: "include"
    });
    if (!response.ok) return;
    const data = await response.json();
    docsEditorId = data.editor_id;
    docsEditorUsername = data.editor_username;
    docsMode = "edit";
    docsDirty = false;
    setDocsPageEditable(true);
    updateDocsChrome();
  } catch (e) { /* stay in View */ }
}

async function exitDocEdit() {
  if (docsMode !== "edit") return;
  if (docsDirty && !confirm("Leave without saving?")) return;
  await requestDocUnlock();
  docsPage().innerHTML = docsSavedHtml;
  docsMode = "view";
  docsDirty = false;
  docsEditorId = null;
  docsEditorUsername = null;
  setDocsPageEditable(false);
  updateDocsChrome();
}

async function requestDocUnlock() {
  if (!currentChannelId) return;
  try {
    await fetch(`https://${serverAddress}/unlock_doc/${currentChannelId}`, {
      method: "POST", credentials: "include"
    });
  } catch (e) { /* disconnect path also releases */ }
}

async function saveDoc() {
  if (docsMode !== "edit" || !docsDirty) return;
  const html = docsPage().innerHTML;
  try {
    const response = await fetch(`https://${serverAddress}/save_doc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ channel_id: currentChannelId, content: html })
    });
    if (!response.ok) return;
    docsSavedHtml = html;
    docsLastGoodHtml = html;
    docsDirty = false;
    updateDocsChrome();
  } catch (e) { /* keep dirty so they can retry */ }
}

function markDocsDirty() {
  if (docsMode !== "edit") return;
  if (visibleDocLength() > 3500) {
    docsPage().innerHTML = docsLastGoodHtml;
    return;
  }
  const html = docsPage().innerHTML;
  docsLastGoodHtml = html;
  docsDirty = html !== docsSavedHtml;
  updateDocsChrome();
}

function applyDocCommand(cmd, value) {
  if (docsMode !== "edit") return;
  document.execCommand(cmd, false, value);
  markDocsDirty();
  docsPage().focus();
}

function applyDocFontSize(pt) {
  if (docsMode !== "edit") return;
  document.execCommand("fontSize", false, "7");
  docsPage().querySelectorAll("font[size='7']").forEach(el => {
    const span = document.createElement("span");
    span.style.fontSize = pt + "pt";
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
  });
  markDocsDirty();
  docsPage().focus();
}

function applyDocStyle(name) {
  if (docsMode !== "edit") return;
  if (name === "title") {
    document.execCommand("formatBlock", false, "p");
    const block = window.getSelection().anchorNode;
    const el = block && block.nodeType === 3 ? block.parentElement : block;
    if (el && docsPage().contains(el)) {
      const p = el.closest("p") || el;
      p.className = "doc-title";
    }
  } else if (name === "normal") {
    document.execCommand("formatBlock", false, "p");
    const block = window.getSelection().anchorNode;
    const el = block && block.nodeType === 3 ? block.parentElement : block;
    if (el && docsPage().contains(el)) {
      const p = el.closest("p") || el;
      p.classList.remove("doc-title");
    }
  } else {
    document.execCommand("formatBlock", false, name);
  }
  markDocsDirty();
  docsPage().focus();
}

function handleDocLocked(data) {
  if (currentChannelType !== "doc" || currentChannelId !== data.channel_id) return;
  docsEditorId = data.editor_id;
  docsEditorUsername = data.editor_username;
  updateDocsChrome();
}

function handleDocUnlocked(data) {
  if (currentChannelType !== "doc" || currentChannelId !== data.channel_id) return;
  if (docsMode === "edit") return;
  docsEditorId = null;
  docsEditorUsername = null;
  updateDocsChrome();
}

function handleDocUpdated(data) {
  if (currentChannelType !== "doc" || currentChannelId !== data.channel_id) return;
  if (docsMode === "edit") return;
  docsSavedHtml = data.content || "";
  docsPage().innerHTML = docsSavedHtml;
}

document.getElementById("docs-mode-btn").addEventListener("click", (e) => {
  if (document.getElementById("docs-mode-btn").disabled) return;
  const rect = e.currentTarget.getBoundingClientRect();
  openContextMenu(rect.left, rect.bottom, null, [
    { label: "View", disabled: docsMode === "view", onSelect: () => exitDocEdit() },
    { label: "Edit", disabled: docsMode === "edit", onSelect: () => enterDocEdit() }
  ]);
});

document.getElementById("docs-save-btn").addEventListener("click", saveDoc);

document.getElementById("docs-style-select").addEventListener("change", (e) => applyDocStyle(e.target.value));
document.getElementById("docs-font-select").addEventListener("change", (e) => applyDocCommand("fontName", e.target.value));
document.getElementById("docs-size-select").addEventListener("change", (e) => applyDocFontSize(e.target.value));
document.getElementById("docs-bold-btn").addEventListener("click", () => applyDocCommand("bold"));
document.getElementById("docs-italic-btn").addEventListener("click", () => applyDocCommand("italic"));
document.getElementById("docs-underline-btn").addEventListener("click", () => applyDocCommand("underline"));
document.getElementById("docs-align-left-btn").addEventListener("click", () => applyDocCommand("justifyLeft"));
document.getElementById("docs-align-center-btn").addEventListener("click", () => applyDocCommand("justifyCenter"));
document.getElementById("docs-align-right-btn").addEventListener("click", () => applyDocCommand("justifyRight"));

docsPage().addEventListener("input", markDocsDirty);
docsPage().addEventListener("paste", (e) => {
  if (docsMode !== "edit") return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, text);
  markDocsDirty();
});

window.addEventListener("pagehide", () => {
  if (docsMode === "edit" && currentChannelId) {
    fetch(`https://${serverAddress}/unlock_doc/${currentChannelId}`, {
      method: "POST", credentials: "include", keepalive: true
    });
  }
});
