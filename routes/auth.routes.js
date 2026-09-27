const express = require("express");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const db = require("../config/database");

const router = express.Router();

// ============ REGISTRASI VIA NOMOR HP ============
router.post("/register", async (req, res) => {
  try {
    const { name, phone_number, password } = req.body;

    if (!name || !phone_number || !password) {
      return res
        .status(400)
        .json({ error: "Nama, nomor HP, dan password wajib diisi." });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE phone_number = ?")
      .get(phone_number);
    if (existing) {
      return res.status(409).json({ error: "Nomor HP sudah terdaftar." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const info = db
      .prepare(
        "INSERT INTO users (name, phone_number, password_hash) VALUES (?, ?, ?)"
      )
      .run(name, phone_number, password_hash);

    req.session.userId = info.lastInsertRowid;

    res.status(201).json({
      message: "Registrasi berhasil.",
      user: { id: info.lastInsertRowid, name, phone_number },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan server." });
  }
});

// NOTE: Untuk verifikasi nomor HP dengan OTP (SMS), integrasikan penyedia
// seperti Twilio / Vonage / Zenziva di titik ini sebelum akun diaktifkan penuh.

// ============ LOGIN VIA NOMOR HP ============
router.post("/login", async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    const user = db
      .prepare("SELECT * FROM users WHERE phone_number = ?")
      .get(phone_number);

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Nomor HP atau password salah." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Nomor HP atau password salah." });
    }

    req.session.userId = user.id;

    res.json({
      message: "Login berhasil.",
      user: { id: user.id, name: user.name, phone_number: user.phone_number },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan server." });
  }
});

// ============ LOGIN VIA GOOGLE ============
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login.html" }),
  (req, res) => {
    req.session.userId = req.user.id;
    res.redirect("/index.html");
  }
);

// ============ SESI SAAT INI ============
router.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Belum login." });
  }
  const user = db
    .prepare(
      "SELECT id, name, phone_number, email, avatar_url FROM users WHERE id = ?"
    )
    .get(req.session.userId);
  res.json({ user });
});

// ============ LOGOUT ============
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logout berhasil." });
  });
});

module.exports = router;
