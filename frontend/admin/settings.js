function openSettingsKofiConnect() {
  const body = adminEl("div", "admin-settings-fields");
  body.appendChild(adminEl("div", "users-field-k", "Webhook URL"));
  const hook = adminEl("input", "admin-mod-input");
  hook.type = "text";
  hook.readOnly = true;
  hook.value = "https://" + API_HOST + "/kofi/webhook";
  body.appendChild(hook);
  body.appendChild(adminEl("div", "users-field-k", "Verification token"));
  const token = adminEl("input", "admin-mod-input");
  token.type = "text";
  token.placeholder = "From Ko-fi → Webhooks";
  body.appendChild(token);
  openAdminMod({
    title: "Connect Ko-fi",
    cancel: "Cancel",
    confirm: "Connect",
    body: body,
    onConfirm: function () {
      const value = (token.value || "").trim();
      if (!value) {
        adminModError("Verification token is required.");
        return;
      }
      const save = document.getElementById("admin-mod-confirm");
      if (save) save.disabled = true;
      adminApi("/admin/kofi/connect", {
        method: "POST",
        body: { verification_token: value }
      }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
        if (save) save.disabled = false;
        if (!result.ok) {
          const detail = result.data && result.data.detail;
          adminModError(typeof detail === "string" ? detail : "Could not connect Ko-fi.");
          return;
        }
        closeAdminMod();
        if (adminPage === "settings") paintAdminMain();
      }).catch(() => {
        if (save) save.disabled = false;
        adminModError("Could not connect Ko-fi.");
      });
    }
  });
  window.setTimeout(() => token.focus(), 0);
}

function disconnectSettingsKofi() {
  adminApi("/admin/kofi/disconnect", { method: "POST" }).then((response) => {
    if (!response.ok) return;
    if (adminPage === "settings") paintAdminMain();
  }).catch(() => {});
}

function paintSettingsKofi(main, status) {
  const connected = !!(status && status.connected);
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Settings", "Ko-fi"],
    title: "Ko-fi",
    note: "Site donations. Payments stay on Ko-fi. Oneira reads what the webhook sends."
  }));
  const link = adminPanel({ title: "Connection", meta: connected ? "Connected" : "Not connected" });
  link.body.classList.add("admin-settings-fields");
  const row = adminEl("div", "admin-settings-connect");
  const copy = adminEl("div", "admin-settings-connect-copy");
  copy.appendChild(adminEl("div", "admin-settings-connect-name", "Ko-fi"));
  let sub = connected ? "Webhook is on. Donations and memberships will land on Donate." : "Paste the verification token from Ko-fi → Webhooks.";
  if (status && status.last_webhook_at) {
    sub = status.last_webhook_ok ? "Last webhook was accepted." : "A webhook arrived but was not accepted. Check the verification token.";
  }
  copy.appendChild(adminEl("div", "admin-settings-connect-sub", sub));
  row.appendChild(copy);
  const action = adminEl("button", connected ? "admin-mod-cancel" : "admin-mod-confirm");
  action.type = "button";
  action.textContent = connected ? "Disconnect" : "Connect";
  action.addEventListener("click", connected ? disconnectSettingsKofi : openSettingsKofiConnect);
  row.appendChild(action);
  link.body.appendChild(row);
  const stack = adminEl("div", "admin-settings-stack");
  stack.appendChild(link.panel);
  const card = adminPanel({ title: "Leave-site card", meta: "News → Donate" });
  card.body.classList.add("admin-settings-fields");
  card.body.appendChild(adminEl("div", "users-field-k", "Ko-fi page"));
  const url = adminEl("input", "admin-mod-input");
  url.type = "url";
  url.placeholder = "https://ko-fi.com/yourpage";
  url.value = (status && status.page_url) || "";
  card.body.appendChild(url);
  card.body.appendChild(adminEl("div", "users-field-k", "Disclaimer"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  area.placeholder = "Shown on the leave-site card before Ko-fi opens.";
  area.value = (status && status.disclaimer) || "";
  card.body.appendChild(area);
  const err = adminEl("p", "admin-settings-error");
  err.hidden = true;
  card.body.appendChild(err);
  const actions = adminEl("div", "admin-settings-actions");
  const save = adminEl("button", "admin-mod-confirm");
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    err.hidden = true;
    err.textContent = "";
    save.disabled = true;
    adminApi("/admin/kofi/card", {
      method: "POST",
      body: { page_url: url.value, disclaimer: area.value }
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      save.disabled = false;
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        err.textContent = typeof detail === "string" ? detail : "Could not save the leave-site card.";
        err.hidden = false;
        return;
      }
      if (result.data && result.data.page_url != null) url.value = result.data.page_url;
      if (result.data && result.data.disclaimer != null) area.value = result.data.disclaimer;
    }).catch(() => {
      save.disabled = false;
      err.textContent = "Could not save the leave-site card.";
      err.hidden = false;
    });
  });
  const preview = adminEl("button", "admin-mod-cancel");
  preview.type = "button";
  preview.textContent = "Preview leave-site card";
  preview.addEventListener("click", () => {
    if (typeof openNewsDonateCard === "function") openNewsDonateCard(area.value, url.value);
  });
  actions.appendChild(save);
  actions.appendChild(preview);
  card.body.appendChild(actions);
  stack.appendChild(card.panel);
  main.appendChild(stack);
}

