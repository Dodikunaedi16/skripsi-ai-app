let currentConversationId = null;
let pendingFileIds = [];
let busy = false;

const chatWindow = document.getElementById("chatWindow");
const conversationList = document.getElementById("conversationList");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");
const messageInput = document.getElementById("messageInput");
const attachedFilesEl = document.getElementById("attachedFiles");
const fileInput = document.getElementById("fileInput");

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status})`);
  return data;
}

async function init() {
  try {
    const me = await api("/api/auth/me");
    const user = me.user || {};
    document.getElementById("userName").textContent = user.name || "Pengguna";
    document.getElementById("userContact").textContent = user.phone_number || user.email || "Akun aktif";
    const avatarLetter = (user.name || "A").trim().charAt(0).toUpperCase();
    document.getElementById("userAvatar").textContent = avatarLetter;
    document.getElementById("menuUserAvatar").textContent = avatarLetter;
    document.getElementById("menuUserName").textContent = user.name || "Pengguna";
    document.getElementById("menuUserContact").textContent = user.phone_number || user.email || "Akun aktif";
    await loadConversations();
  } catch (_) {
    window.location.href = "/login.html";
  }
}

async function loadConversations() {
  try {
    const data = await api("/api/conversations");
    conversationList.innerHTML = "";
    if (!data.conversations.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "Belum ada percakapan.";
      conversationList.appendChild(empty);
      return;
    }

    data.conversations.forEach((conv) => {
      const item = document.createElement("div");
      item.className = "conv-item" + (conv.id === currentConversationId ? " active" : "");
      item.innerHTML = `<span class="conv-icon">${conv.jenis_karya === "jurnal" ? "📝" : conv.jenis_karya === "makalah" ? "📚" : "🎓"}</span><span class="conv-title">${escapeHtml(conv.title)}</span><button class="del-btn" data-id="${conv.id}" title="Hapus">×</button>`;
      item.addEventListener("click", (e) => {
        if (e.target.closest(".del-btn") || busy) return;
        openConversation(conv.id, conv.title);
      });
      item.querySelector(".del-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (busy || !confirm("Hapus percakapan ini?")) return;
        try {
          await api(`/api/conversations/${conv.id}`, { method: "DELETE" });
          if (currentConversationId === conv.id) resetWorkspace();
          await loadConversations();
        } catch (err) {
          appendMessage("assistant", "⚠️ " + err.message);
        }
      });
      conversationList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

const titleMap = {
  skripsi: "Skripsi Baru",
  jurnal: "Artikel Jurnal Baru",
  makalah: "Makalah Baru"
};

// Membuat percakapan tanpa GET tambahan. Ini memangkas beberapa request
// ketika pengguna menekan kartu "Mulai skripsi/jurnal/makalah".
async function createConversation(focusInput = true, openAfter = true) {
  const jenis_karya = document.getElementById("jenisKarya").value;
  const data = await api("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: titleMap[jenis_karya], jenis_karya })
  });

  currentConversationId = data.conversation.id;
  chatTitle.textContent = data.conversation.title;
  chatSubtitle.textContent = "Percakapan tersimpan di riwayat";
  renderConversationWelcome(jenis_karya);
  loadConversations();

  if (focusInput) messageInput.focus();
  if (openAfter) closeMobileMenu();
  return currentConversationId;
}

document.getElementById("btnNewChat").addEventListener("click", async () => {
  if (busy) return;
  await createConversation(true, true);
});
document.getElementById("refreshHistory").addEventListener("click", () => !busy && loadConversations());

async function openConversation(id, title) {
  if (busy) return;
  currentConversationId = id;
  chatTitle.textContent = title;
  chatSubtitle.textContent = "Memuat percakapan...";

  try {
    const data = await api(`/api/conversations/${id}`);
    chatWindow.innerHTML = "";
    chatSubtitle.textContent = "Percakapan tersimpan di riwayat";
    if (!data.messages.length) {
      renderConversationWelcome(data.conversation.jenis_karya);
    } else {
      data.messages.forEach((m) => appendMessage(m.role, m.content));
    }
    scrollToBottom();
    closeMobileMenu();
    await loadConversations();
  } catch (err) {
    appendMessage("assistant", "⚠️ " + err.message);
  }
}

function renderConversationWelcome(type = "skripsi") {
  chatWindow.innerHTML = "";
  const label = type === "jurnal" ? "artikel jurnal" : type === "makalah" ? "makalah" : "skripsi";
  const el = document.createElement("div");
  el.className = "conversation-intro";
  el.innerHTML = `<div class="welcome-icon small">✦</div><h2>Siap membantu ${label}-mu.</h2><p>Ceritakan topik, kendala, atau target yang sedang kamu kerjakan. Kita bisa mulai dari nol atau melanjutkan dari dokumen yang kamu unggah.</p>`;
  chatWindow.appendChild(el);
}

function resetWorkspace() {
  currentConversationId = null;
  pendingFileIds = [];
  attachedFilesEl.innerHTML = "";
  chatTitle.textContent = "Ruang Kerja Akademik";
  chatSubtitle.textContent = "Pilih atau buat percakapan baru";
  renderMainWelcome();
}

function renderMainWelcome() {
  chatWindow.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "welcome-state";
  wrapper.innerHTML = `<div class="welcome-icon">✦</div><span class="eyebrow purple">ASISTEN AKADEMIK AI</span><h1>Halo, siap mengerjakan sesuatu?</h1><p>Mulai percakapan untuk menyusun skripsi, artikel jurnal, atau makalah. Kamu juga bisa melampirkan PDF, DOCX, TXT, gambar, atau video.</p><div class="quick-grid"><button class="quick-card" data-type="skripsi" data-prompt="Bantu saya menentukan topik dan judul skripsi yang relevan."><span>🎓</span><strong>Mulai skripsi</strong><small>Topik, judul & rumusan masalah</small></button><button class="quick-card" data-type="jurnal" data-prompt="Bantu saya menyusun kerangka artikel jurnal yang sistematis."><span>📝</span><strong>Susun artikel</strong><small>Struktur & gaya akademik</small></button><button class="quick-card" data-type="makalah" data-prompt="Bantu saya membuat kerangka makalah berdasarkan topik penelitian saya."><span>📚</span><strong>Buat makalah</strong><small>Pendahuluan sampai kesimpulan</small></button><button class="quick-card" data-type="skripsi" data-prompt="Saya ingin menganalisis dokumen yang akan saya unggah."><span>📎</span><strong>Analisis dokumen</strong><small>PDF, DOCX, TXT & lainnya</small></button></div>`;
  chatWindow.appendChild(wrapper);
  bindQuickCards();
}

function bindQuickCards() {
  document.querySelectorAll(".quick-card").forEach((card) => {
    card.addEventListener("click", async () => {
      if (busy) return;
      try {
        const type = card.dataset.type || "skripsi";
        const prompt = card.dataset.prompt || "";
        document.getElementById("jenisKarya").value = type;

        // Jangan panggil Ollama saat kartu dipilih. Percakapan dibuat instan,
        // lalu pengguna dapat mengirim topik ketika sudah siap. Ini menghilangkan
        // jeda panjang hanya untuk membuka mode kerja.
        await createConversation(false, true);
        appendMessage("assistant", quickWelcome(type, prompt));
        messageInput.value = "";
        messageInput.placeholder = quickPlaceholder(type);
        messageInput.focus();
        scrollToBottom();
      } catch (err) {
        appendMessage("assistant", "⚠️ " + err.message);
      }
    });
  });
}

function quickWelcome(type, prompt) {
  if (type === "jurnal") {
    return "Siap menyusun artikel jurnal. Kirim topik, judul sementara, atau bidang penelitianmu. Saya bisa membantu dari struktur artikel sampai referensi.";
  }
  if (type === "makalah") {
    return "Siap membuat makalah. Kirim topik atau mata kuliahnya. Saya bisa membantu menyusun pendahuluan, pembahasan, sampai kesimpulan.";
  }
  if (prompt.includes("dokumen")) {
    return "Siap menganalisis dokumen. Lampirkan PDF, DOCX, atau TXT menggunakan tombol +, lalu tuliskan bagian yang ingin dianalisis.";
  }
  return "Siap membantu menyusun skripsi. Kirim topik, bidang penelitian, atau judul sementara. Kita bisa mulai dari latar belakang, rumusan masalah, tujuan, sampai metodologi.";
}

function quickPlaceholder(type) {
  if (type === "jurnal") return "Tulis topik atau judul artikel jurnalmu...";
  if (type === "makalah") return "Tulis topik makalahmu...";
  return "Tulis topik atau judul skripsimu...";
}
bindQuickCards();

// ============ UPLOAD FILE ============
document.getElementById("btnAttach").addEventListener("click", () => {
  if (!busy) fileInput.click();
});

fileInput.addEventListener("change", async () => {
  if (!fileInput.files.length || busy) return;
  if (!currentConversationId) await createConversation(false, true);

  const formData = new FormData();
  for (const file of fileInput.files) formData.append("files", file);
  formData.append("conversation_id", currentConversationId);

  try {
    const data = await api("/api/upload", { method: "POST", body: formData });
    data.files.forEach((f) => {
      pendingFileIds.push(f.id);
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.textContent = `${fileIcon(f.mimetype)} ${f.original_name}`;
      attachedFilesEl.appendChild(chip);
    });
  } catch (err) {
    appendMessage("assistant", "⚠️ " + err.message);
  } finally {
    fileInput.value = "";
  }
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || busy) return;
  if (!currentConversationId) await createConversation(false, true);

  busy = true;
  const btnSend = document.getElementById("btnSend");
  btnSend.disabled = true;

  appendMessage("user", text);
  messageInput.value = "";
  autoResize();
  scrollToBottom();

  const typingEl = document.createElement("div");
  typingEl.className = "typing-row";
  typingEl.innerHTML = `<div class="ai-mini-avatar">✦</div><div class="typing-indicator"><i></i><i></i><i></i><span>Asisten sedang menyusun jawaban...</span></div>`;
  chatWindow.appendChild(typingEl);
  scrollToBottom();

  try {
    const data = await api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: currentConversationId, message: text, file_ids: pendingFileIds })
    });
    typingEl.remove();
    appendMessage("assistant", data.reply);
    chatSubtitle.textContent = "Percakapan tersimpan di riwayat";
    loadConversations();
  } catch (err) {
    typingEl.remove();
    appendMessage("assistant", "⚠️ " + err.message);
  } finally {
    btnSend.disabled = false;
    pendingFileIds = [];
    attachedFilesEl.innerHTML = "";
    busy = false;
    scrollToBottom();
  }
}

document.getElementById("btnSend").addEventListener("click", () => {
  if (!busy) sendMessage();
});
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!busy) sendMessage();
  }
});
messageInput.addEventListener("input", autoResize);

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
}

function appendMessage(role, content) {
  const row = document.createElement("div");
  row.className = "msg-row " + role;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "ai-mini-avatar";
    avatar.textContent = "✦";
    row.appendChild(avatar);
  }

  const body = document.createElement("div");
  body.className = "msg-body";
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(String(content ?? ""));
  } else {
    bubble.textContent = String(content ?? "");
  }

  body.appendChild(bubble);
  row.appendChild(body);
  chatWindow.appendChild(row);
}

function renderMarkdown(source) {
  let text = escapeHtml(source).replace(/\r\n?/g, "\n");
  const codeBlocks = [];

  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_, code) => {
    const key = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return key;
  });

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^###\s+(.+)$/gm, "<h4>$1</h4>");
  text = text.replace(/^##\s+(.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");
  text = text.replace(/^>\s?(.+)$/gm, "<blockquote>$1</blockquote>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_\n]+?)_/g, "<em>$1</em>");

  const lines = text.split("\n");
  const out = [];
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (/^\s*[-*•]\s+/.test(line)) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${line.replace(/^\s*[-*•]\s+/, "")}</li>`);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${line.replace(/^\s*\d+[.)]\s+/, "")}</li>`);
    } else if (!line.trim()) {
      closeList();
      out.push("");
    } else if (/^@@CODEBLOCK\d+@@$/.test(line.trim())) {
      closeList();
      out.push(line.trim());
    } else if (/^<(h[234]|blockquote|pre|ul|ol|li)/.test(line.trim())) {
      closeList();
      out.push(line);
    } else {
      closeList();
      out.push(`<p>${line}</p>`);
    }
  }
  closeList();

  text = out.join("").replace(/<p>@@CODEBLOCK(\d+)@@<\/p>/g, "@@CODEBLOCK$1@@");
  text = text.replace(/@@CODEBLOCK(\d+)@@/g, (_, i) => codeBlocks[Number(i)] || "");
  return text;
}

function scrollToBottom() { chatWindow.scrollTop = chatWindow.scrollHeight; }
function escapeHtml(str) { const div = document.createElement("div"); div.textContent = str; return div.innerHTML; }
function fileIcon(mime) { return mime?.startsWith("image/") ? "🖼️" : mime?.startsWith("video/") ? "🎥" : "📄"; }

// ============ MOBILE ============
document.getElementById("mobileMenu").addEventListener("click", () => document.getElementById("sidebar").classList.add("open"));
document.getElementById("mobileSidebarBack").addEventListener("click", closeMobileMenu);
document.getElementById("mobileBackdrop").addEventListener("click", closeMobileMenu);
document.getElementById("historyBackBtn").addEventListener("click", closeMobileMenu);
function closeMobileMenu() { document.getElementById("sidebar").classList.remove("open"); }

const accountMenuWrap = document.getElementById("accountMenuWrap");
const accountMenu = document.getElementById("accountMenu");
const accountModalBackdrop = document.getElementById("accountModalBackdrop");
const accountModalTitle = document.getElementById("accountModalTitle");
const accountModalContent = document.getElementById("accountModalContent");
const accountModalIcon = document.getElementById("accountModalIcon");

const accountPanels = {
  profile: {
    icon: "◉",
    title: "Profil",
    html: `
      <div class="account-info-row"><span>Nama</span><span id="profileName">-</span></div>
      <div class="account-info-row"><span>Email / kontak</span><span id="profileContact">-</span></div>
      <div class="account-note">Profil digunakan untuk mengenali akun kamu di RisetMate. Perubahan data profil dapat ditambahkan pada tahap berikutnya.</div>
    `
  },
  guide: {
    icon: "✦",
    title: "Panduan RisetMate",
    html: `
      <div class="account-guide-grid">
        <div class="guide-card"><strong>🎓 Mulai skripsi</strong><p>Pilih jenis karya, buat percakapan baru, lalu tuliskan topik atau masalah penelitian.</p></div>
        <div class="guide-card"><strong>📝 Artikel jurnal</strong><p>Pilih Artikel Jurnal agar percakapan dan panduan kerja menggunakan konteks jurnal.</p></div>
        <div class="guide-card"><strong>📚 Makalah</strong><p>Gunakan mode Makalah untuk menyusun struktur dari pendahuluan sampai kesimpulan.</p></div>
        <div class="guide-card"><strong>📎 Lampirkan file</strong><p>Tambahkan PDF, DOCX, TXT, gambar, atau video sebelum mengirim pertanyaan.</p></div>
        <div class="guide-card"><strong>📌 Sematkan riwayat</strong><p>Sematkan percakapan penting supaya tetap berada di bagian atas daftar riwayat.</p></div>
        <div class="guide-card"><strong>💬 Lanjutkan percakapan</strong><p>Buka riwayat kapan saja untuk melanjutkan pekerjaan dari percakapan sebelumnya.</p></div>
      </div>
      <div class="account-note">Gunakan RisetMate sebagai pendamping penelitian. Tetap periksa referensi, data, dan hasil yang diberikan AI sebelum digunakan dalam karya akademik.</div>
    `
  },
  settings: {
    icon: "⚙",
    title: "Pengaturan",
    html: `
      <div class="account-info-row"><span>Tampilan</span><span>Mengikuti pengaturan browser</span></div>
      <div class="account-info-row"><span>Bahasa</span><span>Bahasa Indonesia</span></div>
      <div class="account-info-row"><span>Notifikasi</span><span>Belum diaktifkan</span></div>
      <div class="account-note">Pengaturan lanjutan seperti tema, bahasa, dan notifikasi dapat ditambahkan tanpa mengubah data percakapan.</div>
    `
  },
  help: {
    icon: "?",
    title: "Pusat bantuan",
    html: `
      <ul class="account-help-list">
        <li><strong>Bagaimana memulai?</strong> Pilih jenis karya lalu tekan Percakapan Baru.</li>
        <li><strong>Bagaimana membuka riwayat?</strong> Buka menu riwayat dan pilih percakapan yang ingin dilanjutkan.</li>
        <li><strong>Bagaimana melampirkan dokumen?</strong> Tekan tombol ＋ di area input dan pilih file.</li>
        <li><strong>File apa yang bisa digunakan?</strong> PDF, DOC, DOCX, TXT, gambar, dan video.</li>
        <li><strong>Jawaban AI kurang tepat?</strong> Berikan konteks, dokumen, atau pertanyaan yang lebih spesifik lalu verifikasi hasilnya.</li>
      </ul>
    `
  },
  privacy: {
    icon: "♢",
    title: "Privasi & keamanan",
    html: `
      <div class="account-info-row"><span>Autentikasi</span><span>Session akun terenkripsi</span></div>
      <div class="account-info-row"><span>Riwayat</span><span>Terkait dengan akun kamu</span></div>
      <div class="account-info-row"><span>File unggahan</span><span>Diproses untuk percakapan</span></div>
      <div class="account-note">Jangan mengunggah password, API key, token, atau informasi rahasia ke dalam percakapan. Gunakan hanya dokumen yang memang diperlukan untuk penelitian.</div>
    `
  },
  about: {
    icon: "ⓘ",
    title: "Tentang RisetMate",
    html: `
      <div class="account-info-row"><span>Aplikasi</span><span>RisetMate AI</span></div>
      <div class="account-info-row"><span>Fungsi</span><span>Asisten ruang kerja akademik</span></div>
      <div class="account-info-row"><span>Fokus</span><span>Skripsi, jurnal, makalah & dokumen</span></div>
      <div class="account-note">RisetMate dirancang untuk membantu proses akademik, bukan menggantikan penilaian dan tanggung jawab penulis.</div>
    `
  }
};

function openAccountMenu() {
  accountMenuWrap.classList.add("open");
  document.getElementById("btnUserMenu").setAttribute("aria-expanded", "true");
  accountMenu.setAttribute("aria-hidden", "false");
}
function closeAccountMenu() {
  accountMenuWrap.classList.remove("open");
  document.getElementById("btnUserMenu").setAttribute("aria-expanded", "false");
  accountMenu.setAttribute("aria-hidden", "true");
}
function openAccountPanel(key) {
  const panel = accountPanels[key];
  if (!panel) return;
  const me = {
    name: document.getElementById("userName").textContent,
    contact: document.getElementById("userContact").textContent
  };
  accountModalIcon.textContent = panel.icon;
  accountModalTitle.textContent = panel.title;
  accountModalContent.innerHTML = panel.html;
  const profileName = document.getElementById("profileName");
  const profileContact = document.getElementById("profileContact");
  if (profileName) profileName.textContent = me.name;
  if (profileContact) profileContact.textContent = me.contact;
  closeAccountMenu();
  accountModalBackdrop.classList.add("open");
}
function closeAccountPanel() {
  accountModalBackdrop.classList.remove("open");
}

document.getElementById("btnUserMenu").addEventListener("click", (e) => {
  e.stopPropagation();
  if (accountMenuWrap.classList.contains("open")) closeAccountMenu();
  else openAccountMenu();
});
accountMenuWrap.addEventListener("click", (e) => {
  if (e.target === accountMenuWrap) closeAccountMenu();
});
accountMenu.querySelectorAll(".account-menu-item[data-panel]").forEach((button) => {
  button.addEventListener("click", () => openAccountPanel(button.dataset.panel));
});
document.getElementById("accountModalClose").addEventListener("click", closeAccountPanel);
accountModalBackdrop.addEventListener("click", (e) => {
  if (e.target === accountModalBackdrop) closeAccountPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAccountMenu();
    closeAccountPanel();
  }
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  closeAccountMenu();
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

init();
