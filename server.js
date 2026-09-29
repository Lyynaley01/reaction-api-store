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
const { createClient } = require("@supabase/supabase-js");

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL dan SUPABASE_SECRET_KEY wajib diatur.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {	
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
const PORT = Number(process.env.PORT || 3000);

const COIN_UNIT = Math.max(1, Number(process.env.COIN_UNIT || 100));
const COIN_UNIT_PRICE = Math.max(0, Number(process.env.COIN_UNIT_PRICE || 5000));

// Paket penjualan — bisa diatur sendiri lewat .env / Vercel Environment Variables.
// Permanen default: 999.999 coin dan aktif selamanya.
const PACKAGE_CONFIG = {
  permanent: {
    coins: Math.max(1, Number(process.env.PACKAGE_PERMANENT_COINS || 999999)),
    price: Math.max(0, Number(process.env.PACKAGE_PERMANENT_PRICE || 5000000))
  },
  "30_days": {
    coins: Math.max(1, Number(process.env.PACKAGE_30D_COINS || 1000)),
    price: Math.max(0, Number(process.env.PACKAGE_30D_PRICE || 50000))
  },
  "7_days": {
    coins: Math.max(1, Number(process.env.PACKAGE_7D_COINS || 500)),
    price: Math.max(0, Number(process.env.PACKAGE_7D_PRICE || 25000))
  }
};
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 5));

function id(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function apiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let random = "";

  for (let i = 0; i < 4; i++) {
    random += chars[crypto.randomInt(chars.length)];
  }

  return "RELS-REACTION-" + random;
}

function now() {
  return new Date().toISOString();
}

async function getUserById(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserByApiKey(key) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("api_key", key)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    coins: u.coins || 0,
    coinExpiry: u.coin_expiry || null,
    apiKey: u.api_key,
    createdAt: u.created_at
  };
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || "user" },
    process.env.JWT_SECRET || "dev-secret-change-me",
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED"
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev-secret-change-me"
    );

    const user = await getUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "USER_NOT_FOUND"
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[Auth]", err.message);

    return res.status(401).json({
      success: false,
      error: "INVALID_TOKEN"
    });
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
  return user.coin_expiry &&
    new Date(user.coin_expiry).getTime() <= Date.now();
}

function availableCoins(user) {
  if (isExpired(user)) return 0;
  return Math.max(0, Number(user.coins || 0));
}

function calculateCoinExpiry(currentExpiry, duration) {
  if (duration === "permanent") {
    return null;
  }

  const days = duration === "7_days" ? 7 : 30;

  const base =
    currentExpiry &&
    new Date(currentExpiry).getTime() > Date.now()
      ? new Date(currentExpiry)
      : new Date();

  base.setDate(base.getDate() + days);

  return base.toISOString();
}

function packageOptions() {
  return [
    { id: "permanent", name: "Permanen", duration: "permanent", coins: PACKAGE_CONFIG.permanent.coins, price: PACKAGE_CONFIG.permanent.price, description: "999.999 coin, aktif selamanya." },
    { id: "30_days", name: "30 Hari", duration: "30_days", coins: PACKAGE_CONFIG["30_days"].coins, price: PACKAGE_CONFIG["30_days"].price, description: "Aktif 30 hari sejak paket disetujui." },
    { id: "7_days", name: "7 Hari", duration: "7_days", coins: PACKAGE_CONFIG["7_days"].coins, price: PACKAGE_CONFIG["7_days"].price, description: "Aktif 7 hari sejak paket disetujui." }
  ];
}

function packagePrice(coins) {
  return Math.ceil(Number(coins) / COIN_UNIT) * COIN_UNIT_PRICE;
}

function packageByDuration(duration) {
  return PACKAGE_CONFIG[duration] || null;
}

