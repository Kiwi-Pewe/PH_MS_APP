function adminApi(path, opts) {
  const extra = opts || {};
  const headers = extra.body ? { "Content-Type": "application/json" } : {};
  return fetch("https://" + API_HOST + path, {
    method: extra.method || "GET",
    credentials: "include",
    headers: headers,
    body: extra.body ? JSON.stringify(extra.body) : undefined
  });
}

adminApi("/admin/me").then((response) => {
  if (response.status === 401) {
    window.location.href = "../login.html?redirect=/admin/app.html";
    return null;
  }
  if (!response.ok) {
    window.location.href = "../main/app.html";
    return null;
  }
  return response.json();
}).then((data) => {
  if (!data) return;
  adminUser = data;
  startAdminShell();
}).catch(() => {
  window.location.href = "../login.html?redirect=/admin/app.html";
});
