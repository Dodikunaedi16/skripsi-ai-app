const fs = require("fs");
const path = require("path");

/*
 * RisetMate lightweight JSON datastore
 *
 * LOCAL:
 *   database/app.json
 *
 * VERCEL:
 *   /tmp/risetmate-app.json
 *
 * Catatan:
 * /tmp di Vercel bersifat sementara. Ini hanya untuk membuat
 * aplikasi berjalan di serverless. Untuk production, database
 * sebaiknya dipindahkan ke PostgreSQL/Supabase/Neon.
 */

const isVercel = Boolean(process.env.VERCEL);

const dbPath = isVercel
  ? path.join("/tmp", "risetmate-app.json")
  : path.join(__dirname, "..", "database", "app.json");

// Hanya buat folder database ketika berjalan lokal.
if (!isVercel) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const emptyDb = {
  users: [],
  conversations: [],
  messages: [],
  files: [],
  counters: {
    users: 0,
    conversations: 0,
    messages: 0,
    files: 0,
  },
};

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function load() {
  try {
    if (!fs.existsSync(dbPath)) {
      return clone(emptyDb);
    }

    const raw = fs.readFileSync(dbPath, "utf8");

    if (!raw.trim()) {
      return clone(emptyDb);
    }

    const parsed = JSON.parse(raw);

    return {
      ...clone(emptyDb),
      ...parsed,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations
        : [],
      messages: Array.isArray(parsed.messages)
        ? parsed.messages
        : [],
      files: Array.isArray(parsed.files)
        ? parsed.files
        : [],
      counters: {
        ...emptyDb.counters,
        ...(parsed.counters || {}),
      },
    };
  } catch (error) {
    console.warn(
      "Database JSON tidak terbaca, menggunakan database kosong:",
      error.message
    );

    return clone(emptyDb);
  }
}

let state = load();

