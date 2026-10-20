# LinkFlux — Smart Redirector & Referral Manager

A high-performance link redirector engine and admin panel built with Node.js, Express, Tailwind CSS, and SQLite (`better-sqlite3`).

## Key Features

1. **Smart Link & Referral Routing**:
   - Path-based redirects: `yourdomain.com/my-offer?refid=34343` redirects to `https://target.com/page?refid=34343`.
   - Direct referral routes: `yourdomain.com/refid=34343` or `yourdomain.com/?refid=34343` maps directly to designated partner destinations.
2. **Automatic Query Parameter Preservation**:
   - Seamlessly appends/merges incoming tracking queries (`refid`, `utm_source`, `utm_campaign`, etc.) to target URLs without breaking existing query strings.
3. **Protected Admin Dashboard (`/admin`)**:
   - Add, edit, toggle (active/inactive), and delete redirect rules.
   - Configure HTTP status codes (`302` Found, `301` Permanent, `307` Temporary).
   - One-click copy & test link actions.
4. **Real-Time Click Analytics & Audit Trail (`/admin/logs`)**:
   - Logs incoming queries, final destination URLs, visitor IPs, and User-Agents.
5. **Ultra-light & Fast**:
   - SQLite with WAL mode enabled for zero latency.

---

## Getting Started

### 1. Configuration
Check [.env](file:///home/alvee/Documents/antigravity/focused-tesla/.env):
```env
PORT=3000
ADMIN_PASSWORD=admin123
SESSION_SECRET=super_secret_session_key_change_me
DEFAULT_FALLBACK_URL=https://google.com
```

### 2. Start the Server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

### 3. Open Admin Panel
Visit `http://localhost:3000/admin` in your browser.
- **Default Password**: `admin123`
