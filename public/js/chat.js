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
    document.getElementById("userAvatar").textContent = (user.name || "A").trim().charAt(0).toUpperCase();
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
document.getElementById("mobileBackdrop").addEventListener("click", closeMobileMenu);
function closeMobileMenu() { document.getElementById("sidebar").classList.remove("open"); }

document.getElementById("btnLogout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

init();