const SETTINGS_AUTOMOD_SURFACES = [
  { id: "posts", label: "Posts", sub: "Community post body and topics." },
  { id: "comments", label: "Comments", sub: "Comments on Community posts." },
  { id: "rooms", label: "Rooms", sub: "Room names, descriptions, topics, and messages." },
  { id: "phone", label: "Phone", sub: "Phone a User messages." },
  { id: "listings", label: "Listings", sub: "Public server names, descriptions, and topics." }
];

function settingsAutomodDefault() {
  const surfaces = {};
  SETTINGS_AUTOMOD_SURFACES.forEach((row) => {
    surfaces[row.id] = true;
  });
  return { enabled: true, blacklist: [], watchlist: [], surfaces: surfaces };
}

function settingsStillAutomod() {
  return adminPage === "settings" && adminSection === "automod";
}

function reloadSettingsAutomod() {
  const host = document.getElementById("admin-main");
  if (!host || !settingsStillAutomod()) return;
  adminApi("/admin/automod").then((response) => response.ok ? response.json() : null).then((data) => {
    if (!settingsStillAutomod()) return;
    host.innerHTML = "";
    paintSettingsAutomod(host, data || settingsAutomodDefault());
  }).catch(() => {});
}

function saveSettingsAutomod(body) {
  return adminApi("/admin/automod", { method: "POST", body: body }).then((response) => {
    if (!response.ok) return;
    reloadSettingsAutomod();
  }).catch(() => {});
}

function settingsAutomodTerm(kind, method, label) {
  const word = String(label || "").trim();
  if (method === "POST" && !word) return;
  const path = method === "DELETE"
    ? "/admin/automod/terms?kind=" + encodeURIComponent(kind) + "&label=" + encodeURIComponent(word)
    : "/admin/automod/terms";
  const opts = method === "DELETE" ? { method: "DELETE" } : { method: "POST", body: { kind: kind, label: word } };
  adminApi(path, opts).then((response) => {
    if (!response.ok) return;
    reloadSettingsAutomod();
  }).catch(() => {});
}

function settingsAutomodToggle(title, note, on, onChange) {
  const row = adminEl("div", "admin-settings-opt");
  const copy = adminEl("div", "admin-settings-opt-copy");
  copy.appendChild(adminEl("div", "admin-settings-opt-name", title));
  copy.appendChild(adminEl("div", "admin-settings-opt-sub", note));
  row.appendChild(copy);
  const toggle = usersToggle(on);
  toggle.input.addEventListener("change", () => onChange(!!toggle.input.checked));
  row.appendChild(toggle.label);
  return row;
}

