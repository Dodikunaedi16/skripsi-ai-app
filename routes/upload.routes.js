const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("../config/database");
const { ensureAuth } = require("../middleware/auth");
const { extractText } = require("../services/fileParser.service");

const router = express.Router();
router.use(ensureAuth);

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = uuidv4();
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

// Jenis file yang diizinkan: dokumen, gambar, video
const ALLOWED_MIME = [
  // Dokumen
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  // Gambar
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
];

const maxSizeMb = parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10);

const upload = multer({
  storage,
  limits: { fileSize: maxSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`));
    }
  },
});

// Upload satu atau beberapa file, opsional dikaitkan ke conversation_id
router.post("/", upload.array("files", 10), async (req, res) => {
  try {
    const { conversation_id } = req.body;
    const results = [];

    for (const file of req.files) {
      const extracted_text = await extractText(file.path, file.mimetype);

      const info = db
        .prepare(
          `INSERT INTO files
            (user_id, conversation_id, original_name, stored_name, mimetype, filesize, extracted_text)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.session.userId,
          conversation_id || null,
          file.originalname,
          file.filename,
          file.mimetype,
          file.size,
          extracted_text
        );

      results.push({
        id: info.lastInsertRowid,
        original_name: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        has_extracted_text: !!extracted_text,
      });
    }

    res.status(201).json({ files: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gagal mengunggah file." });
  }
});

// Daftar file milik user
router.get("/", (req, res) => {
  const files = db
    .prepare(
      `SELECT id, original_name, mimetype, filesize, conversation_id, uploaded_at
       FROM files WHERE user_id = ? ORDER BY uploaded_at DESC`
    )
    .all(req.session.userId);
  res.json({ files });
});

module.exports = router;
