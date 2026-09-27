const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./database");

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Hanya daftarkan strategi Google jika kredensial sudah diisi di .env
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0]?.value;
          const avatar = profile.photos && profile.photos[0]?.value;

          let user = db
            .prepare("SELECT * FROM users WHERE google_id = ?")
            .get(profile.id);

          if (!user) {
            // Jika email sudah pernah daftar manual, tautkan akunnya
            if (email) {
              user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
            }

            if (user) {
              db.prepare(
                "UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?"
              ).run(profile.id, avatar, user.id);
              user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
            } else {
              const info = db
                .prepare(
                  `INSERT INTO users (name, email, google_id, avatar_url)
                   VALUES (?, ?, ?, ?)`
                )
                .run(profile.displayName, email, profile.id, avatar);
              user = db
                .prepare("SELECT * FROM users WHERE id = ?")
                .get(info.lastInsertRowid);
            }
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

module.exports = passport;
