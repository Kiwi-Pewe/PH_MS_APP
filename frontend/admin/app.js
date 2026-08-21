let ws = null;
let myId = null;
let myUsername = null;
let serverAddress = null;
let openConversationWith = null;

window.addEventListener("load", () => {
  serverAddress = window.location.host;
  connectSocket();
});

function connectSocket() {
  ws = new WebSocket(`ws://${serverAddress}/ws`);

  ws.onopen = () => {
    document.getElementById("my-id").textContent = myId || "(existing session)";
  };

  ws.onclose = () => {
    ws = null;
    window.location.href = "../login.html";
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }

    if (data.type === "error") {
      document.getElementById("friend-status").textContent = data.detail || "Message rejected.";
      return;
    }
    if (data.type === "friend_request") {
      document.getElementById("friend-status").textContent = `Friend request from ${data.username}.`;
      return;
    }
    if (data.type === "message") {
      if (data.sender_id === openConversationWith) {
        logLine(`${data.username}: ${data.content}`, "incoming");
      } else {
        document.getElementById("friend-status").textContent = `New message from ${data.username}.`;
      }
    }
  };
}

async function logout() {
  try {
    await fetch(`http://${serverAddress}/logout`, { method: "POST", credentials: "include" });
  } catch (e) { /* tear down locally regardless */ }
  if (ws) { ws.close(); ws = null; }
  window.location.href = "../login.html";
}

function sendMessage() {
  const receiverId = document.getElementById("receiver-id").value;
  const contentInput = document.getElementById("content");
  const content = contentInput.value;
  if (!receiverId || !content) return;

  ws.send(JSON.stringify({ type: "message", receiver_id: parseInt(receiverId), content: content }));

  if (parseInt(receiverId) === openConversationWith) {
    logLine(`${myUsername || "You"}: ${content}`, "outgoing");
  }
  contentInput.value = "";
}

async function apiPost(path, body) {
  const status = document.getElementById("friend-status");
  try {
    const response = await fetch(`http://${serverAddress}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      status.textContent = err.detail || `Failed (${response.status}).`;
      return null;
    }
    status.textContent = "Done.";
    return response.json().catch(() => ({}));
  } catch (e) {
    status.textContent = "Could not reach server.";
    return null;
  }
}

function getTargetId() {
  const raw = document.getElementById("receiver-id").value;
  const status = document.getElementById("friend-status");
  if (!raw) { status.textContent = "Enter a target account ID first."; return null; }
  return parseInt(raw);
}

function sendFriendRequest() {
  const username = document.getElementById("friend-username").value;
  const status = document.getElementById("friend-status");
  if (!username) { status.textContent = "Enter a username first."; return; }
  apiPost("/friend_user", { username: username });
}

function removeFriend() {
  const targetId = getTargetId();
  if (targetId === null) return;
  apiPost("/unfriend_user", { user_id_2: targetId });
}

function blockUser() {
  const targetId = getTargetId();
  if (targetId === null) return;
  apiPost("/block", { blocked_user: targetId });
}

function unblockUser() {
  const targetId = getTargetId();
  if (targetId === null) return;
  apiPost("/unblock", { blocked_user: targetId });
}

async function loadConversation() {
  const targetId = getTargetId();
  if (targetId === null) return;
  const status = document.getElementById("friend-status");

  try {
    const response = await fetch(`http://${serverAddress}/messages/${targetId}`, { credentials: "include" });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      status.textContent = err.detail || `Failed to load conversation (${response.status}).`;
      return;
    }

    openConversationWith = targetId;
    const data = await response.json();
    const otherUsername = data.other_username;
    myUsername = data.session_username;
    const history = data.messages;
    document.getElementById("log").innerHTML = "";

    status.textContent = history.length === 0
      ? `Viewing conversation with ${otherUsername}. No messages yet.`
      : `Viewing conversation with ${otherUsername} (${history.length} message(s)).`;

    history.forEach(msg => {
      const isMine = msg.sender_id !== targetId;
      const who = isMine ? myUsername : otherUsername;
      logLine(`${who}: ${msg.content}`, isMine ? "outgoing" : "incoming");
    });
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

function logLine(text, kind) {
  const log = document.getElementById("log");
  const line = document.createElement("div");
  line.textContent = text;
  line.style.color = kind === "outgoing" ? "var(--text-dim)" : "var(--text)";
  line.style.marginBottom = "6px";
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
