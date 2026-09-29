(() => {
  "use strict";

  const MIN_COINS = 100;
  const MAX_COINS = 5000;
  const STEP_COINS = 50;

  const MIN_DAYS = 3;
  const MAX_DAYS = 30;

  let unitCoins = 100;
  let unitPrice = 5000;

  const money = (value) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);

  const priceFor = (coins, days) => {
    const basePrice =
      Math.ceil(Number(coins) / unitCoins) * unitPrice;

    const extraDayPrice =
      Math.max(0, Number(days) - MIN_DAYS) * 1000;

    return basePrice + extraDayPrice;
  };

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
        Atur jumlah coin dan masa aktif sesuai kebutuhan.
      </p>

      <div class="custom-slider-group">
        <div class="custom-slider-head">
          <span>COINS</span>
          <strong id="customCoinsValue">100</strong>
        </div>

        <input
          id="customCoins"
          class="custom-range"
          type="range"
          min="100"
          max="5000"
          step="50"
          value="100"
        >

        <div class="custom-range-labels">
          <span>100</span>
          <span>5.000</span>
        </div>
      </div>

      <div class="custom-slider-group">
        <div class="custom-slider-head">
          <span>MASA AKTIF</span>
          <strong><span id="customDaysValue">3</span> Hari</strong>
        </div>

        <input
          id="customDays"
          class="custom-range"
          type="range"
          min="3"
          max="30"
          step="1"
          value="3"
        >

        <div class="custom-range-labels">
          <span>3 Hari</span>
          <span>30 Hari</span>
        </div>
      </div>

      <div class="custom-price-box">
        <small>TOTAL HARGA</small>
        <strong id="customPrice">${money(priceFor(100, 3))}</strong>
      </div>

      <button class="primary-btn custom-buy-btn" type="button">
        Buat Pesanan →
      </button>
    `;

    const coinSlider = card.querySelector("#customCoins");
    const coinValue = card.querySelector("#customCoinsValue");

    const daySlider = card.querySelector("#customDays");
    const dayValue = card.querySelector("#customDaysValue");

    const price = card.querySelector("#customPrice");
    const button = card.querySelector(".custom-buy-btn");

    function update() {
      const coins = Number(coinSlider.value);
      const days = Number(daySlider.value);

      coinValue.textContent = coins.toLocaleString("id-ID");
      dayValue.textContent = days;
      price.textContent = money(priceFor(coins, days));
    }

    coinSlider.addEventListener("input", update);
    daySlider.addEventListener("input", update);

    button.addEventListener("click", async () => {
      const coins = Number(coinSlider.value);
      const days = Number(daySlider.value);

      const token = localStorage.getItem("token");

      if (!token) {
        location.href = "/login.html";
        return;
      }

      if (
        coins < MIN_COINS ||
        coins > MAX_COINS ||
        coins % STEP_COINS !== 0
      ) {
        toastMsg(
          "Jumlah coin harus 100 sampai 5.000 dan kelipatan 50.",
          "error",
          "Invalid Coins"
        );
        return;
      }

      if (days < MIN_DAYS || days > MAX_DAYS) {
        toastMsg(
          "Masa aktif harus antara 3 sampai 30 hari.",
          "error",
          "Invalid Duration"
        );
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
            duration: `custom_${days}`
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
          `Order ${coins.toLocaleString("id-ID")} coin · ${days} hari berhasil dibuat.`,
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

    update();

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
