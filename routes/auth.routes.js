const express = require("express");
const bcrypt = require("bcryptjs");

// PENTING:
// Gunakan instance passport yang sudah dikonfigurasi di config/passport.js
const passport = require("../config/passport");

const db = require("../config/database");

const router = express.Router();

// ======================================================
// REGISTRASI VIA NOMOR HP
// ======================================================
router.post("/register", async (req, res) => {
  try {
    const { name, phone_number, password } = req.body;

    if (!name || !phone_number || !password) {
      return res.status(400).json({
        error: "Nama, nomor HP, dan password wajib diisi.",
      });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE phone_number = ?")
      .get(phone_number);

    if (existing) {
      return res.status(409).json({
        error: "Nomor HP sudah terdaftar.",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const info = db
      .prepare(
        "INSERT INTO users (name, phone_number, password_hash) VALUES (?, ?, ?)"
      )
      .run(name, phone_number, password_hash);

    req.session.userId = info.lastInsertRowid;

    return res.status(201).json({
      message: "Registrasi berhasil.",
      user: {
        id: info.lastInsertRowid,
        name,
        phone_number,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);

    return res.status(500).json({
      error: "Terjadi kesalahan server.",
    });
  }
});

// ======================================================
// LOGIN VIA NOMOR HP
// ======================================================
router.post("/login", async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
      return res.status(400).json({
        error: "Nomor HP dan password wajib diisi.",
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE phone_number = ?")
      .get(phone_number);

    if (!user || !user.password_hash) {
      return res.status(401).json({
        error: "Nomor HP atau password salah.",
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({
        error: "Nomor HP atau password salah.",
      });
    }

    req.session.userId = user.id;

    return res.json({
      message: "Login berhasil.",
      user: {
        id: user.id,
        name: user.name,
        phone_number: user.phone_number,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      error: "Terjadi kesalahan server.",
    });
  }
});

// ======================================================
// LOGIN VIA GOOGLE
// ======================================================
router.get(
  "/google",
  (req, res, next) => {
    console.log("Google OAuth: memulai autentikasi...");

    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: true,
    })(req, res, next);
  }
);

// ======================================================
// CALLBACK GOOGLE
// ======================================================
router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate(
      "google",
      {
        failureRedirect: "/login.html",
        session: true,
      },
      (err, user, info) => {
        if (err) {
          console.error("GOOGLE CALLBACK ERROR:", err);
          return res.redirect("/login.html?error=google_auth");
        }

        if (!user) {
          console.error("Google user tidak ditemukan:", info);
          return res.redirect("/login.html?error=google_auth");
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("SESSION LOGIN ERROR:", loginErr);
            return res.redirect("/login.html?error=session");
          }

          req.session.userId = user.id;

          return req.session.save((saveErr) => {
            if (saveErr) {
              console.error("SESSION SAVE ERROR:", saveErr);
              return res.redirect("/login.html?error=session");
            }

            return res.redirect("/index.html");
          });
        });
      }
    )(req, res, next);
  }
);

// ======================================================
// CEK SESSION / USER SAAT INI
// ======================================================
router.get("/me", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Belum login.",
      });
    }

    const user = db
      .prepare(
        `SELECT id, name, phone_number, email, avatar_url
         FROM users
         WHERE id = ?`
      )
      .get(req.session.userId);

    if (!user) {
      req.session.destroy(() => {});

      return res.status(401).json({
        error: "User tidak ditemukan.",
      });
    }

    return res.json({ user });
  } catch (err) {
    console.error("ME ERROR:", err);

    return res.status(500).json({
      error: "Terjadi kesalahan server.",
    });
  }
});

// ======================================================
// LOGOUT
// ======================================================
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("LOGOUT ERROR:", err);

      return res.status(500).json({
        error: "Gagal logout.",
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      message: "Logout berhasil.",
    });
  });
});

module.exports = router;