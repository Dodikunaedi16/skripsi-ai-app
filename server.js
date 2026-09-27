require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("./config/passport");

const authRoutes = require("./routes/auth.routes");
const conversationRoutes = require("./routes/conversation.routes");
const chatRoutes = require("./routes/chat.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

// =====================================================
// BASIC MIDDLEWARE
// =====================================================

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// =====================================================
// SESSION
// =====================================================

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "dev-only-change-this-secret",

    resave: false,

    saveUninitialized: false,

    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",

      // HTTPS production hanya ketika benar-benar production.
      secure:
        process.env.NODE_ENV === "production" ||
        IS_VERCEL,
    },
  })
);

// =====================================================
// PASSPORT
// =====================================================

app.use(passport.initialize());
app.use(passport.session());

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "risetmate",
    environment: IS_VERCEL
      ? "vercel"
      : "local",

    ollamaConfigured: Boolean(
      process.env.OLLAMA_API_KEY
    ),

    ollamaUrl:
      process.env.OLLAMA_BASE_URL ||
      "http://localhost:11434",

    model:
      process.env.OLLAMA_MODEL ||
      "llama3",

    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// STATIC FRONTEND
// =====================================================

const publicDir = path.join(
  __dirname,
  "public"
);

app.use(
  express.static(publicDir, {
    index: false,
    maxAge: IS_VERCEL
      ? "1h"
      : 0,
  })
);

// =====================================================
// UPLOADS
// =====================================================

// Hanya aktif untuk file yang memang tersedia.
// Penyimpanan upload di Vercel bersifat sementara.
// Jangan mengandalkan filesystem Vercel sebagai storage permanen.

const uploadsDir = path.join(
  __dirname,
  "uploads"
);

app.use(
  "/uploads",
  express.static(uploadsDir)
);

// =====================================================
// API ROUTES
// =====================================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/conversations",
  conversationRoutes
);

app.use(
  "/api/chat",
  chatRoutes
);

app.use(
  "/api/upload",
  uploadRoutes
);

// =====================================================
// ROOT PAGE
// =====================================================

app.get("/", (req, res) => {
  const loginPage = path.join(
    publicDir,
    "login.html"
  );

  res.sendFile(loginPage, (error) => {
    if (error) {
      console.error(
        "Gagal mengirim login.html:",
        error
      );

      res.status(500).json({
        error:
          "login.html tidak ditemukan.",
        details:
          error.message,
      });
    }
  });
});

// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API endpoint tidak ditemukan.",
      path: req.path,
    });
  }

  return res.status(404).send(
    "Halaman tidak ditemukan."
  );
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
  (err, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(500).json({
      error:
        err.message ||
        "Terjadi kesalahan server.",
    });
  }
);

// =====================================================
// LOCAL SERVER
// =====================================================

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(
      `✅ RisetMate berjalan di http://localhost:${PORT}`
    );

    console.log(
      `🤖 Ollama: ${
        process.env.OLLAMA_BASE_URL ||
        "http://localhost:11434"
      }`
    );

    console.log(
      `🧠 Model: ${
        process.env.OLLAMA_MODEL ||
        "llama3"
      }`
    );
  });
}

// =====================================================
// VERCEL EXPORT
// =====================================================

module.exports = app;