function save() {
  try {
    const dir = path.dirname(dbPath);

    // Pastikan folder tersedia hanya untuk filesystem yang writable.
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${dbPath}.tmp`;

    fs.writeFileSync(
      tmpPath,
      JSON.stringify(state, null, 2),
      "utf8"
    );

    fs.renameSync(tmpPath, dbPath);
  } catch (error) {
    console.error("Gagal menyimpan database:", error.message);

    /*
     * Jangan membuat request langsung crash hanya karena
     * penyimpanan JSON gagal.
     *
     * Data tetap berada di memory untuk invocation tersebut.
     */
    if (!isVercel) {
      throw error;
    }
  }
}

function nextId(table) {
  if (!Number.isInteger(state.counters[table])) {
    state.counters[table] = 0;
  }

  state.counters[table] += 1;

  return state.counters[table];
}

function now() {
  return new Date().toISOString();
}

function stmt(sql) {
  const normalized = sql
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  return {
    get(...args) {
      // USERS
      if (normalized === "SELECT * FROM USERS WHERE ID = ?") {
        return clone(
          state.users.find((u) => u.id == args[0])
        );
      }

      if (normalized === "SELECT * FROM USERS WHERE GOOGLE_ID = ?") {
        return clone(
          state.users.find((u) => u.google_id === args[0])
        );
      }

      if (normalized === "SELECT * FROM USERS WHERE EMAIL = ?") {
        return clone(
          state.users.find((u) => u.email === args[0])
        );
      }

      if (
        normalized ===
        "SELECT ID FROM USERS WHERE PHONE_NUMBER = ?"
      ) {
        const user = state.users.find(
          (u) => u.phone_number === args[0]
        );

        return user ? { id: user.id } : undefined;
      }

      if (
        normalized ===
        "SELECT * FROM USERS WHERE PHONE_NUMBER = ?"
      ) {
        return clone(
          state.users.find(
            (u) => u.phone_number === args[0]
          )
        );
      }

      if (
        normalized ===
        "SELECT ID, NAME, PHONE_NUMBER, EMAIL, AVATAR_URL FROM USERS WHERE ID = ?"
      ) {
        const user = state.users.find(
          (u) => u.id == args[0]
        );

        if (!user) return undefined;

        return clone({
          id: user.id,
          name: user.name,
          phone_number: user.phone_number,
          email: user.email,
          avatar_url: user.avatar_url,
        });
      }

      // CONVERSATIONS
      if (
        normalized ===
        "SELECT * FROM CONVERSATIONS WHERE ID = ?"
      ) {
        return clone(
          state.conversations.find(
            (conversation) => conversation.id == args[0]
          )
        );
      }

      if (
        normalized ===
        "SELECT * FROM CONVERSATIONS WHERE ID = ? AND USER_ID = ?"
      ) {
        return clone(
          state.conversations.find(
            (conversation) =>
              conversation.id == args[0] &&
              conversation.user_id == args[1]
          )
        );
      }

      throw new Error(
        `Query GET belum didukung: ${sql}`
      );
    },

    all(...args) {
      // CONVERSATIONS
      if (
        normalized ===
        "SELECT * FROM CONVERSATIONS WHERE USER_ID = ? ORDER BY UPDATED_AT DESC"
      ) {
        return clone(
          state.conversations
            .filter(
              (conversation) =>
                conversation.user_id == args[0]
            )
            .sort(
              (a, b) =>
                new Date(b.updated_at) -
                new Date(a.updated_at)
            )
        );
      }

      // MESSAGES UNTUK AI CHAT HISTORY
      if (
        normalized ===
        "SELECT ROLE, CONTENT FROM MESSAGES WHERE CONVERSATION_ID = ? ORDER BY CREATED_AT ASC"
      ) {
        return clone(
          state.messages
            .filter(
              (message) =>
                message.conversation_id == args[0]
            )
            .sort(
              (a, b) =>
                new Date(a.created_at) -
                new Date(b.created_at)
            )
            .map((message) => ({
              role: message.role,
              content: message.content,
            }))
        );
      }

      // FILE CONTEXT
      if (
        normalized.startsWith(
          "SELECT ORIGINAL_NAME, EXTRACTED_TEXT FROM FILES WHERE ID IN ("
        )
      ) {
        const userId = args[args.length - 1];

        const ids = args
          .slice(0, -1)
          .map(Number);

        return clone(
          state.files
            .filter(
              (file) =>
                ids.includes(file.id) &&
                file.user_id == userId
            )
            .map((file) => ({
              original_name: file.original_name,
              extracted_text: file.extracted_text,
            }))
        );
      }

      // USER FILES
      if (
        normalized.startsWith(
          "SELECT ID, ORIGINAL_NAME, MIMETYPE, FILESIZE, CONVERSATION_ID, UPLOADED_AT FROM FILES WHERE USER_ID = ?"
        )
      ) {
        return clone(
          state.files
            .filter(
              (file) => file.user_id == args[0]
            )
            .sort(
              (a, b) =>
                new Date(b.uploaded_at) -
                new Date(a.uploaded_at)
            )
            .map((file) => ({
              id: file.id,
              original_name: file.original_name,
              mimetype: file.mimetype,
              filesize: file.filesize,
              conversation_id:
                file.conversation_id,
              uploaded_at: file.uploaded_at,
            }))
        );
      }

      // FILES BY CONVERSATION
      if (
        normalized ===
        "SELECT * FROM FILES WHERE CONVERSATION_ID = ?"
      ) {
        return clone(
          state.files.filter(
            (file) =>
              file.conversation_id == args[0]
          )
        );
      }

      // ALL MESSAGES
      if (
        normalized ===
        "SELECT * FROM MESSAGES WHERE CONVERSATION_ID = ? ORDER BY CREATED_AT ASC"
      ) {
        return clone(
          state.messages
            .filter(
              (message) =>
                message.conversation_id == args[0]
            )
            .sort(
              (a, b) =>
                new Date(a.created_at) -
                new Date(b.created_at)
            )
        );
      }

      throw new Error(
        `Query ALL belum didukung: ${sql}`
      );
    },

    run(...args) {
      // CREATE USER - PHONE
      if (
        normalized.startsWith(
          "INSERT INTO USERS (NAME, PHONE_NUMBER, PASSWORD_HASH) VALUES"
        )
      ) {
        const [
          name,
          phone_number,
          password_hash,
        ] = args;

        if (
          state.users.some(
            (user) =>
              user.phone_number === phone_number
          )
        ) {
          throw new Error(
            "Nomor HP sudah terdaftar."
          );
        }

        const id = nextId("users");

        state.users.push({
          id,
          name,
          phone_number,
          password_hash,
          email: null,
          google_id: null,
          avatar_url: null,
          created_at: now(),
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // CREATE USER - GOOGLE (name, email, avatar_url)
      if (
        normalized.startsWith(
          "INSERT INTO USERS (NAME, EMAIL, AVATAR_URL) VALUES"
        )
      ) {
        const [name, email, avatar_url] = args;

        const existingUser = state.users.find(
          (user) =>
            user.email &&
            email &&
            String(user.email).toLowerCase() ===
              String(email).toLowerCase()
        );

        if (existingUser) {
          return {
            lastInsertRowid: existingUser.id,
            changes: 0,
          };
        }

        const id = nextId("users");

        state.users.push({
          id,
          name: name || "Pengguna Google",
          phone_number: null,
          password_hash: null,
          email: email || null,
          google_id: null,
          avatar_url: avatar_url || null,
          created_at: now(),
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // CREATE USER - GOOGLE
      if (
        normalized.startsWith(
          "INSERT INTO USERS (NAME, EMAIL, GOOGLE_ID, AVATAR_URL) VALUES"
        )
      ) {
        const [
          name,
          email,
          google_id,
          avatar_url,
        ] = args;

        const id = nextId("users");

        state.users.push({
          id,
          name,
          phone_number: null,
          password_hash: null,
          email: email || null,
          google_id,
          avatar_url: avatar_url || null,
          created_at: now(),
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // UPDATE USER PROFILE - GOOGLE LOGIN
      if (
        normalized.startsWith(
          "UPDATE USERS SET NAME = ?, AVATAR_URL = ? WHERE ID = ?"
        )
      ) {
        const [name, avatar_url, id] = args;

        const user = state.users.find(
          (item) => item.id == id
        );

        if (!user) {
          return { changes: 0 };
        }

        user.name = name || user.name;
        user.avatar_url = avatar_url || null;

        save();

        return { changes: 1 };
      }

      // UPDATE GOOGLE USER
      if (
        normalized.startsWith(
          "UPDATE USERS SET GOOGLE_ID = ?, AVATAR_URL = ? WHERE ID = ?"
        )
      ) {
        const [
          google_id,
          avatar_url,
          id,
        ] = args;

        const user = state.users.find(
          (item) => item.id == id
        );

        if (!user) {
          return { changes: 0 };
        }

        user.google_id = google_id;
        user.avatar_url =
          avatar_url || null;

        save();

        return { changes: 1 };
      }

      // CREATE CONVERSATION
      if (
        normalized.startsWith(
          "INSERT INTO CONVERSATIONS (USER_ID, TITLE, JENIS_KARYA) VALUES"
        )
      ) {
        const [
          user_id,
          title,
          jenis_karya,
        ] = args;

        const id = nextId("conversations");
        const timestamp = now();

        state.conversations.push({
          id,
          user_id,
          title,
          jenis_karya,
          created_at: timestamp,
          updated_at: timestamp,
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // CREATE MESSAGE
      if (
        normalized.startsWith(
          "INSERT INTO MESSAGES (CONVERSATION_ID, ROLE, CONTENT) VALUES"
        )
      ) {
        let conversation_id;
        let role;
        let content;

        if (args.length === 2) {
          [conversation_id, content] = args;

          role = normalized.includes(
            "'ASSISTANT'"
          )
            ? "assistant"
            : "user";
        } else {
          [
            conversation_id,
            role,
            content,
          ] = args;
        }

        const id = nextId("messages");

        state.messages.push({
          id,
          conversation_id,
          role,
          content,
          created_at: now(),
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // CREATE FILE RECORD
      if (
        normalized.startsWith(
          "INSERT INTO FILES"
        )
      ) {
        const [
          user_id,
          conversation_id,
          original_name,
          stored_name,
          mimetype,
          filesize,
          extracted_text,
        ] = args;

        const id = nextId("files");

        state.files.push({
          id,
          user_id,
          conversation_id:
            conversation_id || null,
          original_name,
          stored_name,
          mimetype: mimetype || null,
          filesize: filesize || 0,
          extracted_text:
            extracted_text || null,
          uploaded_at: now(),
        });

        save();

        return {
          lastInsertRowid: id,
          changes: 1,
        };
      }

      // UPDATE CONVERSATION TIME
      if (
        normalized.startsWith(
          "UPDATE CONVERSATIONS SET UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?"
        )
      ) {
        const conversation =
          state.conversations.find(
            (item) => item.id == args[0]
          );

        if (!conversation) {
          return { changes: 0 };
        }

        conversation.updated_at = now();

        save();

        return { changes: 1 };
      }

      // DELETE CONVERSATION
      if (
        normalized.startsWith(
          "DELETE FROM CONVERSATIONS WHERE ID = ?"
        )
      ) {
        const id = Number(args[0]);

        const before =
          state.conversations.length;

        state.conversations =
          state.conversations.filter(
            (conversation) =>
              conversation.id !== id
          );

        state.messages =
          state.messages.filter(
            (message) =>
              message.conversation_id !== id
          );

        state.files =
          state.files.map((file) =>
            file.conversation_id === id
              ? {
                  ...file,
                  conversation_id: null,
                }
              : file
          );

        save();

        return {
          changes:
            before -
            state.conversations.length,
        };
      }

      throw new Error(
        `Query RUN belum didukung: ${sql}`
      );
    },
  };
}

module.exports = {
  prepare: stmt,
};