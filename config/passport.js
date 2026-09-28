router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login.html",
    session: true,
  }),
  (req, res) => {
    req.session.userId = req.user.id;

    req.session.save((err) => {
      if (err) {
        console.error("SESSION SAVE ERROR:", err);
        return res.redirect("/login.html?error=session");
      }

      res.redirect("/index.html");
    });
  }
);