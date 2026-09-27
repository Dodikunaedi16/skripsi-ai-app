function ensureAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    req.session.userId = req.user.id;
    return next();
  }
  return res.status(401).json({ error: "Anda harus login terlebih dahulu." });
}

module.exports = { ensureAuth };
