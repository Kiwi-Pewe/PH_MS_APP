function memberListIsVisible() {
  const grid = document.getElementById("main-grid");
  return !!(grid && grid.classList.contains("has-member-list"));
}

function syncChatSearchPlacement() {
  const hasMembers = memberListIsVisible();
  const headerSlot = document.getElementById("chat-search-slot");
  const railSlot = document.getElementById("user-list-search");
  if (headerSlot) headerSlot.hidden = hasMembers;
  if (railSlot) railSlot.hidden = !hasMembers;
}

function setChatSearchPlaceholder(text) {
  const value = (text || "Search").trim() || "Search";
  const chatInput = document.getElementById("chat-search-input");
  const railInput = document.getElementById("rail-search-input");
  if (chatInput) chatInput.placeholder = value;
  if (railInput) railInput.placeholder = value;
}

syncChatSearchPlacement();
