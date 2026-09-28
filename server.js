require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_FILE = path.join(__dirname, "data", "db.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const COIN_UNIT = Math.max(1, Number(process.env.COIN_UNIT || 100));
const COIN_UNIT_PRICE = Math.max(0, Number(process.env.COIN_UNIT_PRICE || 5000));
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 5));

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      users: [],
      orders: [],
      usage: [],
      settings: { createdAt: new Date().toISOString() }
    };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: [], orders: [], usage: [], settings: {} };
  }
}

let db = loadDB();

function saveDB() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function apiKey() {
  return "rak_" + crypto.randomBytes(24).toString("hex");
}

function now() {
  return new Date().toISOString();
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    coins: u.coins || 0,
    coinExpiry: u.coinExpiry || null,
    apiKey: u.apiKey,
    createdAt: u.createdAt
  };
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || "user" },
    process.env.JWT_SECRET || "dev-secret-change-me",
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    const user = db.users.find(x => x.id === payload.sub);
    if (!user) return res.status(401).json({ success: false, error: "USER_NOT_FOUND" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
  }
}

function adminAuth(req, res, next) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.adminToken;

  if (!token) return res.status(401).json({ success: false, error: "ADMIN_UNAUTHORIZED" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    if (payload.role !== "admin" || payload.email !== email) throw new Error();
    next();
  } catch {
    return res.status(401).json({ success: false, error: "ADMIN_UNAUTHORIZED" });
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isExpired(user) {
  return user.coinExpiry && new Date(user.coinExpiry).getTime() <= Date.now();
}

function availableCoins(user) {
  if (isExpired(user)) return 0;
  return Math.max(0, Number(user.coins || 0));
}

function addCoins(user, coins, duration) {
  const amount = Number(coins);
  user.coins = availableCoins(user) + amount;

  if (duration === "permanent") {
    user.coinExpiry = null;
  } else {
    const days = duration === "7d" ? 7 : 30;
    const base = user.coinExpiry && new Date(user.coinExpiry).getTime() > Date.now()
      ? new Date(user.coinExpiry)
      : new Date();
    base.setDate(base.getDate() + days);
    user.coinExpiry = base.toISOString();
  }
}

function packageOptions() {
  return [
    { id: "permanent", name: "Permanen", duration: "permanent" },
    { id: "30d", name: "30 Hari", duration: "30d" },
    { id: "7d", name: "7 Hari", duration: "7d" }
  ];
}

function packagePrice(coins) {
  return Math.ceil(Number(coins) / COIN_UNIT) * COIN_UNIT_PRICE;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 8);
      cb(null, id("proof_") + ext);
    }
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Format bukti harus JPG, PNG, WEBP, atau PDF."), ok);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_, res) => {
  res.json({ success: true, service: "reaction-api-store", time: now() });
});

