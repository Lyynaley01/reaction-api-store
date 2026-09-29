const A = (id) => document.getElementById(id);

function adminHeaders() {
  return {
    Authorization: "Bearer " + localStorage.adminToken
  };
}

async function adminFetch(url, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    ...adminHeaders()
  };

  const r = await fetch(url, opts);
  return r.json();
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

function renderOrders(orders) {
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
        <article class="admin-order-card">

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
                  <a
                    class="btn small secondary-btn"
                    target="_blank"
                    rel="noopener"
                    href="${escapeHtml(x.proofUrl)}"
                  >
                    Lihat Bukti
                  </a>
                `
                : ""
            }

            ${
              x.status === "pending"
                ? `
                  <button
                    class="btn small"
                    onclick="approve('${escapeHtml(x.id)}')"
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
      localStorage.adminToken = r.token;
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

async function approve(id) {
  const r = await adminFetch(
    "/api/admin/orders/" + encodeURIComponent(id) + "/approve",
    {
      method: "POST"
    }
  );

  alert(r.message || r.error || "Selesai.");
  loadAdmin();
}

async function rejectOrder(id) {
  const reason = prompt(
    "Alasan penolakan?",
    "Pembayaran tidak valid."
  );

  if (reason === null) return;

  const r = await adminFetch(
    "/api/admin/orders/" + encodeURIComponent(id) + "/reject",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason })
    }
  );

  alert(r.message || r.error || "Selesai.");
  loadAdmin();
}

loadAdmin();
