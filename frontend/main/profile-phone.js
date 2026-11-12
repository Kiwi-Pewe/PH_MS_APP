function profilePhoneTiles() {
  return Array.from(document.querySelectorAll(".profile-tile.is-phone"));
}

function profilePhoneTitle(props) {
  const title = String((props && props.title) || "").trim();
  return title || "Phone";
}

function profilePhonePreview(el) {
  return !!(el && el.closest && el.closest(".is-opt-preview"));
}

function bindProfilePhonePointer(el) {
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener("pointerdown", stop);
  el.addEventListener("mousedown", stop);
  el.addEventListener("click", stop);
}

function paintProfilePhoneAttachPreviews() {
  profilePhoneTiles().forEach((el) => {
    const state = el._profilePhone;
    if (state && state.attachPreview && typeof fillAttachPreview === "function") {
      fillAttachPreview(state.attachPreview);
    }
  });
}

function paintProfilePhoneComposer(state) {
  const wrap = document.createElement("div");
  wrap.className = "profile-chat-room-compose-wrap";
  const preview = document.createElement("div");
  preview.className = "attach-preview";
  preview.hidden = true;
  bindProfilePhonePointer(preview);
  const row = document.createElement("div");
  row.className = "profile-chat-room-compose";
  bindProfilePhonePointer(row);
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "icon-btn profile-chat-room-icon";
  plus.textContent = "+";
  plus.title = "Attach image or video";
  plus.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (plus.disabled || profilePhonePreview(wrap)) return;
    if (typeof attachDestination !== "undefined") attachDestination = "composer";
    if (typeof openMediaPicker === "function") openMediaPicker();
  });
  const input = document.createElement("textarea");
  input.className = "profile-chat-room-input";
  input.rows = 1;
  input.placeholder = "Message";
  input.addEventListener("paste", (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length) return;
    e.preventDefault();
    if (typeof attachDestination !== "undefined") attachDestination = "composer";
    if (typeof setPendingFile === "function") setPendingFile(files[0]);
  });
  const emoji = document.createElement("button");
  emoji.type = "button";
  emoji.className = "icon-btn profile-chat-room-icon";
  emoji.textContent = "\u{1F600}";
  emoji.title = "Emoji";
  emoji.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (emoji.disabled || profilePhonePreview(wrap)) return;
    if (typeof openEmojiPicker === "function") openEmojiPicker(emoji, input, e.clientX, e.clientY);
  });
  const send = document.createElement("button");
  send.type = "button";
  send.className = "pill-btn profile-chat-room-send";
  send.textContent = "Send";
  function fire() {
    if (profilePhonePreview(wrap) || input.disabled) return;
    if (typeof sendCommunityPhoneMessage === "function") sendCommunityPhoneMessage(input);
  }
  send.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fire();
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    fire();
  });
  const leftRule = document.createElement("div");
  leftRule.className = "profile-chat-room-compose-rule";
  const rightRule = document.createElement("div");
  rightRule.className = "profile-chat-room-compose-rule";
  row.appendChild(plus);
  row.appendChild(leftRule);
  row.appendChild(input);
  row.appendChild(rightRule);
  row.appendChild(emoji);
  row.appendChild(send);
  wrap.appendChild(preview);
  wrap.appendChild(row);
  state.input = input;
  state.sendBtn = send;
  state.plusBtn = plus;
  state.emojiBtn = emoji;
  state.attachPreview = preview;
  return wrap;
}

function paintProfilePhoneLanding(host, state) {
  host.replaceChildren();
  const landing = document.createElement("div");
  landing.className = "community-phone-landing profile-phone-landing";
  const top = document.createElement("div");
  top.className = "community-phone-space";
  const mid = document.createElement("div");
  mid.className = "community-garter-body";
  const warn = document.createElement("p");
  warn.className = "community-phone-warn";
  const actions = document.createElement("div");
  actions.className = "community-phone-actions";
  const start = document.createElement("button");
  start.type = "button";
  start.className = "pill-btn";
  bindProfilePhonePointer(start);
  start.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (profilePhonePreview(host)) return;
    if (typeof startCommunityPhone === "function") startCommunityPhone();
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-btn";
  cancel.textContent = "Cancel";
  bindProfilePhonePointer(cancel);
  cancel.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (profilePhonePreview(host)) return;
    if (typeof cancelCommunityPhone === "function") cancelCommunityPhone();
  });
  actions.appendChild(start);
  actions.appendChild(cancel);
  const wait = document.createElement("div");
  wait.className = "community-phone-wait";
  wait.appendChild(document.createElement("span"));
  wait.appendChild(document.createElement("span"));
  wait.appendChild(document.createElement("span"));
  mid.appendChild(warn);
  mid.appendChild(actions);
  mid.appendChild(wait);
  const slot = document.createElement("div");
  slot.className = "community-phone-space community-phone-topics-slot";
  const topics = document.createElement("div");
  topics.className = "community-phone-topics";
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "community-search";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Add a topic";
  bindProfilePhonePointer(input);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (profilePhonePreview(host)) return;
    if (typeof saveCommunityPhoneTopic === "function") saveCommunityPhoneTopic("POST", input.value);
  });
  const status = document.createElement("p");
  status.className = "community-phone-topic-status";
  const help = document.createElement("p");
  help.className = "community-list-help community-phone-topic-help";
  help.textContent = "Choose up to 5 topics you like to possibly get paired with someone who has the same topics.";
  topics.appendChild(pills);
  topics.appendChild(input);
  topics.appendChild(status);
  topics.appendChild(help);
  slot.appendChild(topics);
  landing.appendChild(top);
  landing.appendChild(mid);
  landing.appendChild(slot);
  host.appendChild(landing);
  state.warn = warn;
  state.startBtn = start;
  state.cancelBtn = cancel;
  state.waitEl = wait;
  state.topicPills = pills;
  state.topicInput = input;
  state.topicStatus = status;
}