const upload = multer({
  storage: multer.memoryStorage(),
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
  try {
    const email = normalizeEmail(req.body.email);
    const name = String(req.body.name || "").trim().slice(0, 80);
    const password = String(req.body.password || "");

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_EMAIL"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "PASSWORD_MIN_6"
      });
    }

    const existing = await getUserByEmail(email);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "EMAIL_EXISTS"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const newApiKey = apiKey();

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        email,
        name: name || email.split("@")[0],
        password_hash: passwordHash,
        api_key: newApiKey,
        coins: 0,
        coin_expiry: null,
        role: "user"
      })
      .select("*")
      .single();

    if (error) {
      console.error("[Register]", error);

      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "EMAIL_EXISTS"
        });
      }

      throw error;
    }

    res.json({
      success: true,
      token: issueToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error("[Register]", err);

    res.status(500).json({
      success: false,
      error: "REGISTER_FAILED"
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const user = await getUserByEmail(email);

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        success: false,
        error: "INVALID_LOGIN"
      });
    }

    res.json({
      success: true,
      token: issueToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error("[Login]", err);

    res.status(500).json({
      success: false,
      error: "LOGIN_FAILED"
    });
  }
});

app.post("/api/auth/logout", (_, res) => res.json({ success: true }));

app.get("/api/me", auth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.post("/api/me/regenerate-key", auth, async (req, res) => {
  try {
    const newApiKey = apiKey();

    const { data: user, error } = await supabase
      .from("users")
      .update({
        api_key: newApiKey,
        updated_at: now()
      })
      .eq("id", req.user.id)
      .select("*")
      .single();

    if (error) throw error;

    res.json({
      success: true,
      apiKey: user.api_key
    });
  } catch (err) {
    console.error("[Regenerate API Key]", err);

    res.status(500).json({
      success: false,
      error: "API_KEY_REGENERATE_FAILED"
    });
  }
});

app.get("/api/packages", (_, res) => {
  res.json({
    success: true,
    unit: { coins: COIN_UNIT, price: COIN_UNIT_PRICE },
    packages: packageOptions(),
    calculate: (coins) => packagePrice(coins)
  });
});

app.post("/api/orders", auth, async (req, res) => {
  try {
    const duration = String(req.body.duration || "permanent");
    const selectedPackage = packageByDuration(duration);
    if (!selectedPackage) {
      return res.status(400).json({ success: false, error: "INVALID_DURATION" });
    }

    // Coin dan harga selalu mengikuti konfigurasi paket.
    // Nilai coins dari frontend tidak boleh mengubah harga paket.
    const coins = selectedPackage.coins;
    const price = selectedPackage.price;

    const createdAt = now();

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: req.user.id,
        coins,
        price,
        duration,
        status: "pending",
        payment_proof: null,
        created_at: createdAt,
        updated_at: createdAt
      })
      .select("*")
      .single();

    if (error) throw error;

    res.json({
      success: true,
      order: {
        ...order,
        paymentInstructions: {
          message:
            "Bayar sesuai total lalu upload bukti pembayaran melalui dashboard.",
          total: order.price
        }
      }
    });
  } catch (err) {
    console.error("[Create Order]", err);

    res.status(500).json({
      success: false,
      error: "ORDER_CREATE_FAILED"
    });
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      orders: orders || []
    });
  } catch (err) {
    console.error("[Orders]", err);

    res.status(500).json({
      success: false,
      error: "ORDERS_FETCH_FAILED"
    });
  }
});

