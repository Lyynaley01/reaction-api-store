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

/* =========================================================
   DOCS — COPY CODE BUTTONS
   ========================================================= */

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-code]");
  if (!button) return;

  const wrap = button.closest(".copy-code-wrap");
  const code = wrap?.querySelector("pre");

  if (!code) return;

  const text = code.textContent;

  try {
    await navigator.clipboard.writeText(text);

    const original = button.textContent;
    button.textContent = "Copied ✓";
    button.classList.add("copied");

    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copied");
    }, 1400);
  } catch (err) {
    console.error("[Docs Copy]", err);

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");

      button.textContent = "Copied ✓";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("copied");
      }, 1400);
    } finally {
      textarea.remove();
    }
  }
});



// ============================================================
// DOCS COPY BUTTON FIX
// ============================================================
document.addEventListener("click", async (event) => {
  const button = event.target.closest(".docs-copy-code");

  if (!button) return;

  const wrap = button.closest(".docs-code-wrap");
  const pre = wrap ? wrap.querySelector("pre") : null;

  if (!pre) {
    console.error("[Docs Copy] <pre> tidak ditemukan.");
    return;
  }

  // innerText mempertahankan line break yang terlihat user.
  const code = pre.innerText || pre.textContent || "";

  try {
    await navigator.clipboard.writeText(code);

    const original = button.textContent;
    button.textContent = "Copied!";

    button.classList.add("copied");

    setTimeout(() => {
      button.textContent = original || "Copy";
      button.classList.remove("copied");
    }, 1500);

  } catch (err) {
    console.error("[Docs Copy]", err);

    // Fallback untuk browser yang memblokir Clipboard API.
    const textarea = document.createElement("textarea");
    textarea.value = code;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");

      const original = button.textContent;
      button.textContent = "Copied!";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = original || "Copy";
        button.classList.remove("copied");
      }, 1500);
    } catch (fallbackErr) {
      console.error("[Docs Copy Fallback]", fallbackErr);
      alert("Kode gagal disalin. Silakan copy manual.");
    }

    textarea.remove();
  }
});


/* =========================================================
   PAYMENT MODAL — IDENTIFIER
   Adds a scoped class without changing payment functionality.
   ========================================================= */
(function markPaymentModal() {
  const mark = () => {
    const headings = document.querySelectorAll("h1,h2,h3,h4,[role='heading']");
    for (const heading of headings) {
      const text = (heading.textContent || "").trim().toLowerCase();
      if (!text.includes("pembayaran order")) continue;

      let el = heading;
      for (let i = 0; i < 7 && el; i++, el = el.parentElement) {
        const hasClose =
          el.querySelector?.('[aria-label="Close"],[aria-label="Tutup"]');
        const hasPaymentText =
          (el.textContent || "").toLowerCase().includes("upload bukti transfer");

        if (hasClose || hasPaymentText) {
          el.classList.add("payment-modal");
          return;
        }
      }
    }
  };

  mark();

  const observer = new MutationObserver(mark);
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => observer.disconnect(), 60000);
})();


/* PAYMENT MODAL BUTTON POLISH */
(function polishPaymentActions() {
  const scan = () => {
    const buttons = document.querySelectorAll(".payment-modal button");

    buttons.forEach((button) => {
      const text = (button.textContent || "").trim().toLowerCase();

      if (text.includes("sudah bayar") && text.includes("cek status")) {
        button.classList.add("status-action");
      }

      if (text === "tutup") {
        button.classList.add("close");
      }

      if (
        text.includes("upload bukti") ||
        text.includes("upload proof")
      ) {
        button.classList.add("upload-proof");
      }
    });
  };

  scan();

  const observer = new MutationObserver(scan);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  setTimeout(() => observer.disconnect(), 60000);
})();
