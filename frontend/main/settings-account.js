// ==================================================================
// settings-account.js - Account Info + Password & Security.
// Display name is edited here too until User Profile is filled out;
// the field lives on the account and is seeded from the signup name.
// ==================================================================

let accountSettingsCache = null;
let accountEmailRevealed = false;
let accountPhoneRevealed = false;

function accountSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadAccountSettings(force) {
  if (accountSettingsCache && !force) return accountSettingsCache;
  const response = await fetch(accountSettingsUrl("/account_settings"), { credentials: "include" });
  if (!response.ok) throw new Error("Could not load account settings.");
  accountSettingsCache = await response.json();
  return accountSettingsCache;
}

function accountErrorText(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail) && payload.detail[0] && payload.detail[0].msg) return payload.detail[0].msg;
  return fallback;
}

function formatDeviceWhen(ts) {
  if (!ts) return "";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ts) : new Date(ts);
  const age = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  function ago(n, unit) {
    if (n <= 1) return (unit === "hour" ? "an" : "a") + " " + unit + " ago";
    return n + " " + unit + "s ago";
  }
  if (age < 2 * minute) return "just now";
  if (age < hour) return ago(Math.floor(age / minute), "minute");
  if (age < day) return ago(Math.floor(age / hour), "hour");
  if (age < 30 * day) return ago(Math.floor(age / day), "day");
  if (age < 365 * day) return ago(Math.floor(age / (30 * day)), "month");
  return ago(Math.floor(age / (365 * day)), "year");
}

function applyLocalIdentity(data) {
  if (data.username) {
    myUsername = data.username;
    const top = document.getElementById("topbar-username");
    if (top) top.textContent = data.username;
  }
  if (data.display_name) {
    myDisplayName = data.display_name;
    const footer = document.getElementById("footer-username");
    if (footer) footer.textContent = data.display_name;
    const card = document.getElementById("settings-card-name");
    if (card) card.textContent = data.display_name;
    const letter = document.getElementById("settings-card-letter");
    if (letter && typeof avatarLetter === "function") letter.textContent = avatarLetter(data.display_name);
    const footerLetter = document.getElementById("footer-avatar-letter");
    if (footerLetter && typeof avatarLetter === "function") footerLetter.textContent = avatarLetter(data.display_name);
  }
}

function settingsRow(label, value, actionLabel, onClick) {
  const row = document.createElement("div");
  row.className = "settings-row";
  const left = document.createElement("div");
  left.className = "settings-row-label";
  left.textContent = label;
  const mid = document.createElement("div");
  mid.className = "settings-row-value";
  if (typeof value === "string") {
    mid.textContent = value;
    if (actionLabel === "Add" || !value) mid.classList.add("is-empty");
  } else if (value) mid.appendChild(value);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-row-btn";
  btn.textContent = actionLabel;
  btn.addEventListener("click", onClick);
  row.appendChild(left);
  row.appendChild(mid);
  row.appendChild(btn);
  return row;
}

function settingsLinkRow(label, value, onClick) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "settings-row settings-row-link";
  const left = document.createElement("div");
  left.className = "settings-row-label";
  left.textContent = label;
  const mid = document.createElement("div");
  mid.className = "settings-row-value";
  mid.textContent = value;
  const chev = document.createElement("span");
  chev.className = "settings-row-chevron";
  chev.textContent = ">";
  row.appendChild(left);
  row.appendChild(mid);
  row.appendChild(chev);
  row.addEventListener("click", onClick);
  return row;
}

function openSettingsForm(title, fields, submitLabel, onSubmit) {
  const overlay = document.createElement("div");
  overlay.className = "settings-form-overlay";
  const box = document.createElement("div");
  box.className = "settings-form";
  const heading = document.createElement("h3");
  heading.textContent = title;
  box.appendChild(heading);
  const inputs = {};
  fields.forEach(field => {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = field.type || "text";
    input.value = field.value || "";
    input.autocomplete = field.autocomplete || "off";
    if (field.maxlength) input.maxLength = field.maxlength;
    label.appendChild(input);
    box.appendChild(label);
    inputs[field.name] = input;
  });
  const status = document.createElement("div");
  status.className = "settings-form-status";
  const actions = document.createElement("div");
  actions.className = "settings-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  const save = document.createElement("button");
  save.type = "button";
  save.className = "settings-form-save";
  save.textContent = submitLabel || "Save";
  save.addEventListener("click", async () => {
    const values = {};
    Object.keys(inputs).forEach(name => { values[name] = inputs[name].value; });
    save.disabled = true;
    status.textContent = "";
    try {
      await onSubmit(values);
      overlay.remove();
    } catch (e) {
      status.textContent = e.message || "Could not save.";
      save.disabled = false;
    }
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  box.appendChild(status);
  box.appendChild(actions);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save.click();
  });
  document.body.appendChild(overlay);
  const first = box.querySelector("input");
  if (first) first.focus();
}

