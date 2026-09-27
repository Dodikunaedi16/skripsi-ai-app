const express = require("express");
const db = require("../config/database");
const { ensureAuth } = require("../middleware/auth");
const { chatWithOllama } = require("../services/ollama.service");

const router = express.Router();
router.use(ensureAuth);

router.post("/", async (req, res) => {
  try {
    const { conversation_id, message, file_ids } = req.body;

    if (!conversation_id || !message) {
      return res
        .status(400)
        .json({ error: "conversation_id dan message wajib diisi." });
    }

    const conversation = db
      .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
      .get(conversation_id, req.session.userId);

    if (!conversation) {
      return res.status(404).json({ error: "Percakapan tidak ditemukan." });
    }

    // Simpan pesan user
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)"
    ).run(conversation_id, message);

    // Ambil seluruh riwayat pesan pada percakapan ini (untuk konteks)
    const history = db
      .prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(conversation_id)
      .slice(-12);

    // Gabungkan teks hasil ekstraksi file yang relevan (jika ada)
    let contextText = "";
    if (Array.isArray(file_ids) && file_ids.length > 0) {
      const placeholders = file_ids.map(() => "?").join(",");
      const files = db
        .prepare(
          `SELECT original_name, extracted_text FROM files
           WHERE id IN (${placeholders}) AND user_id = ?`
        )
        .all(...file_ids, req.session.userId);

      contextText = files
        .filter((f) => f.extracted_text)
        .map((f) => `--- Dokumen: ${f.original_name} ---\n${f.extracted_text}`)
        .join("\n\n");
    }

    const reply = await chatWithOllama(history, contextText);

    // Simpan balasan asisten
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(conversation_id, reply);

    db.prepare(
      "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(conversation_id);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gagal memproses chat." });
  }
});

module.exports = router;
