const crypto = require('node:crypto');
const db = require('./db');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUserWithFirm({ firmName, name, email, password }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('An account with this email already exists');

  const insertFirm = db.prepare('INSERT INTO firms (name) VALUES (?)');
  const firmResult = insertFirm.run(firmName);
  const firmId = firmResult.lastInsertRowid;

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  const insertUser = db.prepare(
    `INSERT INTO users (firm_id, name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?, 'owner')`
  );
  const userResult = insertUser.run(firmId, name, email, passwordHash, salt);

  return { userId: userResult.lastInsertRowid, firmId };
}

function verifyLogin(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  const computed = hashPassword(password, user.salt);
  if (computed !== user.password_hash) return null;
  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

function getUserBySession(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

module.exports = {
  createUserWithFirm,
  verifyLogin,
  createSession,
  getUserBySession,
  destroySession,
  parseCookies,
};
