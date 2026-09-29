const $ = id => document.getElementById(id);

let me = null;
let packages = [];

async function load() {
  try {
    const r = await api("/api/me");

    if (!r.success || !r.user) {
      localStorage.removeItem("token");
      location.href = "/login.html";
      return;
    }

    me = r.user;

    // COINS
    const coins = $("coins");
    if (coins) {
      coins.textContent =
        Number(me.coins || 0).toLocaleString("id-ID");
    }

    // COIN EXPIRY
    const coinExpiry = $("coinExpiry");

    if (coinExpiry) {
      if (!me.coinExpiry) {
        coinExpiry.textContent = "Permanent";
      } else {
        const expiry = new Date(me.coinExpiry);
        const now = new Date();
        const diff = expiry.getTime() - now.getTime();

        if (diff <= 0) {
          coinExpiry.textContent = "Expired";
        } else {
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          coinExpiry.textContent = `${days} hari lagi`;
        }
      }
    }

    // API KEY
    const apiKey = $("apiKey");
    if (apiKey) {
      apiKey.textContent = me.apiKey || "—";
    }

    // Load semua data
    await Promise.all([
      loadDashboardStats(),
      loadPackages(),
      loadOrders(),
      loadUsage()
    ]);

  } catch (err) {
    console.error("[Dashboard]", err);

    toast(
      "Gagal memuat dashboard. Silakan refresh halaman.",
      "error",
      "Dashboard Error"
    );
  }
}


/* =========================
   DASHBOARD STATS
========================= */

async function loadDashboardStats() {
  try {
    const r = await api("/api/dashboard/stats");

    if (!r.success) {
      console.error("[Dashboard Stats]", r.error);
      return;
    }

    const total = $("totalReactions");

    if (total) {
      total.textContent =
        Number(r.totalReactions || 0).toLocaleString("id-ID");
    }

  } catch (err) {
    console.error("[Dashboard Stats]", err);
  }
}


/* =========================
   PACKAGES
========================= */

