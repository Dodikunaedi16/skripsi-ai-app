const fs = require("fs");
const path = require("path");

/**
 * Mengekstrak teks dari file berdasarkan tipenya.
 * Untuk foto & video: tidak diekstrak teksnya, hanya dicatat metadatanya.
 * @param {string} filepath
 * @param {string} mimetype
 * @returns {Promise<string|null>}
 */
async function extractText(filepath, mimetype) {
  try {
    const ext = path.extname(filepath).toLowerCase();

    if (mimetype === "application/pdf" || ext === ".pdf") {
      const pdfParse = require("pdf-parse");
      const buffer = fs.readFileSync(filepath);
      const result = await pdfParse(buffer);
      return result.text;
    }

    if (
      ext === ".docx" ||
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: filepath });
      return result.value;
    }

    if (ext === ".txt" || mimetype === "text/plain") {
      return fs.readFileSync(filepath, "utf-8");
    }

    // Gambar (jpg, png, dll) dan video (mp4, mov, dll): tidak diekstrak teksnya di versi ini.
    // Placeholder untuk pengembangan lanjut: OCR untuk gambar, transkripsi audio untuk video.
    return null;
  } catch (err) {
    console.error("Gagal mengekstrak teks dari file:", err.message);
    return null;
  }
}

module.exports = { extractText };
