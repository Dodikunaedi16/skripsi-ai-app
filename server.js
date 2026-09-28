require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const passport = require("./config/passport");

const authRoutes = require("./routes/auth.routes");
const conversationRoutes = require("./routes/conversation.routes");
const chatRoutes = require("./routes/chat.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

const SESSION_COOKIE = "risetmate_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "dev-only-change-this-secret";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function createSessionToken(data) {
  const payload = base64UrlEncode(JSON.stringify(data));
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  try {
    if (!token || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payload, signature] = parts;
    const expected = sign(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!data || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return data;
  } catch (_) {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};

  if (!header) return cookies;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
  }

  return cookies;
}

function sessionCookie(token) {
  const secure = IS_VERCEL || process.env.NODE_ENV === "production"
    ? "; Secure"
    : "";

  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
    secure.replace(/^; /, ""),
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie() {
  const secure = IS_VERCEL || process.env.NODE_ENV === "production"
    ? "; Secure"
    : "";

  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure.replace(/^; /, ""),
  ]
    .filter(Boolean)
    .join("; ");
}

function statelessSession(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const stored = verifySessionToken(cookies[SESSION_COOKIE]) || {};

  const session = {
    userId: stored.userId || null,
    user: stored.user || null,

    save(callback) {
      const data = {
        userId: session.userId || null,
        user: session.user || null,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      };

      res.setHeader(
        "Set-Cookie",
        sessionCookie(createSessionToken(data))
      );

      if (typeof callback === "function") {
        return process.nextTick(() => callback(null));
      }
    },

    destroy(callback) {
      session.userId = null;
      session.user = null;

      res.setHeader("Set-Cookie", clearSessionCookie());

      if (typeof callback === "function") {
        return process.nextTick(() => callback(null));
      }
    },
  };

  req.session = session;

  next();
}

// =====================================================
// BASIC MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// =====================================================
// STATELESS SESSION
// Tidak menggunakan express-session MemoryStore.
// Aman untuk pola serverless Vercel.
// =====================================================

app.use(statelessSession);

// =====================================================
// PASSPORT
// Passport hanya dipakai untuk proses OAuth.
// Session Passport tidak digunakan.
// =====================================================

app.use(passport.initialize());

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "risetmate",
    environment: IS_VERCEL ? "vercel" : "local",
    ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
    ollamaUrl:
      process.env.OLLAMA_BASE_URL ||
      "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "llama3",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// STATIC FRONTEND
// =====================================================

const publicDir = path.join(__dirname, "public");

app.use(
  express.static(publicDir, {
    index: false,
    maxAge: IS_VERCEL ? "1h" : 0,
  })
);

// =====================================================
// UPLOADS
// =====================================================

const uploadsDir = path.join(__dirname, "uploads");

app.use("/uploads", express.static(uploadsDir));

// =====================================================
// API ROUTES
// =====================================================

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);

// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {
  const loginPage = path.join(publicDir, "login.html");

  res.sendFile(loginPage, (error) => {
    if (error) {
      console.error("Gagal mengirim login.html:", error);

      if (!res.headersSent) {
        res.status(500).json({
          error: "login.html tidak ditemukan.",
          details: error.message,
        });
      }
    }
  });
});

// =====================================================
// 404
// =====================================================

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API endpoint tidak ditemukan.",
      path: req.path,
    });
  }

  return res.status(404).send("Halaman tidak ditemukan.");
});

// =====================================================
// ERROR
// =====================================================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: err.message || "Terjadi kesalahan server.",
  });
});

// =====================================================
// LOCAL SERVER
// =====================================================

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`RisetMate berjalan di http://localhost:${PORT}`);
    console.log(
      `Ollama: ${
        process.env.OLLAMA_BASE_URL ||
        "http://localhost:11434"
      }`
    );
    console.log(
      `Model: ${process.env.OLLAMA_MODEL || "llama3"}`
    );
  });
}

module.exports = app;
