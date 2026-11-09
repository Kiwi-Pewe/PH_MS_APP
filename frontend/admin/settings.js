function paintAdminSettings(main) {
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Settings"],
    title: "Settings",
    note: "Fine-tune how the site is used, including silent auto-moderation flags."
  }));
  const panel = adminPanel({ title: "Donate", meta: "Public leave-site card" });
  panel.body.classList.add("admin-settings-fields");
  panel.body.appendChild(adminEl("div", "users-field-k", "Ko-fi page"));
  const url = adminEl("input", "admin-mod-input");
  url.type = "text";
  url.placeholder = "Ko-fi link";
  url.disabled = true;
  panel.body.appendChild(url);
  panel.body.appendChild(adminEl("div", "users-field-k", "Disclaimer"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  area.placeholder = "Shown on the leave-site card before Ko-fi opens.";
  area.disabled = true;
  panel.body.appendChild(area);
  const preview = adminEl("button", "admin-mod-confirm");
  preview.type = "button";
  preview.textContent = "Preview leave-site card";
  preview.addEventListener("click", () => {
    if (typeof openNewsDonateCard === "function") openNewsDonateCard(true);
  });
  panel.body.appendChild(preview);
  main.appendChild(panel.panel);
}

registerAdminPage({
  id: "settings",
  label: "Settings",
  sections: [],
  paint: paintAdminSettings
});