function paintProfilePhoneChat(host, state) {
  host.replaceChildren();
  const head = document.createElement("div");
  head.className = "profile-chat-room-chat-head profile-phone-chat-head";
  const name = document.createElement("div");
  name.className = "profile-chat-room-chat-title";
  bindProfilePhonePointer(name);
  name.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (profilePhonePreview(host)) return;
    const partner = typeof communityPhoneCall !== "undefined" && communityPhoneCall && communityPhoneCall.partner;
    if (partner && typeof communityPhonePartnerHidden === "function" && !communityPhonePartnerHidden() && typeof openMiniProfile === "function") {
      openMiniProfile(partner.id, name);
    }
  });
  name.addEventListener("contextmenu", (e) => {
    if (profilePhonePreview(host)) return;
    if (typeof openCommunityPhoneMenu === "function") openCommunityPhoneMenu(e);
  });
  const friend = document.createElement("p");
  friend.className = "community-phone-friend profile-phone-friend";
  const end = document.createElement("button");
  end.type = "button";
  end.className = "call-leave";
  end.textContent = "End Chat";
  bindProfilePhonePointer(end);
  end.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (profilePhonePreview(host)) return;
    if (typeof endCommunityPhone === "function") endCommunityPhone();
  });
  head.appendChild(name);
  head.appendChild(friend);
  head.appendChild(end);
  const starter = document.createElement("p");
  starter.className = "community-phone-starter";
  const log = document.createElement("div");
  log.className = "profile-chat-room-log";
  if (typeof applyChatLogSelfSide === "function") applyChatLogSelfSide(log);
  else log.classList.add("self-right");
  host.appendChild(head);
  host.appendChild(starter);
  host.appendChild(log);
  state.partnerEl = name;
  state.friendEl = friend;
  state.starterEl = starter;
  state.log = log;
}

function syncProfilePhoneLanding(state) {
  const searching = typeof communityPhoneWaiting !== "undefined" && !!communityPhoneWaiting;
  const busy = typeof communityPhoneBusy !== "undefined" && !!communityPhoneBusy;
  const warning = typeof communityPhoneWarning !== "undefined" ? communityPhoneWarning : "";
  if (state.warn) {
    state.warn.hidden = !warning;
    state.warn.textContent = warning || "";
  }
  if (state.startBtn) {
    state.startBtn.disabled = searching || busy || profilePhonePreview(state.root);
    state.startBtn.textContent = searching ? "Finding someone" : "Find someone";
  }
  if (state.cancelBtn) {
    state.cancelBtn.hidden = !searching;
    state.cancelBtn.disabled = busy;
  }
  if (state.waitEl) state.waitEl.hidden = !searching;
  const topics = typeof communityPhoneTopics !== "undefined" && Array.isArray(communityPhoneTopics) ? communityPhoneTopics : [];
  const call = typeof communityPhoneCall !== "undefined" && communityPhoneCall;
  const locked = !!(searching || call || busy || profilePhonePreview(state.root));
  const full = topics.length >= 5;
  if (state.topicInput) {
    state.topicInput.disabled = locked || full;
    state.topicInput.placeholder = full ? "5 of 5 topics chosen" : "Add a topic";
  }
  const note = typeof communityPhoneTopicStatus !== "undefined" ? communityPhoneTopicStatus : "";
  if (state.topicStatus) {
    state.topicStatus.hidden = !note;
    state.topicStatus.textContent = note || "";
  }
  if (!state.topicPills) return;
  state.topicPills.replaceChildren();
  state.topicPills.hidden = !topics.length;
  topics.forEach((topic) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Remove";
    pill.disabled = locked;
    pill.textContent = topic + " ×";
    bindProfilePhonePointer(pill);
    pill.addEventListener("click", () => {
      if (profilePhonePreview(state.root)) return;
      if (typeof saveCommunityPhoneTopic === "function") saveCommunityPhoneTopic("DELETE", topic);
    });
    state.topicPills.appendChild(pill);
  });
}

