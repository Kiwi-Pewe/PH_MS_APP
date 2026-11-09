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
  copy.appendChild(adminEl("div", "admin-settings-connect-sub", connected ? "Webhook is on. Donations and memberships will land on Donate." : "Paste the verification token from Ko-fi → Webhooks."));
  row.appendChild(copy);
  const action = adminEl("button", connected ? "admin-mod-cancel" : "admin-mod-confirm");
  action.type = "button";
  action.textContent = connected ? "Disconnect" : "Connect";
  action.addEventListener("click", connected ? disconnectSettingsKofi : openSettingsKofiConnect);
  row.appendChild(action);
  link.body.appendChild(row);
  main.appendChild(link.panel);
  const card = adminPanel({ title: "Leave-site card", meta: "News → Donate" });
  card.body.classList.add("admin-settings-fields");
  card.body.appendChild(adminEl("div", "users-field-k", "Ko-fi page"));
  const url = adminEl("input", "admin-mod-input");
  url.type = "text";
  url.placeholder = "Ko-fi link";
  url.disabled = true;
  card.body.appendChild(url);
  card.body.appendChild(adminEl("div", "users-field-k", "Disclaimer"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  area.placeholder = "Shown on the leave-site card before Ko-fi opens.";
  area.disabled = true;
  card.body.appendChild(area);
  const preview = adminEl("button", "admin-mod-confirm");
  preview.type = "button";
  preview.textContent = "Preview leave-site card";
  preview.addEventListener("click", () => {
    if (typeof openNewsDonateCard === "function") openNewsDonateCard(true);
  });
  card.body.appendChild(preview);
  main.appendChild(card.panel);
}

function paintAdminSettings(main, sectionId) {
  paintSettingsKofi(main, null);
  adminApi("/admin/kofi").then((response) => response.ok ? response.json() : null).then((data) => {
    if (adminPage !== "settings") return;
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
    { id: "kofi", label: "Ko-fi", icon: "plus" }
  ],
  paint: paintAdminSettings
});
