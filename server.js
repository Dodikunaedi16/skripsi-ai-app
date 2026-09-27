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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-only-change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "akademia-ai",
    ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
    ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "llama3",
    timestamp: new Date().toISOString()
  });
});

// File statis frontend
app.use(express.static(path.join(__dirname, "public")));
// Agar file yang diupload (foto/video) bisa ditampilkan kembali jika perlu
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Penanganan error umum (termasuk error dari multer)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Terjadi kesalahan server." });
});

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`🤖 Ollama: ${process.env.OLLAMA_BASE_URL || "http://localhost:11434"} | model: ${process.env.OLLAMA_MODEL || "llama3"}`);
});