app.get("/api/config", (_, res) => {
  res.json({
    success: true,
    publicUrl: process.env.PUBLIC_URL || "",
    coinUnit: COIN_UNIT,
    coinUnitPrice: COIN_UNIT_PRICE,
    packages: packageOptions().map(x => ({
      ...x,
      examples: [100, 500, 1000].map(coins => ({
        coins,
        price: packagePrice(coins)
      }))
    }))
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name || "").trim().slice(0, 80);
  const password = String(req.body.password || "");

  if (!validEmail(email)) return res.status(400).json({ success: false, error: "INVALID_EMAIL" });
  if (password.length < 6) return res.status(400).json({ success: false, error: "PASSWORD_MIN_6" });
  if (db.users.some(x => x.email === email)) return res.status(409).json({ success: false, error: "EMAIL_EXISTS" });

  const user = {
    id: id("usr_"),
    email,
    name: name || email.split("@")[0],
    passwordHash: await bcrypt.hash(password, 12),
    apiKey: apiKey(),
    coins: 0,
    coinExpiry: null,
    role: "user",
    createdAt: now()
  };

  db.users.push(user);
  saveDB();

  res.json({
    success: true,
    token: issueToken(user),
    user: publicUser(user)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = db.users.find(x => x.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, error: "INVALID_LOGIN" });
  }

  res.json({ success: true, token: issueToken(user), user: publicUser(user) });
});

app.post("/api/auth/logout", (_, res) => res.json({ success: true }));

app.get("/api/me", auth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.post("/api/me/regenerate-key", auth, (req, res) => {
  req.user.apiKey = apiKey();
  saveDB();
  res.json({ success: true, apiKey: req.user.apiKey });
});

app.get("/api/packages", (_, res) => {
  res.json({
    success: true,
    unit: { coins: COIN_UNIT, price: COIN_UNIT_PRICE },
    packages: packageOptions(),
    calculate: (coins) => packagePrice(coins)
  });
});

app.post("/api/orders", auth, (req, res) => {
  const coins = Number(req.body.coins);
  const duration = String(req.body.duration || "permanent");

  if (!Number.isInteger(coins) || coins < 100) {
    return res.status(400).json({ success: false, error: "COINS_MIN_100_INTEGER" });
  }
  if (coins % 100 !== 0) {
    return res.status(400).json({ success: false, error: "COINS_MUST_BE_MULTIPLE_OF_100" });
  }
  if (!["permanent", "7d", "30d"].includes(duration)) {
    return res.status(400).json({ success: false, error: "INVALID_DURATION" });
  }

  const order = {
    id: id("ord_"),
    userId: req.user.id,
    coins,
    duration,
    price: packagePrice(coins),
    status: "pending",
    proofFile: null,
    createdAt: now(),
    updatedAt: now()
  };

  db.orders.unshift(order);
  saveDB();

  res.json({
    success: true,
    order: {
      ...order,
      paymentInstructions: {
        message: "Bayar sesuai total lalu upload bukti pembayaran melalui dashboard.",
        total: order.price
      }
    }
  });
});

app.get("/api/orders", auth, (req, res) => {
  res.json({
    success: true,
    orders: db.orders.filter(x => x.userId === req.user.id).slice(0, 50)
  });
});

app.post("/api/orders/:id/proof", auth, upload.single("proof"), (req, res) => {
  const order = db.orders.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!order) return res.status(404).json({ success: false, error: "ORDER_NOT_FOUND" });
  if (order.status !== "pending") return res.status(400).json({ success: false, error: "ORDER_NOT_PENDING" });
  if (!req.file) return res.status(400).json({ success: false, error: "PROOF_REQUIRED" });

  order.proofFile = req.file.filename;
  order.updatedAt = now();
  saveDB();

  res.json({ success: true, message: "Bukti pembayaran berhasil dikirim." });
});

app.get("/api/usage", auth, (req, res) => {
  res.json({
    success: true,
    usage: db.usage.filter(x => x.userId === req.user.id).slice(0, 100)
  });
});

function extractApiKey(req) {
  if (req.headers["x-api-key"]) return String(req.headers["x-api-key"]);
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return "";
}

function getApiUser(req) {
  const key = extractApiKey(req);
  if (!key) return null;
  return db.users.find(u => u.apiKey === key) || null;
}

app.post("/api/v1/reaction", async (req, res) => {
  const user = getApiUser(req);
  if (!user) return res.status(401).json({ success: false, error: "INVALID_API_KEY" });

  const url = String(req.body.url || "").trim();
  const reaction = String(req.body.reaction || "").trim();

  if (!url) return res.status(400).json({ success: false, error: "URL_REQUIRED" });
  if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ success: false, error: "INVALID_URL" });
  if (!reaction || reaction.length > 16) return res.status(400).json({ success: false, error: "INVALID_REACTION" });

  const coins = availableCoins(user);
  if (coins < 1) {
    return res.status(402).json({
      success: false,
      error: "INSUFFICIENT_COINS",
      coin_remaining: coins
    });
  }

  const started = Date.now();

  try {
    const upstream = await axios.get(process.env.ZXC_API_URL, {
      params: {
        api_key: process.env.ZXC_API_KEY,
        url,
        reaction
      },
      headers: {
        "User-Agent": "Reaction-API-Store/1.0"
      },
      timeout: 60000,
      validateStatus: () => true
    });

    const data = upstream.data || {};

    if (!data.success) {
      db.usage.unshift({
        id: id("use_"),
        userId: user.id,
        status: "failed",
        coinUsed: 0,
        url,
        reaction,
        upstreamStatus: upstream.status,
        error: data?.error?.message || data?.message || "Upstream request failed",
        createdAt: now()
      });
      saveDB();

      return res.status(502).json({
        success: false,
        error: "UPSTREAM_FAILED",
        message: data?.error?.message || data?.message || "Reaction provider gagal.",
        upstream_status: upstream.status
      });
    }

    // Potong tepat 1 coin hanya setelah upstream sukses.
    user.coins = coins - 1;

    db.usage.unshift({
      id: id("use_"),
      userId: user.id,
      status: "success",
      coinUsed: 1,
      url,
      reaction,
      upstreamStatus: upstream.status,
      latencyMs: Date.now() - started,
      createdAt: now()
    });
    saveDB();

    return res.json({
      success: true,
      message: "Reaction berhasil diproses.",
      coin_used: 1,
      coin_remaining: user.coins,
      task: data.task || null,
      vip: data.vip || null
    });
  } catch (err) {
    db.usage.unshift({
      id: id("use_"),
      userId: user.id,
      status: "failed",
      coinUsed: 0,
      url,
      reaction,
      error: err.message,
      createdAt: now()
    });
    saveDB();

    return res.status(502).json({
      success: false,
      error: "UPSTREAM_UNREACHABLE",
      message: "Provider reaction tidak dapat dihubungi."
    });
  }
});

