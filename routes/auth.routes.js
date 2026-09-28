const express = require("express");
const bcrypt = require("bcryptjs");
const passport = require("../config/passport");
const db = require("../config/database");

const router = express.Router();

function buildUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || "",
    phone_number: user.phone_number || null,
    email: user.email || null,
    avatar_url: user.avatar_url || null,
  };
}

function saveLoginSession(req, user, res, successStatus = 200) {
  req.session.userId = user.id;
  req.session.user = buildUser(user);

  return req.session.save((saveErr) => {
    if (saveErr) {
      console.error("SESSION SAVE ERROR:", saveErr);

      return res.status(500).json({
        error: "Gagal menyimpan session login.",
      });
    }

    return res.status(successStatus).json({
      message: "Login berhasil.",
      user: buildUser(user),
    });
  });
}

// ======================================================
// REGISTER PHONE
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
      .prepare(
        "SELECT id FROM users WHERE phone_number = ?"
      )
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

    const user = {
      id: info.lastInsertRowid,
      name,
      phone_number,
      email: null,
      avatar_url: null,
    };

    return saveLoginSession(req, user, res, 201);
  } catch (err) {
    console.error("REGISTER ERROR:", err);

    return res.status(500).json({
      error: "Terjadi kesalahan server.",
    });
  }
});

// ======================================================
// LOGIN PHONE
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
      .prepare(
        "SELECT * FROM users WHERE phone_number = ?"
      )
      .get(phone_number);

    if (!user || !user.password_hash) {
      return res.status(401).json({
        error: "Nomor HP atau password salah.",
      });
    }

    const match = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!match) {
      return res.status(401).json({
        error: "Nomor HP atau password salah.",
      });
    }

    return saveLoginSession(req, user, res);
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      error: "Terjadi kesalahan server.",
    });
  }
});

// ======================================================
// LOGIN GOOGLE
// Passport hanya melakukan autentikasi.
// Session Passport sengaja dimatikan.
// ======================================================

router.get("/google", (req, res, next) => {
  console.log("Google OAuth: memulai autentikasi...");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

// ======================================================
// CALLBACK GOOGLE
// ======================================================

router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate(
      "google",
      {
        failureRedirect: "/login.html?error=google_auth",
        session: false,
      },
      (err, user, info) => {
        if (err) {
          console.error(
            "GOOGLE CALLBACK ERROR:",
            err
          );

          return res.redirect(
            "/login.html?error=google_auth"
          );
        }

        if (!user) {
          console.error(
            "Google user tidak ditemukan:",
            info
          );

          return res.redirect(
            "/login.html?error=google_auth"
          );
        }

        req.session.userId = user.id;
        req.session.user = buildUser(user);

        return req.session.save((saveErr) => {
          if (saveErr) {
            console.error(
              "GOOGLE SESSION SAVE ERROR:",
              saveErr
            );

            return res.redirect(
              "/login.html?error=session"
            );
          }

          console.log(
            "GOOGLE LOGIN SESSION BERHASIL:",
            user.id
          );

          return res.redirect("/index.html");
        });
      }
    )(req, res, next);
  }
);

// ======================================================
// CURRENT USER
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

    // Jika database sementara Vercel sudah kehilangan data
    // akibat cold start, gunakan data user yang tersimpan
    // di signed session cookie.
    if (!user) {
      if (req.session.user) {
        return res.json({
          user: req.session.user,
        });
      }

      req.session.destroy(() => {});

      return res.status(401).json({
        error: "User tidak ditemukan.",
      });
    }

    return res.json({
      user: buildUser(user),
    });
  } catch (err) {
    console.error("ME ERROR:", err);

    // Fallback ke data user di session.
    if (req.session.user) {
      return res.json({
        user: req.session.user,
      });
    }

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

    return res.json({
      message: "Logout berhasil.",
    });
  });
});

module.exports = router;
