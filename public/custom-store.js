(() => {
  "use strict";

  const MIN_COINS = 100;
  const STEP_COINS = 50;

  let unitCoins = 100;
  let unitPrice = 5000;

  const money = (value) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);

  const priceFor = (coins) =>
    Math.ceil(Number(coins) / unitCoins) * unitPrice;

  async function loadPricing() {
    try {
      const res = await fetch("/api/packages");
      const data = await res.json();

      if (data.success && data.unit) {
        unitCoins = Number(data.unit.coins) || 100;
        unitPrice = Number(data.unit.price) || 5000;
      }
    } catch {}
  }

  function toastMsg(message, type, title) {
    if (typeof window.toast === "function") {
      window.toast(message, type, title);
    } else {
      alert(message);
    }
  }

  function createCustomCard() {
    const card = document.createElement("article");
    card.className = "package-card custom-package-card";
    card.dataset.customPackage = "true";

    card.innerHTML = `
      <div class="package-card-top">
        <span class="package-badge">CUSTOM</span>
        <span class="package-icon">✦</span>
      </div>

      <h3>Custom Coins</h3>
      <p class="package-description">
        Pilih jumlah coin dan durasi sesuai kebutuhan.
      </p>

      <div class="custom-fields">
        <label class="custom-field">
          <span>Jumlah Coin</span>
          <div class="coin-input-wrap">
            <input
              id="customCoins"
              type="number"
              min="100"
              step="50"
              value="100"
              inputmode="numeric"
            >
            <span>COINS</span>
          </div>
          <small>Minimal 100 · kelipatan 50</small>
        </label>

        <label class="custom-field">
          <span>Durasi</span>
          <select id="customDuration">
            <option value="7_days">7 Hari</option>
            <option value="30_days">30 Hari</option>
            <option value="permanent">Permanen</option>
          </select>
        </label>
      </div>

      <div class="custom-price-box">
        <small>TOTAL HARGA</small>
        <strong id="customPrice">${money(priceFor(100))}</strong>
      </div>

      <button class="primary-btn custom-buy-btn" type="button">
        Buat Pesanan →
      </button>
    `;

    const input = card.querySelector("#customCoins");
    const price = card.querySelector("#customPrice");
    const button = card.querySelector(".custom-buy-btn");

    function updatePrice() {
      const raw = input.value.trim();

      if (!raw) {
        price.textContent = money(priceFor(MIN_COINS));
        return;
      }

      const value = Number(raw);

      if (Number.isFinite(value) && value >= MIN_COINS) {
        price.textContent = money(priceFor(value));
      }
    }

    function normalize() {
      let value = Number(input.value);

      if (!Number.isFinite(value) || value < MIN_COINS) {
        value = MIN_COINS;
      }

      value = Math.floor(value / STEP_COINS) * STEP_COINS;

      if (value < MIN_COINS) {
        value = MIN_COINS;
      }

      input.value = value;
      price.textContent = money(priceFor(value));
    }

    input.addEventListener("input", updatePrice);
    input.addEventListener("blur", normalize);

    button.addEventListener("click", async () => {
      normalize();

      const coins = Number(input.value);
      const duration = card.querySelector("#customDuration").value;
      const token = localStorage.getItem("token");

      if (!token) {
        location.href = "/login.html";
        return;
      }

      button.disabled = true;
      button.textContent = "Membuat pesanan...";

      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            custom: true,
            coins,
            duration
          })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.message ||
            data.error ||
            "Gagal membuat pesanan."
          );
        }

        toastMsg(
          `Order ${coins.toLocaleString("id-ID")} coin berhasil dibuat.`,
          "success",
          "Order Created"
        );

        if (typeof window.loadOrders === "function") {
          await window.loadOrders();
        }

        const orders = document.getElementById("orders");

        if (orders) {
          setTimeout(() => {
            orders.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          }, 150);
        }
      } catch (err) {
        toastMsg(
          err.message || "Gagal membuat pesanan.",
          "error",
          "Order Failed"
        );
      } finally {
        button.disabled = false;
        button.textContent = "Buat Pesanan →";
      }
    });

    return card;
  }

  function enhancePackages() {
    const list = document.getElementById("packagesList");
    if (!list) return;

    list.classList.add("package-carousel");

    if (!list.querySelector("[data-custom-package='true']")) {
      list.appendChild(createCustomCard());
    }
  }

  async function init() {
    await loadPricing();

    const list = document.getElementById("packagesList");
    if (!list) return;

    enhancePackages();

    new MutationObserver(enhancePackages).observe(list, {
      childList: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