// Admin
app.post("/api/admin/login", (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (
    email !== normalizeEmail(process.env.ADMIN_EMAIL || "") ||
    password !== String(process.env.ADMIN_PASSWORD || "")
  ) {
    return res.status(401).json({ success: false, error: "INVALID_ADMIN_LOGIN" });
  }

  const token = jwt.sign(
    { role: "admin", email },
    process.env.JWT_SECRET || "dev-secret-change-me",
    { expiresIn: "12h" }
  );

  res.json({ success: true, token });
});

app.get("/api/admin/stats", adminAuth, (_, res) => {
  const users = db.users.length;
  const pending = db.orders.filter(x => x.status === "pending").length;
  const successful = db.usage.filter(x => x.status === "success").length;
  res.json({ success: true, stats: { users, pending, successful } });
});

app.get("/api/admin/orders", adminAuth, (_, res) => {
  const result = db.orders.map(o => {
    const u = db.users.find(x => x.id === o.userId);
    return {
      ...o,
      user: u ? { id: u.id, email: u.email, name: u.name } : null,
      proofUrl: o.proofFile ? `/api/admin/proof/${encodeURIComponent(o.proofFile)}` : null
    };
  });
  res.json({ success: true, orders: result.slice(0, 200) });
});

app.get("/api/admin/proof/:file", adminAuth, (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return res.sendStatus(404);
  res.sendFile(full);
});

app.post("/api/admin/orders/:id/approve", adminAuth, (req, res) => {
  const order = db.orders.find(x => x.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, error: "ORDER_NOT_FOUND" });
  if (order.status !== "pending") return res.status(400).json({ success: false, error: "ORDER_NOT_PENDING" });

  const user = db.users.find(x => x.id === order.userId);
  if (!user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  addCoins(user, order.coins, order.duration);
  order.status = "approved";
  order.updatedAt = now();
  order.approvedAt = now();
  saveDB();

  res.json({ success: true, message: "Order approved dan coin masuk." });
});

app.post("/api/admin/orders/:id/reject", adminAuth, (req, res) => {
  const order = db.orders.find(x => x.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, error: "ORDER_NOT_FOUND" });
  if (order.status !== "pending") return res.status(400).json({ success: false, error: "ORDER_NOT_PENDING" });

  order.status = "rejected";
  order.reason = String(req.body.reason || "Pembayaran tidak valid.").slice(0, 300);
  order.updatedAt = now();
  saveDB();

  res.json({ success: true, message: "Order ditolak." });
});

app.get("/docs", (_, res) => res.sendFile(path.join(__dirname, "public", "docs.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError || err.message?.includes("Format bukti")) {
    return res.status(400).json({ success: false, error: err.message });
  }
  res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR" });
});

app.listen(PORT, () => {
  console.log(`Reaction API Store aktif di http://127.0.0.1:${PORT}`);
  console.log(`Upstream: ${process.env.ZXC_API_URL || "(belum diatur)"}`);
});