app.post("/api/orders/:id/proof", auth, upload.single("proof"), async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "ORDER_NOT_FOUND"
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "ORDER_NOT_PENDING"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "PROOF_REQUIRED"
      });
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase().slice(0, 8);
    const safeExt = ext || ".bin";
    const storagePath = `${req.user.id}/${order.id}/${id("proof_")}${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_proof: storagePath,
        updated_at: now()
      })
      .eq("id", order.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: "Bukti pembayaran berhasil dikirim."
    });
  } catch (err) {
    console.error("[Order Proof]", err);

    res.status(500).json({
      success: false,
      error: "PROOF_UPLOAD_FAILED"
    });
  }
});

app.get("/api/usage", auth, async (req, res) => {
  try {
    const { data: usage, error } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      usage: usage || []
    });
  } catch (err) {
    console.error("[Usage]", err);

    res.status(500).json({
      success: false,
      error: "USAGE_FETCH_FAILED"
    });
  }
});

function extractApiKey(req) {
  if (req.headers["x-api-key"]) return String(req.headers["x-api-key"]);
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return "";
}

async function getApiUser(req) {
  const key = extractApiKey(req);
  if (!key) return null;

  return await getUserByApiKey(key);
}

app.post("/api/v1/reaction", async (req, res) => {
  const user = await getApiUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "INVALID_API_KEY"
    });
  }

  const url = String(req.body.url || "").trim();
  const reaction = String(req.body.reaction || "").trim();

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "URL_REQUIRED"
    });
  }

  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_URL"
    });
  }

  if (!reaction || reaction.length > 16) {
    return res.status(400).json({
      success: false,
      error: "INVALID_REACTION"
    });
  }

  // Reserve tepat 1 coin secara atomic.
  const { data: remaining, error: consumeError } = await supabase
    .rpc("consume_one_coin", {
      p_user_id: user.id
    });

  if (consumeError) {
    console.error("[Coin Consume]", consumeError);

    return res.status(500).json({
      success: false,
      error: "COIN_TRANSACTION_FAILED"
    });
  }

  const coinRemainingAfterReserve = Number(remaining);

  if (coinRemainingAfterReserve < 0) {
    return res.status(402).json({
      success: false,
      error: "INSUFFICIENT_COINS",
      coin_remaining: 0
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

    // Provider gagal → kembalikan coin yang tadi di-reserve.
    if (!data.success) {
      const { error: refundError } = await supabase.rpc(
        "refund_one_coin",
        {
          p_user_id: user.id
        }
      );

      if (refundError) {
        console.error("[Coin Refund]", refundError);
      }

      await supabase.from("usage_logs").insert({
        user_id: user.id,
        endpoint: "/api/v1/reaction",
        target_url: url,
        reaction,
        coins_used: 0,
        status: "failed",
        response_data: {
          upstream_status: upstream.status,
          error:
            data?.error?.message ||
            data?.message ||
            "Upstream request failed"
        }
      });

      return res.status(502).json({
        success: false,
        error: "UPSTREAM_FAILED",
        message:
          data?.error?.message ||
          data?.message ||
          "Reaction provider gagal.",
        upstream_status: upstream.status
      });
    }

    // Provider sukses → coin tetap terpakai.
    await supabase.from("usage_logs").insert({
      user_id: user.id,
      endpoint: "/api/v1/reaction",
      target_url: url,
      reaction,
      coins_used: 1,
      status: "success",
      response_data: {
        upstream_status: upstream.status,
        latency_ms: Date.now() - started,
        task: data.task || null,
        vip: data.vip || null
      }
    });

    return res.json({
      success: true,
      message: "Reaction berhasil diproses.",
      coin_used: 1,
      coin_remaining: coinRemainingAfterReserve,
      task: data.task || null,
      vip: data.vip || null
    });
  } catch (err) {
    console.error("[Reaction Upstream]", err.message);

    // Provider tidak dapat dihubungi → refund coin.
    const { error: refundError } = await supabase.rpc(
      "refund_one_coin",
      {
        p_user_id: user.id
      }
    );

    if (refundError) {
      console.error("[Coin Refund]", refundError);
    }

    await supabase.from("usage_logs").insert({
      user_id: user.id,
      endpoint: "/api/v1/reaction",
      target_url: url,
      reaction,
      coins_used: 0,
      status: "failed",
      response_data: {
        error: err.message
      }
    });

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

app.get("/api/admin/stats", adminAuth, async (_, res) => {
  try {
    const [
      { count: users, error: usersError },
      { count: pending, error: pendingError },
      { count: successful, error: successfulError }
    ] = await Promise.all([
      supabase
        .from("users")
        .select("*", { count: "exact", head: true }),

      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase
        .from("usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "success")
    ]);

    if (usersError) throw usersError;
    if (pendingError) throw pendingError;
    if (successfulError) throw successfulError;

    res.json({
      success: true,
      stats: {
        users: users || 0,
        pending: pending || 0,
        successful: successful || 0
      }
    });
  } catch (err) {
    console.error("[Admin Stats]", err);

    res.status(500).json({
      success: false,
      error: "ADMIN_STATS_FAILED"
    });
  }
});

app.get("/api/admin/orders", adminAuth, async (_, res) => {
  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        *,
        user:users (
          id,
          email,
          name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const result = (orders || []).map(order => ({
      ...order,
      proofUrl: order.payment_proof
        ? `/api/admin/proof/${encodeURIComponent(order.payment_proof)}`
        : null
    }));

    res.json({
      success: true,
      orders: result
    });
  } catch (err) {
    console.error("[Admin Orders]", err);

    res.status(500).json({
      success: false,
      error: "ADMIN_ORDERS_FAILED"
    });
  }
});

app.get("/api/admin/proof/:file", adminAuth, async (req, res) => {
  try {
    const file = decodeURIComponent(req.params.file || "");

    if (!file || file.includes("..")) {
      return res.sendStatus(400);
    }

    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .download(file);

    if (error || !data) {
      console.error("[Admin Proof Download]", error);
      return res.sendStatus(404);
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    const ext = path.extname(file).toLowerCase();
    const contentTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".pdf": "application/pdf"
    };

    res.setHeader(
      "Content-Type",
      contentTypes[ext] || "application/octet-stream"
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("[Admin Proof]", err);
    res.sendStatus(500);
  }
});

app.post("/api/admin/orders/:id/approve", adminAuth, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "ORDER_NOT_FOUND"
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "ORDER_NOT_PENDING"
      });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", order.user_id)
      .maybeSingle();

    if (userError) throw userError;

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND"
      });
    }

    const currentCoins = availableCoins(user);
    const newCoins = currentCoins + Number(order.coins);

    const newExpiry = calculateCoinExpiry(
      user.coin_expiry,
      order.duration
    );

    const approvedAt = now();

    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        coins: newCoins,
        coin_expiry: newExpiry,
        updated_at: approvedAt
      })
      .eq("id", user.id);

    if (userUpdateError) throw userUpdateError;

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        status: "approved",
        approved_at: approvedAt,
        updated_at: approvedAt
      })
      .eq("id", order.id)
      .eq("status", "pending");

    if (orderUpdateError) throw orderUpdateError;

    res.json({
      success: true,
      message: "Order approved dan coin masuk."
    });
  } catch (err) {
    console.error("[Admin Approve]", err);

    res.status(500).json({
      success: false,
      error: "ORDER_APPROVE_FAILED"
    });
  }
});

app.post("/api/admin/orders/:id/reject", adminAuth, async (req, res) => {
  try {
    const reason = String(
      req.body.reason || "Pembayaran tidak valid."
    ).slice(0, 300);

    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (findError) throw findError;

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "ORDER_NOT_FOUND"
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "ORDER_NOT_PENDING"
      });
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "rejected",
        reason,
        updated_at: now()
      })
      .eq("id", order.id)
      .eq("status", "pending");

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: "Order ditolak."
    });
  } catch (err) {
    console.error("[Admin Reject]", err);

    res.status(500).json({
      success: false,
      error: "ORDER_REJECT_FAILED"
    });
  }
});

app.get("/docs", (_, res) => res.sendFile(path.join(__dirname, "public", "docs.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError || err.message?.includes("Format bukti")) {
    return res.status(400).json({ success: false, error: err.message });
  }
  res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Reaction API Store aktif di http://127.0.0.1:${PORT}`);
    console.log(`Upstream: ${process.env.ZXC_API_URL || "(belum diatur)"}`);
  });
}

module.exports = app;
