const express = require("express");
const db = require("../config/database");
const { ensureAuth } = require("../middleware/auth");

const router = express.Router();
router.use(ensureAuth);

// Daftar semua percakapan milik user (riwayat)
router.get("/", (req, res) => {
  const conversations = db
    .prepare(
      "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(req.session.userId);
  res.json({ conversations });
});

// Buat percakapan baru
router.post("/", (req, res) => {
  const { title, jenis_karya } = req.body;
  const info = db
    .prepare(
      "INSERT INTO conversations (user_id, title, jenis_karya) VALUES (?, ?, ?)"
    )
    .run(req.session.userId, title || "Percakapan Baru", jenis_karya || "skripsi");

  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json({ conversation });
});

// Ambil detail + semua pesan dalam satu percakapan
router.get("/:id", (req, res) => {
  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);

  if (!conversation) {
    return res.status(404).json({ error: "Percakapan tidak ditemukan." });
  }

  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(req.params.id);

  const files = db
    .prepare("SELECT * FROM files WHERE conversation_id = ?")
    .all(req.params.id);

  res.json({ conversation, messages, files });
});

// Hapus percakapan
router.delete("/:id", (req, res) => {
  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);

  if (!conversation) {
    return res.status(404).json({ error: "Percakapan tidak ditemukan." });
  }

  db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
  res.json({ message: "Percakapan dihapus." });
});

module.exports = router;
