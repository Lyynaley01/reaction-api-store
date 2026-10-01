const A = (id) => document.getElementById(id);

function adminHeaders() {
  return {};
}

async function adminFetch(url, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    ...adminHeaders()
  };

  const r = await fetch(url, opts);
  return r.json();
}

async function viewPaymentProof(url) {
  const preview = window.open("", "_blank");

  try {
    if (!preview) {
      toast(
        "Izinkan popup browser untuk membuka bukti pembayaran.",
        "warning",
        "Popup Diblokir"
      );
      return;
    }

    preview.document.body.innerHTML = `
      <div style="
        min-height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#0b0910;
        color:#fff;
        font-family:system-ui,sans-serif;
      ">
        Membuka bukti pembayaran...
      </div>
    `;

    const response = await fetch(url, {
      headers: adminHeaders()
    });

    if (!response.ok) {
      let message = "Gagal membuka bukti pembayaran.";

      try {
        const data = await response.json();
        message = data.message || data.error || message;
      } catch {}

      throw new Error(message);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    preview.location.href = blobUrl;

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  } catch (err) {
    preview.close();

    toast(
      err.message || "Gagal membuka bukti pembayaran.",
      "error",
      "Bukti Gagal Dibuka"
    );
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayName(user) {
  return (
    user?.name ||
    user?.email?.split("@")[0] ||
    "Unknown User"
  );
}

function initials(user) {
  const name = displayName(user)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!name.length) return "?";

  if (name.length === 1) {
    return name[0].slice(0, 2).toUpperCase();
  }

  return (
    name[0][0] +
    name[name.length - 1][0]
  ).toUpperCase();
}

function avatarHtml(user, rank) {
  const medalClass =
    rank === 1
      ? "rank-gold"
      : rank === 2
        ? "rank-silver"
        : rank === 3
          ? "rank-bronze"
          : "";

  return `
    <div class="ranking-avatar ${medalClass}">
      <span>${escapeHtml(initials(user))}</span>
    </div>
  `;
}

function rankNumber(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function renderRanking(targetId, items, type) {
  const target = A(targetId);

  if (!target) return;

  if (!items || !items.length) {
    target.innerHTML = `
      <div class="ranking-empty">
        Belum ada data.
      </div>
    `;
    return;
  }

  target.innerHTML = items
    .slice(0, 10)
    .map((user, index) => {
      const rank = index + 1;
      const name = displayName(user);
      const email = user.email || "";

      const value =
        type === "requester"
          ? `${Number(user.requests || 0).toLocaleString("id-ID")} request`
          : `${Number(user.coins || 0).toLocaleString("id-ID")} coin`;

      return `
        <article class="ranking-item rank-${rank}">
          <div class="ranking-position">
            ${rankNumber(rank)}
          </div>

          ${avatarHtml(user, rank)}

          <div class="ranking-user">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(email)}</small>
          </div>

          <div class="ranking-value">
            ${escapeHtml(value)}
          </div>
        </article>
      `;
    })
    .join("");
}


// ============================================================
// DELETE ORDER HISTORY
// ============================================================
let manualDeleteMode = false;
let currentAdminOrders = [];

function updateSelectedOrderCount() {
  const selected = document.querySelectorAll(
    ".admin-order-select:checked"
  ).length;

  const button = A("deleteSelectedOrdersBtn");

  if (button) {
    button.textContent = `Hapus Terpilih (${selected})`;
    button.disabled = selected === 0;
  }
}

function setManualDeleteMode(enabled) {
  manualDeleteMode = Boolean(enabled);

  document.querySelectorAll(".admin-order-select-wrap").forEach((wrap) => {
    wrap.hidden = !manualDeleteMode;
    wrap.setAttribute("aria-hidden", manualDeleteMode ? "false" : "true");
  });

  const bar = A("manualDeleteBar");

  if (bar) {
    bar.hidden = !manualDeleteMode;
    bar.classList.toggle("is-visible", manualDeleteMode);
  }

  if (!manualDeleteMode) {
    document.querySelectorAll(".admin-order-select").forEach((input) => {
      input.checked = false;
    });
  }

  updateSelectedOrderCount();
}

function openDeleteHistoryModal() {
  const modal = A("deleteHistoryModal");
  if (!modal) return;

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
}

function closeDeleteHistoryModal() {
  const modal = A("deleteHistoryModal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modal.hidden = true;
}

async function deleteAdminOrders(payload) {
  const response = await adminFetch("/api/admin/orders", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response || response.success === false) {
    throw new Error(
      response?.message ||
      response?.error ||
      "Gagal menghapus riwayat order."
    );
  }

  return response;
}


// CUSTOM DELETE HISTORY DIALOG
let deleteDialogResolve = null;

function ensureDeleteDialog() {
  if (document.getElementById("adminDeleteDialog")) return;

  const el = document.createElement("div");
  el.id = "adminDeleteDialog";
  el.className = "admin-delete-dialog";
  el.hidden = true;

  el.innerHTML = `
    <div class="admin-delete-dialog-backdrop" data-delete-dialog-close></div>

    <div class="admin-delete-dialog-card" role="dialog" aria-modal="true">
      <div class="admin-delete-dialog-icon" id="adminDeleteDialogIcon">🗑️</div>

      <div class="admin-delete-dialog-eyebrow" id="adminDeleteDialogEyebrow">
        KONFIRMASI
      </div>

      <h3 id="adminDeleteDialogTitle">Hapus Riwayat?</h3>

      <p id="adminDeleteDialogMessage">
        Tindakan ini tidak dapat dibatalkan.
      </p>

      <div class="admin-delete-dialog-actions" id="adminDeleteDialogActions">
        <button
          type="button"
          class="admin-delete-dialog-btn secondary"
          id="adminDeleteDialogCancel">
          Batal
        </button>

        <button
          type="button"
          class="admin-delete-dialog-btn danger"
          id="adminDeleteDialogConfirm">
          Hapus
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  const close = () => {
    if (!el.hidden) {
      el.hidden = true;

      if (deleteDialogResolve) {
        const resolve = deleteDialogResolve;
        deleteDialogResolve = null;
        resolve(false);
      }
    }
  };

  el.querySelector("[data-delete-dialog-close]")?.addEventListener("click", close);
  el.querySelector("#adminDeleteDialogCancel")?.addEventListener("click", close);

  el.querySelector("#adminDeleteDialogConfirm")?.addEventListener("click", () => {
    el.hidden = true;

    if (deleteDialogResolve) {
      const resolve = deleteDialogResolve;
      deleteDialogResolve = null;
      resolve(true);
    }
  });

  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function showDeleteConfirm(count) {
  ensureDeleteDialog();

  const el = document.getElementById("adminDeleteDialog");
  const icon = document.getElementById("adminDeleteDialogIcon");
  const eyebrow = document.getElementById("adminDeleteDialogEyebrow");
  const title = document.getElementById("adminDeleteDialogTitle");
  const message = document.getElementById("adminDeleteDialogMessage");
  const cancel = document.getElementById("adminDeleteDialogCancel");
  const confirm = document.getElementById("adminDeleteDialogConfirm");

  icon.textContent = "🗑️";
  eyebrow.textContent = "KONFIRMASI HAPUS";
  title.textContent = "Hapus Riwayat?";
  message.textContent =
    count === 1
      ? "Hapus 1 order yang dipilih? Tindakan ini tidak dapat dibatalkan."
      : `Hapus ${count.toLocaleString("id-ID")} order yang dipilih? Tindakan ini tidak dapat dibatalkan.`;

  cancel.textContent = "Batal";
  confirm.textContent = count === 1 ? "Hapus 1 Order" : `Hapus ${count} Order`;

  confirm.className = "admin-delete-dialog-btn danger";
  cancel.className = "admin-delete-dialog-btn secondary";

  el.hidden = false;

  requestAnimationFrame(() => {
    confirm.focus();
  });

  return new Promise((resolve) => {
    deleteDialogResolve = resolve;
  });
}

function showDeleteResult(message, success = true) {
  ensureDeleteDialog();

  const el = document.getElementById("adminDeleteDialog");
  const icon = document.getElementById("adminDeleteDialogIcon");
  const eyebrow = document.getElementById("adminDeleteDialogEyebrow");
  const title = document.getElementById("adminDeleteDialogTitle");
  const text = document.getElementById("adminDeleteDialogMessage");
  const actions = document.getElementById("adminDeleteDialogActions");

  icon.textContent = success ? "✓" : "!";
  icon.classList.toggle("success", success);
  icon.classList.toggle("error", !success);

  eyebrow.textContent = success ? "BERHASIL" : "GAGAL";
  title.textContent = success ? "Riwayat Dihapus" : "Penghapusan Gagal";
  text.textContent = message;

  actions.innerHTML = `
    <button
      type="button"
      class="admin-delete-dialog-btn ${success ? "success" : "danger"}"
      id="adminDeleteDialogOk">
      Oke
    </button>
  `;

  el.hidden = false;

  document.getElementById("adminDeleteDialogOk")?.addEventListener("click", () => {
    el.hidden = true;
  });

  requestAnimationFrame(() => {
    document.getElementById("adminDeleteDialogOk")?.focus();
  });
}

async function deleteAllAdminOrders() {
  const confirmed = await showDeleteConfirm(currentAdminOrders.length);

  if (!confirmed) return;

  try {
    const response = await deleteAdminOrders({ all: true });

    await loadAdmin();

    setManualDeleteMode(false);

    showDeleteResult(
      response.message ||
      `${response.deleted || 0} order berhasil dihapus.`,
      true
    );
  } catch (err) {
    console.error("[Delete All Orders]", err);

    showDeleteResult(
      err.message || "Gagal menghapus riwayat order.",
      false
    );
  }
}

async function deleteSelectedAdminOrders() {
  const selected = Array.from(
    document.querySelectorAll(".admin-order-select:checked")
  ).map((input) => String(input.value));

  if (!selected.length) {
    showDeleteResult("Belum ada order yang dipilih.", false);
    return;
  }

  const confirmed = await showDeleteConfirm(selected.length);

  if (!confirmed) return;

  try {
    const response = await deleteAdminOrders({
      ids: selected
    });

    setManualDeleteMode(false);

    await loadAdmin();

    showDeleteResult(
      response.message ||
      `${response.deleted || selected.length} order berhasil dihapus.`,
      true
    );
  } catch (err) {
    console.error("[Delete Selected Orders]", err);

    showDeleteResult(
      err.message || "Gagal menghapus order yang dipilih.",
      false
    );
  }
}

function initDeleteHistoryControls() {
  const deleteHistoryBtn = A("deleteHistoryBtn");
  const deleteAllHistoryBtn = A("deleteAllHistoryBtn");
  const manualDeleteHistoryBtn = A("manualDeleteHistoryBtn");
  const cancelDeleteHistory = A("cancelDeleteHistory");
  const selectAllOrdersBtn = A("selectAllOrdersBtn");
  const deleteSelectedOrdersBtn = A("deleteSelectedOrdersBtn");
  const cancelManualDeleteBtn = A("cancelManualDeleteBtn");

  if (deleteHistoryBtn) {
    deleteHistoryBtn.onclick = openDeleteHistoryModal;
  }

  if (deleteAllHistoryBtn) {
    deleteAllHistoryBtn.onclick = deleteAllAdminOrders;
  }

  if (manualDeleteHistoryBtn) {
    manualDeleteHistoryBtn.onclick = () => {
      closeDeleteHistoryModal();
      setManualDeleteMode(true);

      requestAnimationFrame(() => {
        const firstCheckbox = document.querySelector(
          ".admin-order-select-wrap:not([hidden]) .admin-order-select"
        );

        if (firstCheckbox) {
          firstCheckbox.focus({ preventScroll: true });
        }
      });
    };
  }

  if (cancelDeleteHistory) {
    cancelDeleteHistory.onclick = closeDeleteHistoryModal;
  }

  if (cancelManualDeleteBtn) {
    cancelManualDeleteBtn.onclick = () => {
      setManualDeleteMode(false);
    };
  }

  if (selectAllOrdersBtn) {
    selectAllOrdersBtn.onclick = () => {
      document
        .querySelectorAll(".admin-order-select")
        .forEach((input) => {
          input.checked = true;
        });

      updateSelectedOrderCount();
    };
  }

  if (deleteSelectedOrdersBtn) {
    deleteSelectedOrdersBtn.onclick = deleteSelectedAdminOrders;
  }

  document.addEventListener("change", (event) => {
    if (
      event.target &&
      event.target.classList.contains("admin-order-select")
    ) {
      updateSelectedOrderCount();
    }
  });
}

function renderOrders(orders) {
  currentAdminOrders = Array.isArray(orders) ? orders : [];
  const target = A("orders");
  if (!target) return;

  if (!orders || !orders.length) {
    target.innerHTML = `
      <div class="order-empty">
        Belum ada order.
      </div>
    `;
    return;
  }

  target.innerHTML = orders
    .map((x) => {
      const name = displayName(x.user);
      const email = x.user?.email || "-";

      const durationMap = {
        permanent: "Permanen",
        "30_days": "30 Hari",
        "7_days": "7 Hari"
      };

      const customMatch = /^custom_(\d+)$/.exec(
        String(x.duration || "")
      );

      const duration = customMatch
        ? `${customMatch[1]} Hari`
        : durationMap[x.duration] || x.duration || "-";

      const statusClass = escapeHtml(x.status || "pending");

      const statusLabel = {
        pending: "Menunggu",
        approved: "Disetujui",
        rejected: "Ditolak"
      }[x.status] || x.status;

      return `
        <article class="admin-order-card" data-order-id="${escapeHtml(x.id)}">
          <label class="admin-order-select-wrap" hidden aria-hidden="true">
            <input
              type="checkbox"
              class="admin-order-select"
              value="${escapeHtml(x.id)}"
            >
            <span>Pilih</span>
          </label>


          <div class="order-user">
            <div class="order-avatar">
              ${escapeHtml(initials(x.user))}
            </div>

            <div>
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(email)}</small>
            </div>
          </div>

          <div class="order-summary">

            <div class="order-detail">
              <span>COIN</span>
              <strong>${Number(x.coins || 0).toLocaleString("id-ID")}</strong>
            </div>

            <div class="order-detail">
              <span>AKTIF</span>
              <strong>${escapeHtml(duration)}</strong>
            </div>

            <div class="order-detail">
              <span>HARGA</span>
              <strong>Rp${Number(x.price || 0).toLocaleString("id-ID")}</strong>
            </div>

            <div class="order-detail">
              <span>STATUS</span>
              <strong class="status ${statusClass}">
                ${escapeHtml(statusLabel)}
              </strong>
            </div>

          </div>

          <div class="order-actions">

            ${
              x.proofUrl
                ? `
                  <button
                    class="btn small secondary-btn"
                    type="button"
                    onclick='viewPaymentProof(${JSON.stringify(x.proofUrl)})'
                  >
                    Lihat Bukti
                  </button>
                `
                : ""
            }

            ${
              x.status === "pending"
                ? `
                  <button
                    class="btn small"
                    onclick="approve(
                      '${escapeHtml(x.id)}',
                      '${escapeHtml(name).replace(/'/g, "\\'")}',
                      ${Number(x.coins || 0)},
                      '${escapeHtml(duration).replace(/'/g, "\\'")}'
                    )"
                  >
                    Approve
                  </button>

                  <button
                    class="btn small danger"
                    onclick="rejectOrder('${escapeHtml(x.id)}')"
                  >
                    Reject
                  </button>
                `
                : ""
            }

          </div>

        </article>
      `;
    })
    .join("");
}
  setManualDeleteMode(manualDeleteMode);


async function loadAdmin() {
  try {
    const statsRes = await adminFetch("/api/admin/stats");

    if (!statsRes.success) {
      A("adminApp").style.display = "none";
      return;
    }

    A("loginPanel").style.display = "none";
    A("adminApp").style.display = "block";

    const stats = statsRes.stats;

    A("stats").innerHTML = `
      <article class="admin-stat-card">
        <span>USERS</span>
        <strong>${Number(stats.users || 0).toLocaleString("id-ID")}</strong>
        <small>Total pengguna</small>
      </article>

      <article class="admin-stat-card">
        <span>PENDING</span>
        <strong>${Number(stats.pending || 0).toLocaleString("id-ID")}</strong>
        <small>Menunggu pembayaran</small>
      </article>

      <article class="admin-stat-card">
        <span>API SUCCESS</span>
        <strong>${Number(stats.successful || 0).toLocaleString("id-ID")}</strong>
        <small>Request berhasil</small>
      </article>
    `;

    const [rankingRes, ordersRes] = await Promise.all([
      adminFetch("/api/admin/rankings"),
      adminFetch("/api/admin/orders")
    ]);

    if (rankingRes.success) {
      renderRanking(
        "topRequesters",
        rankingRes.rankings?.topRequesters || [],
        "requester"
      );

      renderRanking(
        "topCoins",
        rankingRes.rankings?.topCoins || [],
        "coins"
      );
    } else {
      A("topRequesters").innerHTML =
        `<div class="ranking-empty">Gagal memuat ranking.</div>`;

      A("topCoins").innerHTML =
        `<div class="ranking-empty">Gagal memuat ranking.</div>`;
    }

    if (ordersRes.success) {
      renderOrders(ordersRes.orders || []);
    } else {
      A("orders").innerHTML =
        `<div class="order-empty">Gagal memuat order.</div>`;
    }

  } catch (err) {
    console.error("[Admin]", err);

    A("loginMsg").textContent =
      "Gagal memuat data admin.";
  }
}

A("adminForm").onsubmit = async (e) => {
  e.preventDefault();

  const loginButton =
    A("adminForm").querySelector("button");

  loginButton.disabled = true;
  loginButton.textContent = "Login...";

  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: A("email").value,
        password: A("password").value
      })
    }).then((x) => x.json());

    if (r.success) {
      A("loginMsg").textContent = "";
      await loadAdmin();
    } else {
      A("loginMsg").textContent =
        r.error || "Login gagal.";
    }
  } catch {
    A("loginMsg").textContent =
      "Tidak dapat terhubung ke server.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
};

let approveOrderId = null;

function openApproveModal(id, userName, coins, duration) {
  const modal = A("approveModal");

  if (!modal) return;

  approveOrderId = id;

  const nameEl = A("approveUserName");
  const infoEl = A("approveOrderInfo");

  if (nameEl) {
    nameEl.textContent = userName || "Unknown User";
  }

  if (infoEl) {
    infoEl.textContent =
      `${Number(coins || 0).toLocaleString("id-ID")} coin · ${duration || "-"}`;
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeApproveModal() {
  const modal = A("approveModal");

  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  approveOrderId = null;
}

async function submitApproveOrder() {
  if (!approveOrderId) return;

  const button = A("confirmApprove");

  if (button) {
    button.disabled = true;
    button.textContent = "Menyetujui...";
  }

  try {
    const r = await adminFetch(
      "/api/admin/orders/" +
        encodeURIComponent(approveOrderId) +
        "/approve",
      {
        method: "POST"
      }
    );

    closeApproveModal();

    if (r.success) {
      loadAdmin();
    } else {
      toast(
        r.message || r.error || "Gagal menyetujui order.",
        "error",
        "Gagal Menyetujui Pembayaran"
      );
    }
  } catch (err) {
    console.error("[Admin Approve]", err);

    closeApproveModal();
    toast(
      "Gagal terhubung ke server.",
      "error",
      "Koneksi Gagal"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Setujui Pembelian";
    }
  }
}

function approve(id, userName = "", coins = 0, duration = "") {
  openApproveModal(id, userName, coins, duration);
}

A("cancelApprove")?.addEventListener(
  "click",
  closeApproveModal
);

document.querySelector("[data-close-approve]")?.addEventListener(
  "click",
  closeApproveModal
);

A("confirmApprove")?.addEventListener(
  "click",
  submitApproveOrder
);

let rejectOrderId = null;

function openRejectModal(id) {
  const modal = A("rejectModal");
  const reason = A("rejectReason");

  if (!modal || !reason) return;

  rejectOrderId = id;

  reason.value = "Pembayaran tidak valid.";

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    reason.focus();
    reason.select();
  }, 50);
}

function closeRejectModal() {
  const modal = A("rejectModal");

  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  rejectOrderId = null;
}

async function submitRejectOrder() {
  if (!rejectOrderId) return;

  const reasonInput = A("rejectReason");
  const button = A("confirmReject");

  const reason =
    reasonInput?.value.trim() ||
    "Pembayaran tidak valid.";

  if (button) {
    button.disabled = true;
    button.textContent = "Menolak...";
  }

  try {
    const r = await adminFetch(
      "/api/admin/orders/" +
        encodeURIComponent(rejectOrderId) +
        "/reject",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      }
    );

    closeRejectModal();

    if (r.success) {
      loadAdmin();
    } else {
      toast(
        r.message || r.error || "Gagal menolak order.",
        "error",
        "Gagal Menolak Pembayaran"
      );
    }
  } catch (err) {
    console.error("[Admin Reject]", err);

    closeRejectModal();
    toast(
      "Gagal terhubung ke server.",
      "error",
      "Koneksi Gagal"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Tolak Pembelian";
    }
  }
}

function rejectOrder(id) {
  openRejectModal(id);
}

A("cancelReject")?.addEventListener("click", closeRejectModal);

document.querySelector("[data-close-reject]")?.addEventListener(
  "click",
  closeRejectModal
);

A("confirmReject")?.addEventListener(
  "click",
  submitRejectOrder
);

A("rejectReason")?.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    submitRejectOrder();
  }

  if (e.key === "Escape") {
    closeRejectModal();
  }
});

loadAdmin();

window.viewPaymentProof = viewPaymentProof;


// Pastikan kontrol delete history terpasang setelah DOM tersedia.
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initDeleteHistoryControls,
    { once: true }
  );
} else {
  initDeleteHistoryControls();
}
