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

// =====================================================
// STORAGE
// =====================================================

// Vercel tidak boleh menulis ke /var/task.
// /tmp dapat digunakan sebagai storage sementara.
//
// Lokal:
//   ./uploads
//
// Vercel:
//   /tmp/uploads
const isVercel = Boolean(process.env.VERCEL);

const uploadDir = isVercel
  ? path.join("/tmp", "uploads")
  : path.join(__dirname, "..", "uploads");

// Buat folder hanya di lokasi yang writable.
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
      recursive: true,
    });
  }
} catch (error) {
  console.error(
    "Gagal membuat folder upload:",
    error.message
  );
}

// =====================================================
// MULTER STORAGE
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const unique = uuidv4();

    const extension = path.extname(
      file.originalname
    );

    cb(
      null,
      `${unique}${extension}`
    );
  },
});

// =====================================================
// ALLOWED FILE TYPES
// =====================================================

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

const maxSizeMb = parseInt(
  process.env.MAX_FILE_SIZE_MB || "50",
  10
);

const upload = multer({
  storage,

  limits: {
    fileSize:
      maxSizeMb *
      1024 *
      1024,
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {
    if (
      ALLOWED_MIME.includes(
        file.mimetype
      )
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Tipe file tidak didukung: ${file.mimetype}`
        )
      );
    }
  },
});

// =====================================================
// UPLOAD FILE
// =====================================================

router.post(
  "/",
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (
        !req.files ||
        req.files.length === 0
      ) {
        return res.status(400).json({
          error:
            "Tidak ada file yang diunggah.",
        });
      }

      const {
        conversation_id,
      } = req.body;

      const results = [];

      for (const file of req.files) {
        let extracted_text = "";

        try {
          extracted_text =
            await extractText(
              file.path,
              file.mimetype
            );
        } catch (error) {
          console.error(
            "Gagal membaca isi file:",
            error.message
          );

          extracted_text = "";
        }

        const info = db
          .prepare(
            `INSERT INTO files
              (
                user_id,
                conversation_id,
                original_name,
                stored_name,
                mimetype,
                filesize,
                extracted_text
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            req.session.userId,
            conversation_id ||
              null,
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
            extracted_text
          );

        results.push({
          id:
            info.lastInsertRowid,

          original_name:
            file.originalname,

          mimetype:
            file.mimetype,

          size:
            file.size,

          has_extracted_text:
            Boolean(
              extracted_text
            ),

          temporary:
            isVercel,
        });
      }

      return res.status(201).json({
        files: results,

        storage:
          isVercel
            ? "temporary"
            : "local",
      });
    } catch (err) {
      console.error(
        "UPLOAD ERROR:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Gagal mengunggah file.",
      });
    }
  }
);

// =====================================================
// DAFTAR FILE USER
// =====================================================

router.get(
  "/",
  (req, res) => {
    try {
      const files = db
        .prepare(
          `SELECT
             id,
             original_name,
             mimetype,
             filesize,
             conversation_id,
             uploaded_at
           FROM files
           WHERE user_id = ?
           ORDER BY uploaded_at DESC`
        )
        .all(
          req.session.userId
        );

      return res.json({
        files,
      });
    } catch (error) {
      console.error(
        "GET FILES ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Gagal mengambil daftar file.",
      });
    }
  }
);

module.exports = router;