async function loadPackages() {
  const container = $("packagesList");

  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-loading">
      Memuat paket...
    </div>
  `;

  try {
    const r = await api("/api/packages");

    if (!r.success) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Gagal memuat paket.
        </div>
      `;
      return;
    }

    packages = r.packages || [];

    if (!packages.length) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Belum ada paket tersedia.
        </div>
      `;
      return;
    }

    container.innerHTML = packages.map(p => `
      <article class="package-card">

        <div class="package-card-top">
          <div>
            <div class="package-name">
              ${escapeHtml(p.name)}
            </div>

            <div class="package-duration">
              ${
                p.duration === "permanent"
                  ? "AKTIF SELAMANYA"
                  : escapeHtml(
                      p.duration === "30_days"
                        ? "30 HARI"
                        : "7 HARI"
                    )
              }
            </div>
          </div>

          <div class="package-icon">◈</div>
        </div>

        <div class="package-coins">
          ${Number(p.coins || 0).toLocaleString("id-ID")}
          <span>coin</span>
        </div>

        <div class="package-description">
          ${escapeHtml(p.description || "")}
        </div>

        <div class="package-bottom">

          <strong>
            Rp${Number(p.price || 0).toLocaleString("id-ID")}
          </strong>

          <button
            class="package-buy"
            type="button"
            onclick="createOrder('${escapeHtml(p.duration)}')"
          >
            Beli →
          </button>

        </div>

      </article>
    `).join("");

  } catch (err) {
    console.error("[Packages]", err);

    container.innerHTML = `
      <div class="dashboard-empty">
        Gagal terhubung ke server.
      </div>
    `;
  }
}


/* =========================
   CREATE ORDER
========================= */

async function createOrder(duration) {
  const p = packages.find(
    x => x.duration === duration
  );

  if (!p) {
    toast(
      "Paket tidak ditemukan.",
      "error"
    );
    return;
  }

  const confirmed = await confirmModal(
    `Buat order ${p.name} dengan ${Number(p.coins).toLocaleString("id-ID")} coin seharga Rp${Number(p.price).toLocaleString("id-ID")}?`,
    "Konfirmasi Pembelian"
  );

  if (!confirmed) return;

  const r = await api(
    "/api/orders",
    "POST",
    {
      coins: p.coins,
      duration: p.duration
    }
  );

  if (!r.success) {
    toast(
      r.error || "Gagal membuat order.",
      "error"
    );
    return;
  }

  await loadOrders();

  openPaymentModal(r.order);
}


/* =========================
   PAYMENT MODAL
========================= */

let paymentModalOrderId = null;

function closePaymentModal() {
  const modal = document.getElementById("paymentModal");

  if (modal) {
    modal.remove();
  }

  paymentModalOrderId = null;
}

function openPaymentModal(order) {
  closePaymentModal();

  paymentModalOrderId = order.id;

  const modal = document.createElement("div");

  modal.id = "paymentModal";
  modal.className = "admin-modal";

  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>

    <div class="admin-modal-card payment-modal-card">

      <button
        type="button"
        class="admin-modal-close"
        id="paymentModalClose"
        aria-label="Tutup"
      >
        ×
      </button>

      <div class="eyebrow">PAYMENT</div>

      <h2>Pembayaran Order</h2>

      <p class="payment-order-id">
        Order <strong>${escapeHtml(order.id)}</strong>
      </p>

      <div class="payment-summary">
        <div>
          <span>Coin</span>
          <strong>
            ${Number(order.coins || 0).toLocaleString("id-ID")}
          </strong>
        </div>

        <div>
          <span>Masa Aktif</span>
          <strong>${escapeHtml(order.duration || "—")}</strong>
        </div>

        <div>
          <span>Total</span>
          <strong>
            Rp${Number(order.price || 0).toLocaleString("id-ID")}
          </strong>
        </div>
      </div>

      <div class="payment-qr-wrap">
        <img
          src="https://files.catbox.moe/r5y2he.jpeg"
          alt="QR pembayaran"
          class="payment-qr"
        >
      </div>

      <div class="payment-instruction">
        <strong>Transfer sesuai nominal di atas.</strong>
        <span>
          Setelah transfer, upload bukti pembayaran yang jelas.
        </span>
      </div>

      <label class="payment-proof-btn">
        <span id="paymentProofLabel">
          Upload Bukti Transfer
        </span>

        <input
          id="paymentProofInput"
          type="file"
          accept="image/*,.pdf"
        >
      </label>

      <div
        id="paymentProofStatus"
        class="payment-proof-status"
      >
        Bukti transfer wajib diupload.
      </div>

      <button
        id="paymentCheckBtn"
        class="primary-btn payment-check-btn"
        type="button"
        disabled
      >
        Sudah bayar? Cek status
      </button>

      <button
        id="paymentCancelBtn"
        class="btn small payment-cancel-btn"
        type="button"
      >
        Tutup
      </button>

      <div
        id="paymentStatusResult"
        class="payment-status-result"
      ></div>

    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => {
    modal.classList.add("open");
  });

  const close = () => closePaymentModal();

  modal
    .querySelector("#paymentModalClose")
    .addEventListener("click", close);

  modal
    .querySelector("#paymentCancelBtn")
    .addEventListener("click", close);

  modal
    .querySelector(".admin-modal-backdrop")
    .addEventListener("click", close);

  const input = modal.querySelector("#paymentProofInput");
  const label = modal.querySelector("#paymentProofLabel");
  const proofStatus = modal.querySelector("#paymentProofStatus");
  const checkBtn = modal.querySelector("#paymentCheckBtn");
  const result = modal.querySelector("#paymentStatusResult");

  let proofUploaded = false;

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];

    if (!file) {
      proofUploaded = false;
      checkBtn.disabled = true;
      label.textContent = "Upload Bukti Transfer";
      proofStatus.textContent =
        "Bukti transfer wajib diupload.";
      return;
    }

    label.textContent = "Mengupload bukti...";

    const formData = new FormData();
    formData.append("proof", file);

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `/api/orders/${encodeURIComponent(order.id)}/proof`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
          data.error ||
          "Gagal mengupload bukti."
        );
      }

      proofUploaded = true;
      checkBtn.disabled = false;

      label.textContent = "Bukti berhasil diupload ✓";

      proofStatus.textContent =
        "Bukti pembayaran sudah diterima. Kamu bisa cek status pembayaran.";

      toast(
        "Bukti pembayaran berhasil dikirim.",
        "success",
        "Bukti Terkirim"
      );

      await loadOrders();

    } catch (err) {
      proofUploaded = false;
      checkBtn.disabled = true;

      label.textContent = "Upload Bukti Transfer";

      proofStatus.textContent =
        err.message || "Gagal mengupload bukti.";

      input.value = "";

      toast(
        err.message || "Gagal mengupload bukti.",
        "error",
        "Upload Gagal"
      );
    }
  });

  checkBtn.addEventListener("click", async () => {
    if (!proofUploaded) {
      toast(
        "Upload bukti transfer terlebih dahulu.",
        "error",
        "Bukti Diperlukan"
      );
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = "Mengecek status...";

    try {
      const r = await api(
        `/api/orders/${encodeURIComponent(order.id)}/status`
      );

      if (!r.success) {
        throw new Error(
          r.message ||
          r.error ||
          "Gagal mengecek status."
        );
      }

      const current = r.order;

      if (current.status === "pending") {
        result.innerHTML = `
          <div class="payment-status pending">
            <strong>⏳ Menunggu verifikasi admin</strong>
            <span>
              Bukti pembayaran sudah diterima. Silakan tunggu admin memproses order ini.
            </span>
          </div>
        `;
      }

      else if (current.status === "approved") {
        result.innerHTML = `
          <div class="payment-status approved">
            <strong>✓ Pembayaran disetujui</strong>
            <span>
              ${Number(current.coins || 0).toLocaleString("id-ID")}
              coin sudah masuk ke akun kamu.
            </span>
          </div>
        `;

        await loadOrders();
      }

      else if (current.status === "rejected") {
        result.innerHTML = `
          <div class="payment-status rejected">
            <strong>✕ Pembayaran ditolak</strong>
            <span>
              ${escapeHtml(
                current.reason ||
                "Pembayaran tidak valid."
              )}
            </span>
          </div>
        `;

        await loadOrders();
      }

    } catch (err) {
      result.innerHTML = `
        <div class="payment-status rejected">
          <strong>Gagal mengecek status</strong>
          <span>
            ${escapeHtml(
              err.message ||
              "Terjadi kesalahan."
            )}
          </span>
        </div>
      `;
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = "Sudah bayar? Cek status";
    }
  });
}


/* =========================
   ORDERS
========================= */

window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;

function openExistingPaymentModal(order) {
  openPaymentModal(order);
}


async function loadOrders() {
  const container = $("ordersList");

  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-loading">
      Memuat orders...
    </div>
  `;

  try {
    const r = await api("/api/orders");

    if (!r.success) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Gagal memuat orders.
        </div>
      `;
      return;
    }

    const orders = r.orders || [];

    if (!orders.length) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Belum ada order.
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="order-card">

        <div class="order-main">

          <div class="order-id">
            ${escapeHtml(o.id)}
          </div>

          <div class="order-info">
            ${Number(o.coins || 0).toLocaleString("id-ID")} coin
            · ${escapeHtml(o.duration)}
            · Rp${Number(o.price || 0).toLocaleString("id-ID")}
          </div>

        </div>

        <div class="order-side">

          <span class="status ${escapeHtml(o.status)}">
            ${escapeHtml(o.status)}
          </span>

          ${
            o.status === "pending"
              ? `
                <button
                  class="primary-btn order-payment-btn"
                  type="button"
                  onclick='openExistingPaymentModal(${JSON.stringify(o)})'
                >
                  Bayar / Cek Status
                </button>
              `
              : ""
          }

        </div>

      </div>
    `).join("");

  } catch (err) {
    console.error("[Orders]", err);

    container.innerHTML = `
      <div class="dashboard-empty">
        Gagal memuat orders.
      </div>
    `;
  }
}


