const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('PWA manifest is valid and points to existing PNG icons', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.ok(Array.isArray(manifest.icons));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), 'missing icon: ' + icon.src);
    assert.equal(icon.type, 'image/png');
  }
});

test('service worker uses a new cache name', () => {
  assert.match(sw, /projectvault-expenses-cache-v11/);
});

test('service worker does not cache Supabase requests', () => {
  assert.match(sw, /supabase/);
  assert.match(sw, /if \(!sameOrigin \|\| isSupabase\) return/);
});

test('service worker only caches successful same-origin basic responses', () => {
  assert.match(sw, /response\.ok && response\.type === 'basic'/);
});

test('existing Supabase auth integration remains present', () => {
  assert.match(html, /window\.supabase\.createClient/);
  assert.match(html, /signInWithPassword/);
  assert.match(html, /resetPasswordForEmail/);
});

test('expected existing features have not been removed from the app source', () => {
  for (const marker of ['syncAndroidTransactions', 'syncDebts', 'renderHistory', 'renderHome', 'pvOpenDisplay']) {
    assert.ok(html.includes(marker), 'missing app feature marker: ' + marker);
  }
});

test('no service-role key marker is embedded in browser HTML', () => {
  assert.doesNotMatch(html, /service_role/i);
  assert.doesNotMatch(html, /sb_secret_[A-Za-z0-9]+/);
});
