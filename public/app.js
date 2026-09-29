async function api(url, method="GET", body=null, extra={}) {
  const headers = {...extra};

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (localStorage.token) {
    headers.Authorization = "Bearer " + localStorage.token;
  }

  const r = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });

  return r.json().catch(() => ({
    success: false,
    error: "INVALID_SERVER_RESPONSE"
  }));
}

function logout() {
  localStorage.removeItem("token");
  location.href = "/";
}

function logoutAdmin() {
  localStorage.removeItem("adminToken");
  location.reload();
}

/* =========================
   TOAST NOTIFICATION
========================= */

function ensureToastWrap() {
  let wrap = document.querySelector(".toast-wrap");

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }

  return wrap;
}

function toast(message, type="success", title=null) {
  const wrap = ensureToastWrap();

  const titles = {
    success: "Berhasil",
    error: "Terjadi Kesalahan",
    warning: "Perhatian",
    info: "Informasi"
  };

  const icons = {
    success: "✓",
    error: "!",
    warning: "!",
    info: "i"
  };

  const item = document.createElement("div");
  item.className = `toast ${type}`;

  item.innerHTML = `
    <div class="toast-icon">${icons[type] || "i"}</div>
    <div class="toast-content">
      <div class="toast-title">${title || titles[type] || "Notifikasi"}</div>
      <div class="toast-message"></div>
    </div>
    <button class="toast-close" type="button">×</button>
  `;

  item.querySelector(".toast-message").textContent = message;

  item.querySelector(".toast-close").onclick = () => {
    item.remove();
  };

  wrap.appendChild(item);

  setTimeout(() => {
    if (item.isConnected) item.remove();
  }, 4500);
}

/* =========================
   CONFIRM MODAL
========================= */

function confirmModal(message, title="Konfirmasi") {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop show";

    backdrop.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <p class="modal-message"></p>
        <div class="modal-actions">
          <button class="btn ghost modal-cancel">Batal</button>
          <button class="btn modal-confirm">Lanjutkan</button>
        </div>
      </div>
    `;

    backdrop.querySelector(".modal-message").textContent = message;

    const close = result => {
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector(".modal-cancel").onclick = () => close(false);
    backdrop.querySelector(".modal-confirm").onclick = () => close(true);

    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) close(false);
    });

    document.body.appendChild(backdrop);
  });
}
