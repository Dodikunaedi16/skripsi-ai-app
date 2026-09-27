# Akademia AI

Aplikasi web untuk membantu penyusunan skripsi, artikel jurnal, dan makalah menggunakan Ollama Cloud, login nomor HP, dan Google OAuth.

## Perbaikan pada versi ini

- Respons kartu **Mulai skripsi / Susun artikel / Buat makalah** dibuat lebih cepat dengan mengurangi request HTTP yang tidak perlu.
- Riwayat chat yang dikirim ke model dibatasi ke 12 pesan terakhir agar percakapan panjang tidak makin lambat.
- Ollama Cloud menggunakan `gpt-oss:120b-cloud` dari environment variable.
- Mode thinking dimatikan pada request chat agar jawaban lebih responsif.
- Balasan AI dengan Markdown seperti `**tebal**`, `*miring*`, heading, list, quote, dan code block ditampilkan dengan format yang benar.
- Tidak ada dependency native SQLite, sehingga `npm install` lebih sederhana pada Node.js modern.
- API key dan credential tetap memakai environment variable. Jangan masukkan secret ke Git atau ZIP.

## Instalasi

Gunakan Node.js 18+.

```bash
npm install
```

Buat file `.env` dari `.env.example`, lalu isi:

```env
PORT=3000
SESSION_SECRET=buat-random-string-panjang

OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b-cloud
OLLAMA_API_KEY=API_KEY_OLLAMA_KAMU

GOOGLE_CLIENT_ID=CLIENT_ID_GOOGLE
GOOGLE_CLIENT_SECRET=CLIENT_SECRET_GOOGLE
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

MAX_FILE_SIZE_MB=50
```

Jalankan:

```bash
npm start
```

atau mode development:

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

## Google OAuth lokal

Di Google Cloud Console, untuk OAuth Client tipe Web application:

Authorized JavaScript origins:

```text
http://localhost:3000
```

Authorized redirect URIs:

```text
http://localhost:3000/api/auth/google/callback
```

Untuk domain produksi, tambahkan origin dan callback URL produksi yang sebenarnya.

Jika muncul `redirect_uri_mismatch`, URL callback di Google Cloud harus sama persis dengan URL yang dikirim aplikasi. Jika muncul `invalid_client`, periksa Client ID/Client Secret atau apakah OAuth client tersebut masih ada.

## Login

- Pengguna dapat mendaftar menggunakan nomor HP + password.
- Pengguna dapat mendaftar/login menggunakan Google OAuth.
- OTP SMS belum diaktifkan. Nomor HP pada versi ini digunakan bersama password.

## Keamanan

Jangan commit `.env`, API key Ollama, Google Client Secret, atau session secret.
