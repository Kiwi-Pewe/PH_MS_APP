const SERVER_LISTING_TAG_MAX = 5;
const SERVER_LISTING_TAG_LEN = 15;

function savedServerListingTags() {
  if (currentServerData && currentServerId && Array.isArray(currentServerData.tags)) {
    return currentServerData.tags.slice();
  }
  const listed = (typeof serverList !== "undefined" ? serverList : []).find((row) => row && String(row.id) === String(currentServerId));
  return listed && Array.isArray(listed.tags) ? listed.tags.slice() : [];
}

function cleanServerListingTag(value) {
  let text = String(value || "").trim().toLowerCase().replace(/^#+/, "");
  text = text.replace(/[^a-z0-9-]+/g, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (!text || text.length > SERVER_LISTING_TAG_LEN) return "";
  if (!new RegExp("^[a-z0-9](?:[a-z0-9-]{0," + String(SERVER_LISTING_TAG_LEN - 2) + "}[a-z0-9])?$").test(text)) return "";
  return text;
}

function setServerListingTagsStatus(text) {
  const status = document.getElementById("server-settings-tags-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

async function saveServerListingTags(tags) {
  if (!currentServerId || (typeof canUpdateServer === "function" && !canUpdateServer())) return;
  const next = [];
  (tags || []).forEach((tag) => {
    const clean = cleanServerListingTag(tag);
    if (clean && next.indexOf(clean) < 0 && next.length < SERVER_LISTING_TAG_MAX) next.push(clean);
  });
  const previous = savedServerListingTags();
  if (typeof applyServerTags === "function") applyServerTags(currentServerId, next);
  setServerListingTagsStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_tags`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, tags: next })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save tags.");
    if (typeof applyServerTags === "function") applyServerTags(currentServerId, data.tags || next);
  } catch (e) {
    if (typeof applyServerTags === "function") applyServerTags(currentServerId, previous);
    setServerListingTagsStatus(e.message || "Could not save tags.");
  }
}

function addServerListingTag(value) {
  const tag = cleanServerListingTag(value);
  if (!tag) return;
  const tags = savedServerListingTags();
  if (tags.indexOf(tag) >= 0) return;
  if (tags.length >= SERVER_LISTING_TAG_MAX) {
    setServerListingTagsStatus("You can use up to 5 tags.");
    return;
  }
  tags.push(tag);
  saveServerListingTags(tags);
}

function paintServerListingTags() {
  const picks = document.getElementById("server-settings-tag-picks");
  const input = document.getElementById("server-settings-tag-input");
  const add = document.getElementById("server-settings-tag-add");
  const tags = savedServerListingTags();
  const locked = typeof canUpdateServer === "function" && !canUpdateServer();
  if (picks) {
    picks.replaceChildren();
    tags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "server-listing-tag is-on";
      chip.textContent = tag;
      chip.disabled = locked;
      chip.addEventListener("click", () => {
        saveServerListingTags(tags.filter((item) => item !== tag));
      });
      picks.appendChild(chip);
    });
  }
  if (input) input.disabled = locked;
  if (add) add.disabled = locked;
}

(function bindServerListingTags() {
  const input = document.getElementById("server-settings-tag-input");
  const add = document.getElementById("server-settings-tag-add");
  if (add) {
    add.addEventListener("click", () => {
      if (!input) return;
      addServerListingTag(input.value);
      input.value = "";
    });
  }
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      addServerListingTag(input.value);
      input.value = "";
    });
  }
})();