function syncProfilePhoneFriend(state) {
  const el = state.friendEl;
  if (!el) return;
  const note = typeof communityPhoneFriendNote !== "undefined" ? communityPhoneFriendNote : "";
  el.replaceChildren();
  el.hidden = !note;
  if (!note) return;
  const text = document.createElement("span");
  text.textContent = note;
  el.appendChild(text);
  const call = typeof communityPhoneCall !== "undefined" ? communityPhoneCall : null;
  if (!call || call.friend_state !== "in") return;
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "pill-btn";
  accept.textContent = "Accept";
  bindProfilePhonePointer(accept);
  accept.addEventListener("click", () => {
    if (profilePhonePreview(state.root)) return;
    if (typeof saveCommunityPhoneFriend === "function") saveCommunityPhoneFriend("/friend/accept");
  });
  const decline = document.createElement("button");
  decline.type = "button";
  decline.className = "ghost-btn";
  decline.textContent = "Decline";
  bindProfilePhonePointer(decline);
  decline.addEventListener("click", () => {
    if (profilePhonePreview(state.root)) return;
    if (typeof saveCommunityPhoneFriend === "function") saveCommunityPhoneFriend("/friend/decline");
  });
  el.appendChild(decline);
  el.appendChild(accept);
}

function syncProfilePhoneChat(state) {
  const call = typeof communityPhoneCall !== "undefined" ? communityPhoneCall : null;
  const partner = call && call.partner;
  const hidden = typeof communityPhonePartnerHidden === "function" && communityPhonePartnerHidden();
  if (state.partnerEl) {
    state.partnerEl.textContent = partner ? (partner.display_name || partner.username || "Caller") : "Phone a User";
    state.partnerEl.classList.toggle("is-hidden-caller", !!hidden);
  }
  const shared = (call && call.shared_topics) || [];
  if (state.starterEl) {
    state.starterEl.hidden = !shared.length;
    state.starterEl.textContent = shared.length ? "You both like: " + shared.join(", ") : "";
  }
  syncProfilePhoneFriend(state);
  const messages = typeof communityPhoneMessages !== "undefined" ? communityPhoneMessages : [];
  if (state.log) {
    if (typeof paintProfileChatLog === "function") paintProfileChatLog(state.log, messages);
    else if (typeof renderClusteredMessages === "function") {
      state.log.replaceChildren();
      renderClusteredMessages(state.log, messages);
    }
  }
  if (state.input) {
    const name = partner ? (partner.display_name || partner.username || "Caller") : "Message";
    state.input.placeholder = "Message " + name;
    state.input.disabled = false;
  }
  if (state.sendBtn) state.sendBtn.disabled = false;
  if (state.plusBtn) state.plusBtn.disabled = false;
  if (state.emojiBtn) state.emojiBtn.disabled = false;
}

function syncProfilePhone(state) {
  if (!state || !state.root) return;
  const inCall = !!(typeof communityPhoneCall !== "undefined" && communityPhoneCall);
  state.root.classList.toggle("has-compose", inCall);
  if (inCall) {
    if (state.view !== "chat") {
      paintProfilePhoneChat(state.body, state);
      state.view = "chat";
    }
    syncProfilePhoneChat(state);
    return;
  }
  if (state.view !== "landing") {
    paintProfilePhoneLanding(state.body, state);
    state.view = "landing";
  }
  if (state.input) state.input.disabled = true;
  if (state.sendBtn) state.sendBtn.disabled = true;
  if (state.plusBtn) state.plusBtn.disabled = true;
  if (state.emojiBtn) state.emojiBtn.disabled = true;
  syncProfilePhoneLanding(state);
}

function paintProfilePhoneTiles() {
  profilePhoneTiles().forEach((el) => {
    if (el._profilePhone) syncProfilePhone(el._profilePhone);
  });
}

function paintProfilePhone(tile, el) {
  const props = typeof defaultProfileTileProps === "function"
    ? defaultProfileTileProps("phone", tile && tile.props)
    : (tile && tile.props) || {};
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(props, "phone") : null;
  if (chrome && typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, chrome);
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  const showTitle = props.show_title !== false;
  if (showTitle) {
    const align = props.title_align === "center" || props.title_align === "right" ? props.title_align : "left";
    el.dataset.titleAlign = align;
  } else {
    delete el.dataset.titleAlign;
  }
  const root = document.createElement("div");
  root.className = "profile-chat-room profile-phone" + (showTitle ? " has-title" : "");
  if (showTitle) {
    const head = document.createElement("div");
    head.className = "profile-chat-room-head";
    const title = document.createElement("div");
    title.className = "oneira-wall-title";
    title.textContent = profilePhoneTitle(props);
    head.appendChild(title);
    root.appendChild(head);
  }
  const body = document.createElement("div");
  body.className = "profile-chat-room-body";
  root.appendChild(body);
  const state = {
    tile,
    root,
    body,
    view: "",
    input: null,
    sendBtn: null
  };
  root.appendChild(paintProfilePhoneComposer(state));
  el.appendChild(root);
  el._profilePhone = state;
  el._profilePhoneTile = tile;
  syncProfilePhone(state);
  if (!profilePhonePreview(el) && typeof loadCommunityPhone === "function" && !paintProfilePhone.asked) {
    paintProfilePhone.asked = true;
    loadCommunityPhone();
  }
}