function settingsAutomodList(kind, title, note, placeholder, empty, rows) {
  const card = adminPanel({ title: title, meta: (rows || []).length ? String(rows.length) : "Empty" });
  card.body.classList.add("admin-settings-fields");
  card.body.appendChild(adminEl("div", "admin-settings-opt-sub", note));
  const add = adminEl("div", "admin-settings-add");
  const input = adminEl("input", "admin-mod-input");
  input.type = "text";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = placeholder;
  const btn = adminEl("button", "admin-mod-confirm");
  btn.type = "button";
  btn.textContent = "Add";
  const submit = () => {
    const label = String(input.value || "").trim();
    if (!label) return;
    input.value = "";
    settingsAutomodTerm(kind, "POST", label);
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
  add.appendChild(input);
  add.appendChild(btn);
  card.body.appendChild(add);
  const pills = adminEl("div", "admin-settings-pills");
  if (!(rows || []).length) {
    pills.appendChild(adminEl("div", "admin-settings-opt-sub", empty));
  }
  (rows || []).forEach((label) => {
    const pill = adminEl("button", "admin-settings-pill", label + " ×");
    pill.type = "button";
    pill.title = "Remove";
    pill.addEventListener("click", () => settingsAutomodTerm(kind, "DELETE", label));
    pills.appendChild(pill);
  });
  card.body.appendChild(pills);
  return card.panel;
}

function paintSettingsAutomod(main, status) {
  const data = status || settingsAutomodDefault();
  const surfaces = data.surfaces || {};
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Settings", "Auto mod"],
    title: "Auto mod",
    note: "Community writes and public listing copy. Blacklisted words are rejected. The Watch List files a silent Auto Report."
  }));
  const detection = adminPanel({ title: "Detection", meta: data.enabled ? "On" : "Off" });
  detection.body.classList.add("admin-settings-fields");
  detection.body.appendChild(settingsAutomodToggle(
    "Auto mod",
    "Off skips both lists. DMs, Parties, and private servers stay out.",
    !!data.enabled,
    (on) => saveSettingsAutomod({ enabled: on })
  ));
  SETTINGS_AUTOMOD_SURFACES.forEach((row) => {
    detection.body.appendChild(settingsAutomodToggle(
      row.label,
      row.sub,
      surfaces[row.id] !== false,
      (on) => {
        const next = {};
        next[row.id] = on;
        saveSettingsAutomod({ surfaces: next });
      }
    ));
  });
  const stack = adminEl("div", "admin-settings-stack");
  stack.appendChild(detection.panel);
  stack.appendChild(settingsAutomodList(
    "blacklist",
    "Blacklisted words",
    "A match is rejected. The person sees a generic error. No Auto Report.",
    "Add a blacklisted word or phrase",
    "No blacklisted words.",
    data.blacklist || []
  ));
  stack.appendChild(settingsAutomodList(
    "watch",
    "Watch List",
    "A match still posts. kiwi gets a silent Auto Report. The author is not told.",
    "Add a watch word or phrase",
    "No Watch List words.",
    data.watchlist || []
  ));
  main.appendChild(stack);
}

function paintAdminSettings(main, sectionId) {
  if (sectionId === "automod") {
    paintSettingsAutomod(main, settingsAutomodDefault());
    reloadSettingsAutomod();
    return;
  }
  paintSettingsKofi(main, null);
  adminApi("/admin/kofi").then((response) => response.ok ? response.json() : null).then((data) => {
    if (adminPage !== "settings" || adminSection !== "kofi") return;
    const host = document.getElementById("admin-main");
    if (!host) return;
    host.innerHTML = "";
    paintSettingsKofi(host, data || { connected: false });
  }).catch(() => {});
}

registerAdminPage({
  id: "settings",
  label: "Settings",
  sections: [
    { id: "kofi", label: "Ko-fi", icon: "plus" },
    { id: "automod", label: "Auto mod", icon: "shield" },
    { id: "community", label: "Community", icon: "share", later: true },
    { id: "site-rules", label: "Site rules", icon: "lock", later: true }
  ],
  paint: paintAdminSettings
});
