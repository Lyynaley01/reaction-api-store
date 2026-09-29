const $ = id => document.getElementById(id);

let me = null;
let packages = [];

async function load() {
  const r = await api("/api/me");

  if (!r.success) {
    location.href = "/login.html";
    return;
  }

  me = r.user;

  $("hello").textContent = "Hi, " + (me.name || me.email);
  $("coins").textContent = Number(me.coins || 0).toLocaleString("id-ID");
  $("key").textContent = me.apiKey || "—";

  await loadPackages();
  await loadOrders();
  await loadUsage();
}

async function loadPackages() {
  const r = await api("/api/packages");

  if (!r.success) {
    toast(r.error || "Gagal memuat paket.", "error");
    return;
  }

  packages = r.packages || [];

  const select = $("duration");

  select.innerHTML = packages
    .map(p => `<option value="${p.duration}">${p.name}</option>`)
    .join("");

  select.onchange = updatePrice;

  updatePrice();
}

function updatePrice() {
  const p = packages.find(
    x => x.duration === $("duration").value
  );

  if (!p) return;

  $("buyCoins").value = p.coins;
  $("buyCoins").readOnly = true;
  $("packageInfo").textContent = p.description || "";

  $("price").textContent =
    "Rp" + Number(p.price).toLocaleString("id-ID");
}

async function createOrder() {
  const p = packages.find(
    x => x.duration === $("duration").value
  );

  if (!p) {
    toast("Paket tidak ditemukan.", "error");
    return;
  }

  const r = await api("/api/orders", "POST", {
    coins: p.coins,
    duration: p.duration
  });

  if (!r.success) {
    toast(r.error || "Gagal membuat order.", "error");
    return;
  }

  $("orderMsg").textContent =
    `Order ${r.order.id} dibuat. Total Rp${Number(r.order.price).toLocaleString("id-ID")}. Upload bukti setelah pembayaran.`;

  toast(
    `Order ${r.order.id} berhasil dibuat.`,
    "success",
    "Order Dibuat"
  );

  await loadOrders();
}

async function loadOrders() {
  const r = await api("/api/orders");

  if (!r.success) {
    $("orders").textContent = "Gagal memuat order.";
    return;
  }

  $("orders").innerHTML =
    r.orders?.length
      ? r.orders.map(o => `
          <div class="row">
            <div>
              <b>${escapeHtml(o.id)}</b>
              <br>
              ${Number(o.coins).toLocaleString("id-ID")} coin
              · ${escapeHtml(o.duration)}
              · Rp${Number(o.price).toLocaleString("id-ID")}
            </div>

            <span class="status ${escapeHtml(o.status)}">
              ${escapeHtml(o.status)}
            </span>

            ${
              o.status === "pending"
                ? `
                  <label class="upload">
                    Upload bukti
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onchange="proof('${escapeHtml(o.id)}',this.files[0])"
                    >
                  </label>
                `
                : ""
            }
          </div>
        `).join("")
      : "Belum ada order.";
}

async function proof(id, file) {
  if (!file) return;

  const fd = new FormData();
  fd.append("proof", file);

  const r = await fetch(
    "/api/orders/" + encodeURIComponent(id) + "/proof",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.token
      },
      body: fd
    }
  );

  const j = await r.json().catch(() => ({
    success: false,
    error: "INVALID_SERVER_RESPONSE"
  }));

  if (!j.success) {
    toast(j.error || "Upload bukti gagal.", "error");
    return;
  }

  toast(
    "Bukti pembayaran berhasil dikirim.",
    "success",
    "Bukti Terkirim"
  );

  await loadOrders();
}

async function loadUsage() {
  const r = await api("/api/usage");

  if (!r.success) {
    $("usage").textContent = "Gagal memuat riwayat.";
    return;
  }

  $("usage").innerHTML =
    r.usage?.length
      ? r.usage.map(x => `
          <div class="row">
            <div>
              <b>${escapeHtml(x.reaction)}</b>
              · ${escapeHtml(x.status)}
              <br>
              <small>${escapeHtml(x.url)}</small>
            </div>

            <span>
              ${Number(x.coinUsed || 0).toLocaleString("id-ID")} coin
            </span>
          </div>
        `).join("")
      : "Belum ada penggunaan.";
}

async function copyText(text, label="Teks") {
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

function copyKey() {
  if (!me?.apiKey) {
    toast("API key belum tersedia.", "error");
    return;
  }

  copyText(me.apiKey, "API key");
}

async function regen() {
  const confirmed = await confirmModal(
    "API key lama akan langsung tidak berlaku. Semua aplikasi yang menggunakan key lama harus diperbarui.",
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
  $("key").textContent = r.apiKey;

  toast(
    "API key baru berhasil dibuat.",
    "success",
    "API Key Diperbarui"
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

load();
