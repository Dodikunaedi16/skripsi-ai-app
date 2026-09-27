const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";

const SYSTEM_PROMPT = `Kamu adalah asisten AI ahli akademik berbahasa Indonesia yang membantu mahasiswa dan peneliti dalam:
1. Penyusunan SKRIPSI (mulai dari bab pendahuluan, tinjauan pustaka, metodologi, hasil & pembahasan, hingga kesimpulan)
2. Penulisan ARTIKEL JURNAL ilmiah (abstrak, pendahuluan, metode, hasil, diskusi, referensi sesuai gaya sitasi seperti APA/IEEE)
3. Pembuatan MAKALAH akademik

Tugasmu: memberi arahan struktur, membantu merumuskan masalah, menyusun kerangka teori, memberi saran metodologi penelitian, membantu parafrase, memperbaiki tata bahasa akademik, serta mengecek kelogisan argumen.
Jika pengguna melampirkan isi dokumen (hasil ekstraksi file), gunakan isi tersebut sebagai konteks utama jawabanmu.
Untuk referensi ilmiah: prioritaskan sumber jurnal/prosiding/buku akademik yang relevan dan dapat diverifikasi. Jika DOI tersedia dan kamu mengetahuinya dengan yakin, tuliskan DOI dalam bentuk URL lengkap seperti https://doi.org/10.xxxx/xxxxx agar dapat diklik. JANGAN mengarang atau menebak DOI. Jika DOI tidak diketahui atau tidak tersedia, tuliskan bahwa DOI tidak tersedia daripada membuat DOI palsu.
Jika pengguna meminta daftar pustaka, susun konsisten sesuai gaya sitasi yang diminta dan pisahkan bagian "Referensi" dengan jelas.
Selalu ingatkan pengguna untuk memverifikasi ulang data, kutipan, dan referensi ilmiah yang dihasilkan, serta untuk tidak melakukan plagiarisme.
Jawab dengan terstruktur, jelas, dan dalam Bahasa Indonesia baku akademik kecuali diminta sebaliknya.`;

/**
 * Mengirim riwayat percakapan ke Ollama dan mendapatkan balasan.
 * @param {Array<{role: string, content: string}>} history
 * @param {string} [contextText] - teks tambahan hasil ekstraksi file (opsional)
 * @returns {Promise<string>}
 */
async function chatWithOllama(history, contextText) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  if (contextText) {
    messages.push({
      role: "system",
      content: `Berikut isi dokumen yang diunggah pengguna sebagai referensi:\n\n${contextText.slice(
        0,
        12000
      )}`,
    });
  }

  messages.push(...history);

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        think: false,
      }),
    });
  } catch (networkErr) {
    throw new Error(
      `Tidak bisa terhubung ke Ollama di ${OLLAMA_BASE_URL}. ` +
        `Jika memakai Ollama lokal, pastikan "ollama serve" berjalan. Jika memakai Ollama Cloud, periksa OLLAMA_BASE_URL dan OLLAMA_API_KEY.`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Gagal menghubungi Ollama (status ${response.status}): ${errText}. ` +
        `Jika memakai Ollama lokal, pastikan model "${OLLAMA_MODEL}" sudah di-pull. Jika memakai Cloud, periksa nama model dan API key.`
    );
  }

  const data = await response.json();
  return data.message?.content || "(Tidak ada respons dari model)";
}

module.exports = { chatWithOllama };