/* =========================
   DELETE ALL ORDERS
========================= */

function openDeleteOrdersModal() {
  const modal = $("deleteOrdersModal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteOrdersModal() {
  const modal = $("deleteOrdersModal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function deleteAllOrders() {
  const button = $("confirmDeleteOrders");

  if (button) {
    button.disabled = true;
    button.textContent = "Menghapus...";
  }

  try {
    const r = await api("/api/orders", "DELETE");

    if (!r.success) {
      toast(
        r.message || r.error || "Gagal menghapus riwayat order.",
        "error",
        "Orders"
      );
      return;
    }

    closeDeleteOrdersModal();

    const container = $("ordersList");

    if (container) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Belum ada order.
        </div>
      `;
    }

    toast(
      "Semua riwayat order berhasil dihapus.",
      "success",
      "Orders Dihapus"
    );
  } catch (err) {
    console.error("[Delete Orders]", err);

    toast(
      "Gagal menghapus riwayat order.",
      "error",
      "Orders"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Hapus Semua";
    }
  }
}

$("deleteAllOrders")?.addEventListener(
  "click",
  openDeleteOrdersModal
);

$("cancelDeleteOrders")?.addEventListener(
  "click",
  closeDeleteOrdersModal
);

document
  .querySelector("[data-close-orders-history]")
  ?.addEventListener("click", closeDeleteOrdersModal);

$("confirmDeleteOrders")?.addEventListener(
  "click",
  deleteAllOrders
);

/* =========================
   USAGE
========================= */

async function loadUsage() {
  const container = $("usage");

  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-loading">
      Memuat usage...
    </div>
  `;

  try {
    const r = await api("/api/usage");

    if (!r.success) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Gagal memuat riwayat.
        </div>
      `;
      return;
    }

    const usage = r.usage || [];

    if (!usage.length) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Belum ada penggunaan API.
        </div>
      `;
      return;
    }

    container.innerHTML = usage.map(x => `
      <div class="usage-card">

        <div class="usage-main">

          <div class="usage-reaction">
            ${escapeHtml(x.reaction || "—")}
          </div>

          <div class="usage-url">
            ${escapeHtml(x.url || x.target_url || "—")}
          </div>

        </div>

        <div class="usage-side">

          <span class="status ${escapeHtml(x.status || "")}">
            ${escapeHtml(x.status || "unknown")}
          </span>

          <small>
            ${Number(
              x.coinUsed ??
              x.coins_used ??
              0
            ).toLocaleString("id-ID")} coin
          </small>

        </div>

      </div>
    `).join("");

  } catch (err) {
    console.error("[Usage]", err);

    container.innerHTML = `
      <div class="dashboard-empty">
        Gagal memuat usage.
      </div>
    `;
  }
}


/* =========================
   DELETE ALL HISTORY
========================= */

function openDeleteHistoryModal() {
  const modal = $("deleteHistoryModal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteHistoryModal() {
  const modal = $("deleteHistoryModal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function deleteAllHistory() {
  const button = $("confirmDeleteHistory");

  if (button) {
    button.disabled = true;
    button.textContent = "Menghapus...";
  }

  try {
    const r = await api("/api/usage", "DELETE");

    if (!r.success) {
      toast(
        r.message || r.error || "Gagal menghapus riwayat.",
        "error",
        "History"
      );
      return;
    }

    closeDeleteHistoryModal();

    const container = $("usage");

    if (container) {
      container.innerHTML = `
        <div class="dashboard-empty">
          Belum ada penggunaan API.
        </div>
      `;
    }

    toast(
      "Semua riwayat berhasil dihapus.",
      "success",
      "History Dihapus"
    );
  } catch (err) {
    console.error("[Delete History]", err);

    toast(
      "Gagal menghapus riwayat.",
      "error",
      "History"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Hapus Semua";
    }
  }
}

$("deleteAllHistory")?.addEventListener(
  "click",
  openDeleteHistoryModal
);

$("cancelDeleteHistory")?.addEventListener(
  "click",
  closeDeleteHistoryModal
);

document
  .querySelector("[data-close-history]")
  ?.addEventListener("click", closeDeleteHistoryModal);

$("confirmDeleteHistory")?.addEventListener(
  "click",
  deleteAllHistory
);

/* =========================
   API KEY
========================= */

function copyKey() {
  if (!me?.apiKey) {
    toast(
      "API key belum tersedia.",
      "error"
    );
    return;
  }

  copyText(me.apiKey, "API key");
}

async function regen() {
  const confirmed = await confirmModal(
    "API key lama akan langsung tidak berlaku.",
    "Regenerate API Key?"
  );

  if (!confirmed) return;

  const r = await api(
    "/api/me/regenerate-key",
    "POST"
  );

  if (!r.success) {
    toast(
      r.error || "Gagal membuat API key baru.",
      "error"
    );
    return;
  }

  me.apiKey = r.apiKey;

  const key = $("apiKey");

  if (key) {
    key.textContent = r.apiKey;
  }

  toast(
    "API key baru berhasil dibuat.",
    "success",
    "API Key Updated"
  );
}


/* =========================
   COPY
========================= */

async function copyText(text, label = "Teks") {
  try {
    await navigator.clipboard.writeText(text);

    toast(
      `${label} berhasil disalin.`,
      "success",
      "Disalin"
    );

  } catch {
    toast(
      `Gagal menyalin ${label.toLowerCase()}.`,
      "error"
    );
  }
}


/* =========================
   HTML ESCAPE
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================
   START
========================= */

load();
