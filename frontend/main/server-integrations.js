// ==================================================================
// server-integrations.js - Server Settings → Integrations.
// Discord-shaped sections: Bots and Apps, Webhooks, Twitch, YouTube.
// Channel Following parked (needs mailing + feedback first).
// Chrome only this pass — buttons disabled; lists empty.
// ==================================================================

function paintServerIntegrationsPage() {
  const page = document.getElementById("server-settings-integrations");
  if (!page || page.hidden) return;
  // Lists stay empty until each integration ships. Empty copy is in HTML.
}

async function loadServerIntegrationsPage() {
  paintServerIntegrationsPage();
}
