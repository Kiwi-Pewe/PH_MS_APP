// Single source of truth for where the backend lives. Now that the frontend
// (oneira.cc, via Pages) and the backend (api.oneira.cc, via Cloudflare
// Tunnel) are different origins, nothing can derive this from
// window.location.host anymore — it has to be fixed and shared everywhere.
const API_HOST = "api.oneira.cc";
