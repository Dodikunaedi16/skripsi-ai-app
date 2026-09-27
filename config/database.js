const fs = require("fs");
const path = require("path");

// Lightweight JSON datastore.
// This removes native SQLite dependencies so npm install works on Node 18-24
// without requiring a C/C++ build toolchain.
const dbDir = path.join(__dirname, "..");
const dbPath = path.join(dbDir, "database", "app.json");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const emptyDb = {
  users: [],
  conversations: [],
  messages: [],
  files: [],
  counters: { users: 0, conversations: 0, messages: 0, files: 0 },
};

function load() {
  try {
    if (!fs.existsSync(dbPath)) return structuredClone(emptyDb);
    const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return {
      ...structuredClone(emptyDb),
      ...parsed,
      counters: { ...emptyDb.counters, ...(parsed.counters || {}) },
    };
  } catch (error) {
    console.warn("Database JSON rusak/tidak terbaca, membuat database baru:", error.message);
    return structuredClone(emptyDb);
  }
}

let state = load();

function save() {
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, dbPath);
}

function nextId(table) {
  state.counters[table] += 1;
  return state.counters[table];
}

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stmt(sql) {
  const normalized = sql.replace(/\s+/g, " ").trim().toUpperCase();

  return {
    get(...args) {
      if (normalized === "SELECT * FROM USERS WHERE ID = ?") {
        return clone(state.users.find((u) => u.id == args[0]));
      }
      if (normalized === "SELECT * FROM USERS WHERE GOOGLE_ID = ?") {
        return clone(state.users.find((u) => u.google_id === args[0]));
      }
      if (normalized === "SELECT * FROM USERS WHERE EMAIL = ?") {
        return clone(state.users.find((u) => u.email === args[0]));
      }
      if (normalized === "SELECT ID FROM USERS WHERE PHONE_NUMBER = ?") {
        const u = state.users.find((x) => x.phone_number === args[0]);
        return u ? { id: u.id } : undefined;
      }
      if (normalized === "SELECT * FROM USERS WHERE PHONE_NUMBER = ?") {
        return clone(state.users.find((u) => u.phone_number === args[0]));
      }
      if (normalized === "SELECT ID, NAME, PHONE_NUMBER, EMAIL, AVATAR_URL FROM USERS WHERE ID = ?") {
        const u = state.users.find((x) => x.id == args[0]);
        if (!u) return undefined;
        return clone({ id: u.id, name: u.name, phone_number: u.phone_number, email: u.email, avatar_url: u.avatar_url });
      }
      if (normalized === "SELECT * FROM CONVERSATIONS WHERE ID = ?") {
        return clone(state.conversations.find((c) => c.id == args[0]));
      }
      if (normalized === "SELECT * FROM CONVERSATIONS WHERE ID = ? AND USER_ID = ?") {
        return clone(state.conversations.find((c) => c.id == args[0] && c.user_id == args[1]));
      }
      throw new Error(`Query GET belum didukung: ${sql}`);
    },

    all(...args) {
      if (normalized === "SELECT * FROM CONVERSATIONS WHERE USER_ID = ? ORDER BY UPDATED_AT DESC") {
        return clone(state.conversations.filter((c) => c.user_id == args[0]).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
      }
      if (normalized === "SELECT ROLE, CONTENT FROM MESSAGES WHERE CONVERSATION_ID = ? ORDER BY CREATED_AT ASC") {
        return clone(state.messages.filter((m) => m.conversation_id == args[0]).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((m) => ({ role: m.role, content: m.content })));
      }
      if (normalized.startsWith("SELECT ORIGINAL_NAME, EXTRACTED_TEXT FROM FILES WHERE ID IN (")) {
        const userId = args[args.length - 1];
        const ids = args.slice(0, -1).map(Number);
        return clone(state.files.filter((f) => ids.includes(f.id) && f.user_id == userId).map((f) => ({ original_name: f.original_name, extracted_text: f.extracted_text })));
      }
      if (normalized.startsWith("SELECT ID, ORIGINAL_NAME, MIMETYPE, FILESIZE, CONVERSATION_ID, UPLOADED_AT FROM FILES WHERE USER_ID = ?")) {
        return clone(state.files.filter((f) => f.user_id == args[0]).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)).map((f) => ({
          id: f.id, original_name: f.original_name, mimetype: f.mimetype, filesize: f.filesize, conversation_id: f.conversation_id, uploaded_at: f.uploaded_at,
        })));
      }
      if (normalized === "SELECT * FROM FILES WHERE CONVERSATION_ID = ?") {
        return clone(state.files.filter((f) => f.conversation_id == args[0]));
      }
      if (normalized === "SELECT * FROM MESSAGES WHERE CONVERSATION_ID = ? ORDER BY CREATED_AT ASC") {
        return clone(state.messages.filter((m) => m.conversation_id == args[0]).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      }
      throw new Error(`Query ALL belum didukung: ${sql}`);
    },

    run(...args) {
      if (normalized.startsWith("INSERT INTO USERS (NAME, PHONE_NUMBER, PASSWORD_HASH) VALUES")) {
        const [name, phone_number, password_hash] = args;
        if (state.users.some((u) => u.phone_number === phone_number)) throw new Error("Nomor HP sudah terdaftar.");
        const id = nextId("users");
        state.users.push({ id, name, phone_number, password_hash, email: null, google_id: null, avatar_url: null, created_at: now() });
        save();
        return { lastInsertRowid: id, changes: 1 };
      }
      if (normalized.startsWith("INSERT INTO USERS (NAME, EMAIL, GOOGLE_ID, AVATAR_URL) VALUES")) {
        const [name, email, google_id, avatar_url] = args;
        const id = nextId("users");
        state.users.push({ id, name, phone_number: null, password_hash: null, email: email || null, google_id, avatar_url: avatar_url || null, created_at: now() });
        save();
        return { lastInsertRowid: id, changes: 1 };
      }
      if (normalized.startsWith("UPDATE USERS SET GOOGLE_ID = ?, AVATAR_URL = ? WHERE ID = ?")) {
        const [google_id, avatar_url, id] = args;
        const u = state.users.find((x) => x.id == id);
        if (!u) return { changes: 0 };
        u.google_id = google_id; u.avatar_url = avatar_url || null; save(); return { changes: 1 };
      }
      if (normalized.startsWith("INSERT INTO CONVERSATIONS (USER_ID, TITLE, JENIS_KARYA) VALUES")) {
        const [user_id, title, jenis_karya] = args;
        const id = nextId("conversations"); const t = now();
        state.conversations.push({ id, user_id, title, jenis_karya, created_at: t, updated_at: t }); save(); return { lastInsertRowid: id, changes: 1 };
      }
      if (normalized.startsWith("INSERT INTO MESSAGES (CONVERSATION_ID, ROLE, CONTENT) VALUES")) {
        let conversation_id; let role; let content;
        if (args.length === 2) {
          [conversation_id, content] = args;
          role = normalized.includes("'ASSISTANT'") ? "assistant" : "user";
        } else {
          [conversation_id, role, content] = args;
        }
        const id = nextId("messages");
        state.messages.push({ id, conversation_id, role, content, created_at: now() }); save(); return { lastInsertRowid: id, changes: 1 };
      }
      if (normalized.startsWith("INSERT INTO FILES")) {
        const [user_id, conversation_id, original_name, stored_name, mimetype, filesize, extracted_text] = args;
        const id = nextId("files");
        state.files.push({ id, user_id, conversation_id: conversation_id || null, original_name, stored_name, mimetype: mimetype || null, filesize: filesize || 0, extracted_text: extracted_text || null, uploaded_at: now() }); save(); return { lastInsertRowid: id, changes: 1 };
      }
      if (normalized.startsWith("UPDATE CONVERSATIONS SET UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?")) {
        const c = state.conversations.find((x) => x.id == args[0]); if (!c) return { changes: 0 }; c.updated_at = now(); save(); return { changes: 1 };
      }
      if (normalized.startsWith("DELETE FROM CONVERSATIONS WHERE ID = ?")) {
        const id = Number(args[0]); const before = state.conversations.length;
        state.conversations = state.conversations.filter((c) => c.id !== id);
        state.messages = state.messages.filter((m) => m.conversation_id !== id);
        state.files = state.files.map((f) => f.conversation_id === id ? { ...f, conversation_id: null } : f);
        save(); return { changes: before - state.conversations.length };
      }
      throw new Error(`Query RUN belum didukung: ${sql}`);
    },
  };
}

module.exports = { prepare: stmt };
