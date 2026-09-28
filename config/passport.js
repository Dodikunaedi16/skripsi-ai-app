const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./database");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const IS_VERCEL = Boolean(process.env.VERCEL);

const GOOGLE_CALLBACK_URL = IS_VERCEL
  ? "https://risetmate-ai.vercel.app/api/auth/google/callback"
  : process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:3000/api/auth/google/callback";

console.log("==========================================");
console.log("       PASSPORT GOOGLE CONFIG");
console.log("==========================================");
console.log("Environment:", IS_VERCEL ? "VERCEL" : "LOCAL");
console.log(
  "Google Client ID:",
  GOOGLE_CLIENT_ID ? "ADA" : "TIDAK ADA"
);
console.log(
  "Google Client Secret:",
  GOOGLE_CLIENT_SECRET ? "ADA" : "TIDAK ADA"
);
console.log("Google Callback:", GOOGLE_CALLBACK_URL);
console.log("==========================================");

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error(
    "❌ GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum dikonfigurasi."
  );
} else {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },

      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log("==========================================");
          console.log("GOOGLE AUTH SUCCESS");
          console.log("Google ID:", profile.id);
          console.log("Google Name:", profile.displayName);

          const email =
            profile.emails && profile.emails.length > 0
              ? profile.emails[0].value
              : null;

          if (!email) {
            console.error("❌ Google tidak memberikan email.");
            return done(
              new Error("Google tidak memberikan alamat email.")
            );
          }

          const name =
            profile.displayName ||
            profile.name?.givenName ||
            "Pengguna Google";

          const avatar =
            profile.photos && profile.photos.length > 0
              ? profile.photos[0].value
              : null;

          let user = db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);

          if (!user) {
            console.log(
              "User Google belum ada. Membuat akun baru..."
            );

            const info = db
              .prepare(
                `
                INSERT INTO users
                  (name, email, avatar_url)
                VALUES
                  (?, ?, ?)
                `
              )
              .run(name, email, avatar);

            user = db
              .prepare("SELECT * FROM users WHERE id = ?")
              .get(info.lastInsertRowid);

            console.log("✅ User Google berhasil dibuat.");
          } else {
            console.log("User Google sudah ditemukan.");

            db.prepare(
              `
              UPDATE users
              SET
                name = ?,
                avatar_url = ?
              WHERE id = ?
              `
            ).run(name, avatar, user.id);

            user = db
              .prepare("SELECT * FROM users WHERE id = ?")
              .get(user.id);

            console.log("✅ User Google berhasil diperbarui.");
          }

          console.log("User ID:", user.id);
          console.log("Email:", user.email);
          console.log("==========================================");

          return done(null, user);
        } catch (error) {
          console.error("❌ GOOGLE STRATEGY ERROR:");
          console.error(error);

          return done(error);
        }
      }
    )
  );

  console.log("✅ Passport Google Strategy berhasil didaftarkan.");
}

passport.serializeUser((user, done) => {
  try {
    console.log("Passport serializeUser:", user.id);
    done(null, user.id);
  } catch (error) {
    console.error("❌ serializeUser error:", error);
    done(error);
  }
});

passport.deserializeUser((id, done) => {
  try {
    console.log("Passport deserializeUser:", id);

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id);

    if (!user) {
      console.error("❌ User tidak ditemukan:", id);
      return done(null, false);
    }

    return done(null, user);
  } catch (error) {
    console.error("❌ deserializeUser error:", error);
    return done(error);
  }
});

module.exports = passport;