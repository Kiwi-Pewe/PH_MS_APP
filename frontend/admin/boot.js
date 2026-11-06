function adminApi(path) {
  return fetch("https://" + API_HOST + path, { credentials: "include" });
}

window.addEventListener("load", () => {
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
});