function openSettingsConfirm(title, body, actionLabel, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "settings-form-overlay";
  const box = document.createElement("div");
  box.className = "settings-form";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const text = document.createElement("p");
  text.className = "settings-blurb";
  text.textContent = body;
  const actions = document.createElement("div");
  actions.className = "settings-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  const go = document.createElement("button");
  go.type = "button";
  go.className = "settings-danger-btn";
  go.textContent = actionLabel;
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      await onConfirm();
      overlay.remove();
    } catch (e) {
      go.disabled = false;
      window.alert(e.message || "Could not finish that.");
    }
  });
  actions.appendChild(cancel);
  actions.appendChild(go);
  box.appendChild(heading);
  box.appendChild(text);
  box.appendChild(actions);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function postAccount(path, body) {
  const response = await fetch(accountSettingsUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(accountErrorText(data, "Could not save."));
  return data;
}

function maskedFieldNode(info, key, revealed, setRevealed) {
  const wrap = document.createElement("span");
  const raw = info[key] || "";
  const masked = info[key + "_masked"] || raw;
  if (!raw) {
    wrap.textContent = key === "phone" ? "You haven't added a phone number yet." : "You haven't added an email yet.";
    wrap.className = "is-empty";
    return wrap;
  }
  let shown = !!revealed;
  const text = document.createTextNode(shown ? raw : masked);
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "settings-inline-link";
  reveal.textContent = shown ? "Hide" : "Reveal";
  reveal.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    shown = !shown;
    setRevealed(shown);
    text.nodeValue = shown ? raw : masked;
    reveal.textContent = shown ? "Hide" : "Reveal";
  });
  wrap.appendChild(text);
  wrap.appendChild(document.createTextNode(" "));
  wrap.appendChild(reveal);
  return wrap;
}

async function renderAccountSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadAccountSettings(true);
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load account settings.";
    pane.appendChild(note);
    return;
  }

  const block = document.createElement("section");
  block.className = "settings-block";
  block.id = settingsTargetId("account");

  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Account";
  block.appendChild(title);

  const infoWrap = document.createElement("div");
  infoWrap.className = "settings-subblock";
  infoWrap.id = settingsTargetId("account-info");
  const infoTitle = document.createElement("h3");
  infoTitle.className = "settings-subblock-title";
  infoTitle.textContent = "Account Info";
  infoWrap.appendChild(infoTitle);
  infoWrap.appendChild(settingsRow("Username", info.username, "Edit", () => {
    openSettingsForm("Change username", [
      { name: "value", label: "New username", value: info.username, maxlength: 32 },
      { name: "password", label: "Current password", type: "password", autocomplete: "current-password" }
    ], "Save", async (values) => {
      const data = await postAccount("/account_username", { value: values.value, password: values.password });
      accountSettingsCache = Object.assign({}, info, data);
      applyLocalIdentity(data);
      jumpToSettings("account-info");
    });
  }));
  infoWrap.appendChild(settingsRow("Email", maskedFieldNode(info, "email", accountEmailRevealed, (v) => { accountEmailRevealed = v; }), info.email ? "Edit" : "Add", () => {
    openSettingsForm(info.email ? "Change email" : "Add email", [
      { name: "value", label: "Email", value: info.email || "", type: "email" },
      { name: "password", label: "Current password", type: "password", autocomplete: "current-password" }
    ], "Save", async (values) => {
      const data = await postAccount("/account_email", { value: values.value, password: values.password });
      accountSettingsCache = Object.assign({}, info, data);
      jumpToSettings("account-info");
    });
  }));
  infoWrap.appendChild(settingsRow("Phone Number", maskedFieldNode(info, "phone", accountPhoneRevealed, (v) => { accountPhoneRevealed = v; }), info.phone ? "Edit" : "Add", () => {
    openSettingsForm(info.phone ? "Change phone number" : "Add phone number", [
      { name: "value", label: "Phone number", value: info.phone || "" },
      { name: "password", label: "Current password", type: "password", autocomplete: "current-password" }
    ], "Save", async (values) => {
      const data = await postAccount("/account_phone", { value: values.value, password: values.password });
      accountSettingsCache = Object.assign({}, info, data);
      jumpToSettings("account-info");
    });
  }));
  block.appendChild(infoWrap);

  const sec = document.createElement("div");
  sec.className = "settings-subblock";
  sec.id = settingsTargetId("password-security");
  const secTitle = document.createElement("h3");
  secTitle.className = "settings-subblock-title";
  secTitle.textContent = "Password & Security";
  sec.appendChild(secTitle);
  sec.appendChild(settingsRow("Password", "", "Edit", () => {
    openSettingsForm("Change password", [
      { name: "current_password", label: "Current password", type: "password", autocomplete: "current-password" },
      { name: "new_password", label: "New password", type: "password", autocomplete: "new-password" }
    ], "Save", async (values) => {
      await postAccount("/account_password", { current_password: values.current_password, new_password: values.new_password });
    });
  }));
  sec.appendChild(settingsLinkRow("Multi-Factor Authentication", info.mfa_enabled ? "Enabled" : "Disabled", () => renderMfaSettings(pane, info)));
  sec.appendChild(settingsLinkRow("Logged-in Devices", (info.device_count || 0) + ((info.device_count === 1) ? " device" : " devices"), () => renderDeviceSettings(pane)));
  block.appendChild(sec);
  pane.appendChild(block);

  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}

