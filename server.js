const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
 
const {db} = require('./auth');
const auth = require('./auth');
const { generateDeadlinesForClient } = require('./deadlines');
const { runRemindersSweep } = require('./reminders');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy(); // 10MB cap for JSON bodies
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req) {
  const cookies = auth.parseCookies(req);
  const user = auth.getUserBySession(cookies.session);
  return user;
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/login.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // ---------- AUTH ----------
  if (pathname === '/api/signup' && req.method === 'POST') {
    const { firmName, name, email, password } = await readBody(req);
    if (!firmName || !name || !email || !password) {
      return sendJSON(res, 400, { error: 'All fields are required' });
    }
    try {
      const { userId } = auth.createUserWithFirm({ firmName, name, email, password });
      const token = auth.createSession(userId);
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=604800`);
      return sendJSON(res, 200, { ok: true });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const user = auth.verifyLogin(email, password);
    if (!user) return sendJSON(res, 401, { error: 'Invalid email or password' });
    const token = auth.createSession(user.id);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=604800`);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = auth.parseCookies(req);
    if (cookies.session) auth.destroySession(cookies.session);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = requireAuth(req);
    if (!user) return sendJSON(res, 401, { error: 'Not logged in' });
    const firm = db.prepare('SELECT * FROM firms WHERE id = ?').get(user.firm_id);
    return sendJSON(res, 200, { id: user.id, name: user.name, email: user.email, role: user.role, firm: firm.name });
  }

  // Everything below requires auth
  if (pathname.startsWith('/api/') && pathname !== '/api/portal-upload') {
    const user = requireAuth(req);
    if (!user) return sendJSON(res, 401, { error: 'Not logged in' });
    req.user = user;
  }

  // ---------- CLIENTS ----------
  if (pathname === '/api/clients' && req.method === 'GET') {
    const clients = db
      .prepare('SELECT * FROM clients WHERE firm_id = ? ORDER BY name')
      .all(req.user.firm_id);
    return sendJSON(res, 200, clients);
  }

  if (pathname === '/api/clients' && req.method === 'POST') {
    const { name, gstin, phone, email, filing_frequency } = await readBody(req);
    if (!name) return sendJSON(res, 400, { error: 'Client name is required' });
    const portalToken = crypto.randomBytes(16).toString('hex');
    const result = db
      .prepare(
        `INSERT INTO clients (firm_id, name, gstin, phone, email, filing_frequency, assigned_user_id, portal_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.firm_id, name, gstin || null, phone || null, email || null, filing_frequency || 'monthly', req.user.id, portalToken);
    const clientId = result.lastInsertRowid;
    generateDeadlinesForClient(clientId, filing_frequency || 'monthly');
    return sendJSON(res, 200, { id: clientId, portal_token: portalToken });
  }

  const clientMatch = pathname.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch && req.method === 'DELETE') {
    const clientId = Number(clientMatch[1]);
    db.prepare('DELETE FROM deadlines WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM documents WHERE client_id = ?').run(clientId);
    db.prepare('DELETE FROM clients WHERE id = ? AND firm_id = ?').run(clientId, req.user.firm_id);
    return sendJSON(res, 200, { ok: true });
  }

  // ---------- DEADLINES ----------
  if (pathname === '/api/deadlines' && req.method === 'GET') {
    const status = parsedUrl.searchParams.get('status'); // upcoming | overdue | filed | all
    const today = new Date().toISOString().slice(0, 10);
    let rows;
    if (status === 'overdue') {
      rows = db
        .prepare(
          `SELECT d.*, c.name as client_name FROM deadlines d
           JOIN clients c ON c.id = d.client_id
           WHERE c.firm_id = ? AND d.due_date < ? AND d.status != 'filed'
           ORDER BY d.due_date ASC`
        )
        .all(req.user.firm_id, today);
    } else if (status === 'filed') {
      rows = db
        .prepare(
          `SELECT d.*, c.name as client_name FROM deadlines d
           JOIN clients c ON c.id = d.client_id
           WHERE c.firm_id = ? AND d.status = 'filed'
           ORDER BY d.due_date DESC LIMIT 100`
        )
        .all(req.user.firm_id);
    } else if (status === 'upcoming') {
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      rows = db
        .prepare(
          `SELECT d.*, c.name as client_name FROM deadlines d
           JOIN clients c ON c.id = d.client_id
           WHERE c.firm_id = ? AND d.due_date >= ? AND d.due_date <= ? AND d.status != 'filed'
           ORDER BY d.due_date ASC`
        )
        .all(req.user.firm_id, today, twoWeeks.toISOString().slice(0, 10));
    } else {
      rows = db
        .prepare(
          `SELECT d.*, c.name as client_name FROM deadlines d
           JOIN clients c ON c.id = d.client_id
           WHERE c.firm_id = ?
           ORDER BY d.due_date ASC`
        )
        .all(req.user.firm_id);
    }
    return sendJSON(res, 200, rows);
  }

  const deadlineMatch = pathname.match(/^\/api\/deadlines\/(\d+)$/);
  if (deadlineMatch && req.method === 'PATCH') {
    const deadlineId = Number(deadlineMatch[1]);
    const { status } = await readBody(req);
    const validStatuses = ['not_started', 'docs_collected', 'filed'];
    if (!validStatuses.includes(status)) return sendJSON(res, 400, { error: 'Invalid status' });
    const filedDate = status === 'filed' ? new Date().toISOString().slice(0, 10) : null;
    db.prepare('UPDATE deadlines SET status = ?, filed_date = ? WHERE id = ?').run(status, filedDate, deadlineId);
    return sendJSON(res, 200, { ok: true });
  }

  // ---------- DASHBOARD SUMMARY ----------
  if (pathname === '/api/dashboard/summary' && req.method === 'GET') {
    const today = new Date().toISOString().slice(0, 10);
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const twoWeeksStr = twoWeeks.toISOString().slice(0, 10);

    const overdueCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines d JOIN clients c2 ON c2.id = d.client_id
         WHERE c2.firm_id = ? AND d.due_date < ? AND d.status != 'filed'`
      )
      .get(req.user.firm_id, today).c;

    const upcomingCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines d JOIN clients c2 ON c2.id = d.client_id
         WHERE c2.firm_id = ? AND d.due_date >= ? AND d.due_date <= ? AND d.status != 'filed'`
      )
      .get(req.user.firm_id, today, twoWeeksStr).c;

    const totalClients = db
      .prepare('SELECT COUNT(*) as c FROM clients WHERE firm_id = ?')
      .get(req.user.firm_id).c;

    const filedThisMonth = db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines d JOIN clients c2 ON c2.id = d.client_id
         WHERE c2.firm_id = ? AND d.status = 'filed' AND strftime('%Y-%m', d.filed_date) = strftime('%Y-%m', 'now')`
      )
      .get(req.user.firm_id).c;

    return sendJSON(res, 200, { overdueCount, upcomingCount, totalClients, filedThisMonth });
  }

  // ---------- CLIENT PORTAL (public, token-based, no login) ----------
  if (pathname.startsWith('/api/portal/') && req.method === 'GET') {
    const token = pathname.split('/')[3];
    const client = db.prepare('SELECT id, name, gstin FROM clients WHERE portal_token = ?').get(token);
    if (!client) return sendJSON(res, 404, { error: 'Invalid link' });
    const deadlines = db
      .prepare(`SELECT id, return_type, period_label, due_date, status FROM deadlines WHERE client_id = ? ORDER BY due_date DESC LIMIT 12`)
      .all(client.id);
    return sendJSON(res, 200, { client, deadlines });
  }

  if (pathname === '/api/portal-upload' && req.method === 'POST') {
    // Minimal multipart handler for a single file field named "file" plus a "token" field.
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return sendJSON(res, 400, { error: 'Bad request' });
    const boundary = '--' + boundaryMatch[1];

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const parts = buffer.toString('binary').split(boundary).slice(1, -1);

    let token = null;
    let fileBuffer = null;
    let originalName = null;

    for (const part of parts) {
      const [rawHeaders, ...rest] = part.split('\r\n\r\n');
      const body = rest.join('\r\n\r\n').slice(0, -2); // strip trailing \r\n
      if (rawHeaders.includes('name="token"')) {
        token = body.trim();
      } else if (rawHeaders.includes('name="file"')) {
        const nameMatch = rawHeaders.match(/filename="(.+?)"/);
        originalName = nameMatch ? nameMatch[1] : `upload-${Date.now()}`;
        fileBuffer = Buffer.from(body, 'binary');
      }
    }

    if (!token || !fileBuffer) return sendJSON(res, 400, { error: 'Missing file or token' });
    const client = db.prepare('SELECT id FROM clients WHERE portal_token = ?').get(token);
    if (!client) return sendJSON(res, 404, { error: 'Invalid link' });

    const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), fileBuffer);
    db.prepare('INSERT INTO documents (client_id, filename, original_name) VALUES (?, ?, ?)').run(
      client.id,
      safeName,
      originalName
    );
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/documents' && req.method === 'GET') {
    const clientId = parsedUrl.searchParams.get('client_id');
    const docs = db
      .prepare('SELECT * FROM documents WHERE client_id = ? ORDER BY uploaded_at DESC')
      .all(clientId);
    return sendJSON(res, 200, docs);
  }

  // ---------- REMINDER SWEEP (trigger manually or via cron) ----------
  if (pathname === '/api/reminders/run' && req.method === 'POST') {
    const results = await runReminderSweep(3);
    return sendJSON(res, 200, { sent: results.length, results });
  }

  // ---------- STATIC FILES ----------
  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`CA Compliance app running at http://localhost:${PORT}`);
});
