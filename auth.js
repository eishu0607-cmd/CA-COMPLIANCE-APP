const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS firms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (firm_id) REFERENCES firms(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    gstin TEXT,
    phone TEXT,
    email TEXT,
    filing_frequency TEXT NOT NULL DEFAULT 'monthly',
    assigned_user_id INTEGER,
    portal_token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (firm_id) REFERENCES firms(id),
    FOREIGN KEY (assigned_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    return_type TEXT NOT NULL,
    period_label TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    filed_date TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    deadline_id INTEGER,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS reminders_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deadline_id INTEGER NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id)
  );
`);

module.exports.createUserWithFirm = createUser;