function settingsBackBar(label, onBack) {
  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "settings-back";
  bar.textContent = "← " + label;
  bar.addEventListener("click", onBack);
  return bar;
}

async function renderDeviceSettings(pane) {
  pane.innerHTML = "";
  pane.appendChild(settingsBackBar("Account", () => jumpToSettings("password-security")));
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Logged-in Devices";
  pane.appendChild(heading);
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "These are all the devices that are currently logged in with your Oneira account. Log out of devices that you don't recognize.";
  pane.appendChild(blurb);

  let data;
  try {
    const response = await fetch(accountSettingsUrl("/account_devices"), { credentials: "include" });
    data = await response.json();
    if (!response.ok) throw new Error(accountErrorText(data, "Could not load devices."));
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load devices.";
    pane.appendChild(note);
    return;
  }

  const devices = data.devices || [];
  const current = devices.filter(d => d.current);
  const others = devices.filter(d => !d.current);

  function deviceRow(device, canRevoke) {
    const row = document.createElement("div");
    row.className = "device-row";
    const icon = document.createElement("div");
    icon.className = "device-icon";
    icon.textContent = device.device_label === "Android" || device.device_label === "iOS" ? "📱" : "🖥";
    const meta = document.createElement("div");
    meta.className = "device-meta";
    const name = document.createElement("div");
    name.className = "device-name";
    name.textContent = device.device_label + "  ·  " + device.client_label;
    const sub = document.createElement("div");
    sub.className = "device-sub";
    sub.textContent = (device.location || "Unknown location") + (device.current ? "" : " · " + formatDeviceWhen(device.last_active));
    meta.appendChild(name);
    meta.appendChild(sub);
    row.appendChild(icon);
    row.appendChild(meta);
    if (canRevoke) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "device-revoke";
      x.title = "Log out this device";
      x.textContent = "×";
      x.addEventListener("click", async () => {
        try {
          await postAccount("/account_devices/revoke", { session_id: device.session_id });
          accountSettingsCache = null;
          renderDeviceSettings(pane);
        } catch (e) {
          window.alert(e.message || "Could not log out that device.");
        }
      });
      row.appendChild(x);
    }
    return row;
  }

  if (current.length) {
    const h = document.createElement("h3");
    h.className = "settings-subblock-title";
    h.textContent = "Current Device";
    pane.appendChild(h);
    current.forEach(d => pane.appendChild(deviceRow(d, false)));
  }
  if (others.length) {
    const h = document.createElement("h3");
    h.className = "settings-subblock-title";
    h.textContent = "Other Devices";
    pane.appendChild(h);
    others.forEach(d => pane.appendChild(deviceRow(d, true)));
  }

  const all = document.createElement("div");
  all.className = "settings-subblock";
  const allTitle = document.createElement("h3");
  allTitle.className = "settings-subblock-title";
  allTitle.textContent = "Log out of all known devices";
  const allBlurb = document.createElement("p");
  allBlurb.className = "settings-blurb";
  allBlurb.textContent = "You'll have to log back in on all logged out devices.";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "settings-danger-btn";
  allBtn.textContent = "Log Out All Known Devices";
  allBtn.addEventListener("click", () => {
    openSettingsConfirm(
      "Log out of all known devices",
      "You'll have to log back in on every device, including this one.",
      "Log Out All Known Devices",
      async () => {
        await postAccount("/account_devices/revoke_all", {});
        if (typeof logout === "function") logout();
      }
    );
  });
  all.appendChild(allTitle);
  all.appendChild(allBlurb);
  all.appendChild(allBtn);
  pane.appendChild(all);
}

