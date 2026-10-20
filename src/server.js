require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3010;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_FALLBACK_URL = process.env.DEFAULT_FALLBACK_URL || 'https://google.com';

// View engine setup
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// Body parsing and session
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'linkflux_session_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Helper to render with layout
function renderWithLayout(res, view, data = {}) {
  res.render(view, data, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Rendering error: " + err.message);
    }
    res.render('layout', {
      ...data,
      body: html
    });
  });
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// ================= ADMIN ROUTES =================

// Login page
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  renderWithLayout(res, 'login', {
    title: 'Admin Login - MultiVerify',
    isAuthenticated: false,
    error: req.query.error || null
  });
});

// Handle Login with Remember Me support
app.post('/admin/login', (req, res) => {
  const { password, remember_me } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    if (remember_me) {
      // 30 days remember me cookie
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    } else {
      // 1 day standard session
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24;
    }
    return res.redirect('/admin');
  }
  return res.redirect('/admin/login?error=Invalid+admin+password');
});

// Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Dashboard: Verification Sites Manager (Root Admin)
app.get('/admin', requireAuth, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY id ASC').all();
  const baseUrl = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;

  renderWithLayout(res, 'index', {
    title: 'Verification Sites - MultiVerify',
    isAuthenticated: true,
    activeTab: 'sites',
    sites,
    baseUrl,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// Create Site Portal
app.post('/admin/sites', requireAuth, (req, res) => {
  let { title, key_name, base_url, append_mode, query_param_name } = req.body;
  if (!title || !key_name || !base_url) {
    return res.redirect('/admin?error=Missing+required+fields');
  }

  key_name = key_name.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  base_url = base_url.trim();
  title = title.trim();
  append_mode = append_mode || 'query';
  query_param_name = (query_param_name || 'id').trim();

  try {
    const stmt = db.prepare(`
      INSERT INTO sites (key_name, title, base_url, append_mode, query_param_name, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    stmt.run(key_name, title, base_url, append_mode, query_param_name);
    res.redirect('/admin?success=Portal+created+successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message.includes('UNIQUE') ? 'Key or Slug already exists' : err.message));
  }
});

// Edit Site Portal
app.post('/admin/sites/:id/edit', requireAuth, (req, res) => {
  const { id } = req.params;
  let { title, key_name, base_url, append_mode, query_param_name } = req.body;
  if (!title || !key_name || !base_url) {
    return res.redirect('/admin?error=Missing+required+fields');
  }

  key_name = key_name.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  base_url = base_url.trim();
  title = title.trim();
  append_mode = append_mode || 'query';
  query_param_name = (query_param_name || 'id').trim();

  try {
    const stmt = db.prepare(`
      UPDATE sites 
      SET key_name = ?, title = ?, base_url = ?, append_mode = ?, query_param_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(key_name, title, base_url, append_mode, query_param_name, id);
    res.redirect('/admin?success=Portal+updated+successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message.includes('UNIQUE') ? 'Key or Slug already exists' : err.message));
  }
});

// Toggle Site Portal
app.post('/admin/sites/:id/toggle', requireAuth, (req, res) => {
  const { id } = req.params;
  const site = db.prepare('SELECT is_active FROM sites WHERE id = ?').get(id);
  if (site) {
    db.prepare('UPDATE sites SET is_active = ? WHERE id = ?').run(site.is_active ? 0 : 1, id);
  }
  const referer = req.headers['referer'] || '/admin';
  res.redirect(referer);
});

// Delete Site Portal
app.post('/admin/sites/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM sites WHERE id = ?').run(id);
  res.redirect('/admin?success=Portal+deleted+successfully');
});

// Dedicated Site Rules Page
app.get('/admin/rules', requireAuth, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY id ASC').all();
  const baseUrl = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;

  renderWithLayout(res, 'rules', {
    title: 'Site Forwarding Rules - MultiVerify',
    isAuthenticated: true,
    activeTab: 'rules',
    sites,
    baseUrl,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// Dedicated Sites Links Page (Direct Portal Link Launchpad)
app.get('/admin/portals', requireAuth, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY id ASC').all();
  const baseUrl = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;

  renderWithLayout(res, 'portals', {
    title: 'Direct Portals Hub - MultiVerify',
    isAuthenticated: true,
    activeTab: 'portals',
    sites,
    baseUrl
  });
});

// Custom Slugs / Shortlinks Page
app.get('/admin/links', requireAuth, (req, res) => {
  const links = db.prepare('SELECT * FROM links ORDER BY id DESC').all();
  const baseUrl = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;

  renderWithLayout(res, 'links', {
    title: 'Custom Slugs - MultiVerify',
    isAuthenticated: true,
    activeTab: 'links',
    links,
    baseUrl,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// Create Custom Link
app.post('/admin/links', requireAuth, (req, res) => {
  let { slug, target_url, title } = req.body;
  if (!slug || !target_url) {
    return res.redirect('/admin/links?error=Missing+slug+or+target+URL');
  }

  slug = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  target_url = target_url.trim();

  try {
    const stmt = db.prepare(`
      INSERT INTO links (slug, target_url, title, is_active)
      VALUES (?, ?, ?, 1)
    `);
    stmt.run(slug, target_url, (title || '').trim());
    res.redirect('/admin/links?success=Custom+slug+created');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/links?error=' + encodeURIComponent(err.message.includes('UNIQUE') ? 'Slug already in use' : err.message));
  }
});

// Edit Custom Link
app.post('/admin/links/:id/edit', requireAuth, (req, res) => {
  const { id } = req.params;
  let { slug, target_url, title } = req.body;
  if (!slug || !target_url) {
    return res.redirect('/admin/links?error=Missing+slug+or+target+URL');
  }

  slug = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  target_url = target_url.trim();

  try {
    const stmt = db.prepare(`
      UPDATE links 
      SET slug = ?, target_url = ?, title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(slug, target_url, (title || '').trim(), id);
    res.redirect('/admin/links?success=Custom+slug+updated');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/links?error=' + encodeURIComponent(err.message.includes('UNIQUE') ? 'Slug already in use' : err.message));
  }
});

// Toggle Custom Link
app.post('/admin/links/:id/toggle', requireAuth, (req, res) => {
  const { id } = req.params;
  const link = db.prepare('SELECT is_active FROM links WHERE id = ?').get(id);
  if (link) {
    db.prepare('UPDATE links SET is_active = ? WHERE id = ?').run(link.is_active ? 0 : 1, id);
  }
  const referer = req.headers['referer'] || '/admin/links';
  res.redirect(referer);
});

// Delete Custom Link
app.post('/admin/links/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
  res.redirect('/admin/links?success=Slug+deleted');
});

// QR Code Generation Endpoint
app.get('/admin/sites/:id/qr', requireAuth, async (req, res) => {
  const { id } = req.params;
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get('host')}`;
  const qrUrl = `${PUBLIC_DOMAIN}/${site.key_name}/{ID}`;
  const displayUrl = `${PUBLIC_DOMAIN}/${site.key_name}/`;

  try {
    const qrDataUrl = await QRCode.toDataURL(displayUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.json({ qr: qrDataUrl, url: displayUrl, key: site.key_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/logs', requireAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM click_logs ORDER BY id DESC LIMIT 250').all();
  renderWithLayout(res, 'logs', {
    title: 'Audit Logs - MultiVerify',
    isAuthenticated: true,
    activeTab: 'logs',
    logs
  });
});

// Clear Logs
app.post('/admin/logs/clear', requireAuth, (req, res) => {
  db.prepare('DELETE FROM click_logs').run();
  res.redirect('/admin/logs');
});

// ================= REDIRECTION ROUTER =================

function logAndRedirect(req, res, targetUrl, matchedType, siteId = null, linkId = null, httpCode = 302) {
  const originalQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || '';

  try {
    db.prepare(`
      INSERT INTO click_logs (link_id, site_id, matched_type, incoming_path, incoming_query, forwarded_to, ip, user_agent, referrer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(linkId, siteId, matchedType, req.path, originalQuery, targetUrl, ip, userAgent, referrer);
  } catch (err) {
    console.error('Logging error:', err);
  }

  return res.redirect(httpCode, targetUrl);
}

// Universal QR & Extension Router Middleware
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  if (req.path === '/favicon.ico') {
    return res.status(204).end();
  }

  const cleanPath = req.path.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes
  const segments = cleanPath.split('/').filter(Boolean);
  const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';

  // 1. Check Site Portal Routing: e.g. /dari/:id, /pakistan/:id, /india/:id, /afghanistan/:id
  if (segments.length >= 1) {
    const siteKey = segments[0].toLowerCase();
    const site = db.prepare('SELECT * FROM sites WHERE key_name = ? AND is_active = 1').get(siteKey);

    if (site) {
      // The remaining segments form the extension/ID e.g. /pakistan/ITP-89231 or /dari/12345
      const extId = segments.slice(1).join('/');
      let destination = site.base_url;

      if (extId) {
        if (site.append_mode === 'path') {
          // Append as path: base_url/EXT_ID
          destination = destination.replace(/\/+$/, '') + '/' + encodeURIComponent(extId);
        } else if (site.append_mode === 'query') {
          // Append as query parameter: base_url?param=EXT_ID
          const paramName = site.query_param_name || 'id';
          const sep = destination.includes('?') ? '&' : '?';
          destination = `${destination}${sep}${encodeURIComponent(paramName)}=${encodeURIComponent(extId)}`;
        }
      }

      // If incoming request also has additional queries (?refid=... or ?status=...), merge them
      if (site.forward_extra_query && rawQuery) {
        const incomingParams = new URLSearchParams(rawQuery);
        try {
          const destObj = new URL(destination);
          for (const [k, v] of incomingParams.entries()) {
            destObj.searchParams.set(k, v);
          }
          destination = destObj.toString();
        } catch {
          const sep = destination.includes('?') ? '&' : '?';
          destination = `${destination}${sep}${rawQuery}`;
        }
      }

      // Increment site counter
      db.prepare('UPDATE sites SET total_clicks = total_clicks + 1 WHERE id = ?').run(site.id);

      return logAndRedirect(req, res, destination, `site_portal:${site.key_name}`, site.id, null, site.http_code || 302);
    }
  }

  // 2. Check Custom Links table (e.g. /refid=34343, /offer1, etc.)
  if (cleanPath) {
    const link = db.prepare('SELECT * FROM links WHERE slug = ? AND is_active = 1').get(cleanPath);
    if (link) {
      let finalUrl = link.target_url;
      if (link.forward_query && rawQuery) {
        const sep = finalUrl.includes('?') ? '&' : '?';
        finalUrl = `${finalUrl}${sep}${rawQuery}`;
      }
      db.prepare('UPDATE links SET total_clicks = total_clicks + 1 WHERE id = ?').run(link.id);
      return logAndRedirect(req, res, finalUrl, 'custom_link', null, link.id, link.http_code || 302);
    }
  }

  // 3. Root Query check: e.g. domain/?refid=34343 or domain/?pakistan=ITP-123
  if (req.path === '/' && rawQuery) {
    const params = new URLSearchParams(rawQuery);
    for (const [key, val] of params.entries()) {
      // Check if key matches a site portal
      const site = db.prepare('SELECT * FROM sites WHERE key_name = ? AND is_active = 1').get(key.toLowerCase());
      if (site) {
        const paramName = site.query_param_name || 'id';
        const sep = site.base_url.includes('?') ? '&' : '?';
        const dest = `${site.base_url}${sep}${encodeURIComponent(paramName)}=${encodeURIComponent(val)}`;
        db.prepare('UPDATE sites SET total_clicks = total_clicks + 1 WHERE id = ?').run(site.id);
        return logAndRedirect(req, res, dest, `root_query:${key}`, site.id, null, 302);
      }
    }
  }

  // 4. Default root route: render the public Super Shop landing page
  if (req.path === '/') {
    return res.render('shop');
  }

  // 5. 404
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>404 - QR Route Not Found</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-4">
      <div class="text-center max-w-md">
        <h1 class="text-4xl font-bold text-rose-500 mb-2">404</h1>
        <p class="text-slate-400 mb-6">No active verification route or country portal found for this QR link.</p>
        <a href="/admin" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition">
          Go to MultiVerify Admin
        </a>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 MultiVerify QR Redirector running on http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel available at http://localhost:${PORT}/admin`);
});
