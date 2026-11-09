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
    disabled: true,
    body: body
  });
}

function paintSettingsKofi(main) {
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Settings", "Ko-fi"],
    title: "Ko-fi",
    note: "Site donations. Payments stay on Ko-fi. Oneira reads what the webhook sends."
  }));
  const link = adminPanel({ title: "Connection", meta: "Not connected" });
  link.body.classList.add("admin-settings-fields");
  const row = adminEl("div", "admin-settings-connect");
  const copy = adminEl("div", "admin-settings-connect-copy");
  copy.appendChild(adminEl("div", "admin-settings-connect-name", "Ko-fi"));
  copy.appendChild(adminEl("div", "admin-settings-connect-sub", "Webhook for donations and memberships."));
  row.appendChild(copy);
  const connect = adminEl("button", "admin-mod-confirm");
  connect.type = "button";
  connect.textContent = "Connect";
  connect.addEventListener("click", openSettingsKofiConnect);
  row.appendChild(connect);
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
  paintSettingsKofi(main);
}

registerAdminPage({
  id: "settings",
  label: "Settings",
  sections: [
    { id: "kofi", label: "Ko-fi", icon: "plus" }
  ],
  paint: paintAdminSettings
});
