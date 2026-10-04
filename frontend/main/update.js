function oneiraBuildId() {
  const meta = document.querySelector('meta[name="oneira-build"]');
  return meta ? meta.content.trim() : "";
}

function showOneiraUpdate() {
  const button = document.getElementById("oneira-update");
  if (!button) return;
  button.hidden = false;
}

async function checkOneiraBuild() {
  const mine = oneiraBuildId();
  if (!mine) return;
  try {
    const response = await fetch("build.txt?oneira-build=" + Date.now(), { cache: "no-store" });
    if (!response.ok) return;
    const remote = (await response.text()).trim();
    if (remote && remote !== mine) showOneiraUpdate();
  } catch (err) {
    return;
  }
}

function bindOneiraUpdate() {
  const button = document.getElementById("oneira-update");
  if (button) {
    button.addEventListener("click", () => {
      location.reload();
    });
  }
  checkOneiraBuild();
  setInterval(checkOneiraBuild, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkOneiraBuild();
  });
}

bindOneiraUpdate();
