const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'redirector.db'));
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT UNIQUE NOT NULL,         -- e.g. "dari", "pakistan", "india", "afghanistan"
    title TEXT NOT NULL,                   -- e.g. "DARI Abu Dhabi Real Estate Verification"
    base_url TEXT NOT NULL,                -- e.g. "https://dari.ae/verify-document" or "http://localhost:8080/verify-license.html"
    append_mode TEXT DEFAULT 'path',       -- 'path' (base_url/EXT), 'query' (base_url?id=EXT), or 'custom_template'
    query_param_name TEXT DEFAULT 'id',    -- if mode is query: e.g. 'permitNumber', 'refid', 'lic'
    custom_template TEXT DEFAULT '',       -- e.g. "{base}?lic={ext}&status=active"
    forward_extra_query INTEGER DEFAULT 1, -- forward extra incoming params
    http_code INTEGER DEFAULT 302,
    is_active INTEGER DEFAULT 1,
    total_clicks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,             -- e.g. "pk-lic", "dari-contract", "verify"
    site_id INTEGER,                       -- mapped to sites table (optional)
    target_url TEXT NOT NULL,              -- destination or prefix
    forward_query INTEGER DEFAULT 1,
    http_code INTEGER DEFAULT 302,
    is_active INTEGER DEFAULT 1,
    title TEXT DEFAULT '',
    total_clicks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS click_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER,
    site_id INTEGER,
    matched_type TEXT,
    incoming_path TEXT,
    incoming_query TEXT,
    forwarded_to TEXT,
    ip TEXT,
    user_agent TEXT,
    referrer TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default verification sites if empty
const count = db.prepare('SELECT count(*) as count FROM sites').get().count;
if (count === 0) {
  const insertSite = db.prepare(`
    INSERT INTO sites (key_name, title, base_url, append_mode, query_param_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertSite.run(
    'dari', 
    'DARI Document Verification (Abu Dhabi)', 
    'https://dari-ace.com/en/app/verify-document', 
    'query', 
    'search'
  );

  insertSite.run(
    'pakistan', 
    'Pakistan Driving License Verification', 
    'http://localhost:8080/verify-license.html', 
    'query', 
    'lic'
  );

  insertSite.run(
    'india', 
    'India Verification Portal', 
    'https://verify.gov.in/check', 
    'path', 
    'id'
  );

  insertSite.run(
    'afghanistan', 
    'Afghanistan Document Portal', 
    'https://verify.mfa.af/verify', 
    'query', 
    'doc_id'
  );
}

module.exports = db;