async function renderMfaSettings(pane, info) {
  pane.innerHTML = "";
  pane.appendChild(settingsBackBar("Account", () => jumpToSettings("password-security")));
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Multi-Factor Authentication";
  pane.appendChild(heading);
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Use Google Authenticator or another TOTP app. After this is on, logging in needs your password and a code from the app. Text-message and other methods come later.";
  pane.appendChild(blurb);
  const status = document.createElement("div");
  status.className = "placeholder-panel";
  status.textContent = info.mfa_enabled ? "Authenticator is enabled on this account." : "Authenticator is not enabled.";
  pane.appendChild(status);

  if (info.mfa_enabled) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-row-btn";
    btn.textContent = "Disable";
    btn.addEventListener("click", () => {
      openSettingsForm("Disable authenticator", [
        { name: "password", label: "Current password", type: "password" },
        { name: "code", label: "Authenticator code" }
      ], "Disable", async (values) => {
        await postAccount("/account_mfa/disable", { password: values.password, code: values.code });
        accountSettingsCache = null;
        jumpToSettings("password-security");
      });
    });
    pane.appendChild(btn);
    return;
  }

  const start = document.createElement("button");
  start.type = "button";
  start.className = "settings-form-save";
  start.textContent = "Set up authenticator app";
  start.addEventListener("click", async () => {
    try {
      const data = await postAccount("/account_mfa/begin", {});
      pane.querySelectorAll(".mfa-setup").forEach(el => el.remove());
      const setup = document.createElement("div");
      setup.className = "mfa-setup";
      const help = document.createElement("p");
      help.className = "settings-blurb";
      help.textContent = "Add a new one-time password in Google Authenticator (or another TOTP app) using this key, then enter a code to confirm.";
      const secret = document.createElement("div");
      secret.className = "mfa-secret";
      secret.textContent = data.secret;
      secret.title = "Click to copy";
      secret.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(data.secret);
          secret.classList.add("copied");
        } catch (e) { /* ignore */ }
      });
      const codeLabel = document.createElement("label");
      codeLabel.className = "mfa-code-label";
      codeLabel.textContent = "6-digit code";
      const codeInput = document.createElement("input");
      codeInput.type = "text";
      codeInput.inputMode = "numeric";
      codeInput.autocomplete = "one-time-code";
      codeInput.maxLength = 8;
      const enable = document.createElement("button");
      enable.type = "button";
      enable.className = "settings-form-save";
      enable.textContent = "Enable";
      const err = document.createElement("div");
      err.className = "settings-form-status";
      enable.addEventListener("click", async () => {
        enable.disabled = true;
        err.textContent = "";
        try {
          await postAccount("/account_mfa/confirm", { code: codeInput.value });
          accountSettingsCache = null;
          jumpToSettings("password-security");
        } catch (e) {
          err.textContent = e.message || "Could not enable authenticator.";
          enable.disabled = false;
        }
      });
      codeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") enable.click();
      });
      setup.appendChild(help);
      setup.appendChild(secret);
      codeLabel.appendChild(codeInput);
      setup.appendChild(codeLabel);
      setup.appendChild(err);
      setup.appendChild(enable);
      pane.appendChild(setup);
      start.style.display = "none";
      codeInput.focus();
    } catch (e) {
      window.alert(e.message || "Could not start authenticator setup.");
    }
  });
  pane.appendChild(start);
}

async function renderProfileSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadAccountSettings(true);
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load profile settings.";
    pane.appendChild(note);
    return;
  }
  const block = document.createElement("section");
  block.className = "settings-block";
  block.id = settingsTargetId("profile");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Profile";
  block.appendChild(title);
  const sub = document.createElement("div");
  sub.className = "settings-subblock";
  sub.id = settingsTargetId("display-name");
  const subTitle = document.createElement("h3");
  subTitle.className = "settings-subblock-title";
  subTitle.textContent = "Display Name";
  sub.appendChild(subTitle);
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "This is what other people see. It does not change the username you log in with.";
  sub.appendChild(blurb);
  sub.appendChild(settingsRow("Display Name", info.display_name || info.username, "Edit", () => {
    openSettingsForm("Change display name", [
      { name: "value", label: "Display name", value: info.display_name || info.username, maxlength: 32 }
    ], "Save", async (values) => {
      const data = await postAccount("/account_display_name", { value: values.value });
      accountSettingsCache = Object.assign({}, info, data);
      applyLocalIdentity(data);
      jumpToSettings("display-name");
    });
  }));
  const avatar = document.createElement("div");
  avatar.className = "settings-subblock";
  avatar.id = settingsTargetId("avatar");
  const avatarTitle = document.createElement("h3");
  avatarTitle.className = "settings-subblock-title";
  avatarTitle.textContent = "Avatar";
  avatar.appendChild(avatarTitle);
  const avatarNote = document.createElement("div");
  avatarNote.className = "placeholder-panel";
  avatarNote.textContent = "Avatar upload isn't built yet.";
  avatar.appendChild(avatarNote);
  block.appendChild(sub);
  block.appendChild(avatar);
  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
  }
}
