const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('PWA manifest is valid and points to existing PNG icons', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.ok(Array.isArray(manifest.icons));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), 'missing icon: ' + icon.src);
    assert.equal(icon.type, 'image/png');
  }
});

test('application version is bumped for this release candidate', () => {
  assert.ok(html.includes("const APP_VERSION='4.1.0';"));
});

test('all inline classic JavaScript blocks parse', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inline = scripts.filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim());
  assert.ok(inline.length >= 1, 'expected inline app scripts');
  inline.forEach(([, attrs, body], i) => {
    if (/\btype\s*=\s*["']module["']/i.test(attrs)) return;
    assert.doesNotThrow(() => new vm.Script(body, { filename: 'inline-script-' + i + '.js' }));
  });
});

test('service worker uses a new cache name', () => {
  assert.match(sw, /projectvault-expenses-cache-v11/);
});

test('service worker identifies Supabase hosts correctly', () => {
  assert.ok(sw.includes('const isSupabase = /\\.supabase\\.co$/i.test(url.hostname);'));
  const hostPattern = /\.supabase\.co$/i;
  assert.equal(hostPattern.test('vzetpnizonsiefwxnpmr.supabase.co'), true);
  assert.equal(hostPattern.test('example.com'), false);
});

test('service worker only deletes caches owned by this app', () => {
  assert.ok(sw.includes("key.startsWith('expensestracker-cache-v') || key.startsWith('projectvault-expenses-cache-v')"));
});

test('service worker never intercepts cross-origin or Supabase traffic', () => {
  assert.ok(sw.includes('if (!sameOrigin || isSupabase) return;'));
});

test('service worker only caches successful same-origin basic responses', () => {
  assert.ok(sw.includes("response && response.ok && response.type === 'basic'"));
});

test('existing Supabase auth integration remains present', () => {
  assert.ok(html.includes('window.supabase.createClient'));
  assert.ok(html.includes('signInWithPassword'));
  assert.ok(html.includes('resetPasswordForEmail'));
});

test('core existing app areas remain in the same application source', () => {
  for (const marker of ['syncAndroidTransactions', 'syncDebts', 'renderHistory', 'renderHome', 'pvOpenDisplay']) {
    assert.ok(html.includes(marker), 'missing app feature marker: ' + marker);
  }
});

test('no service-role key marker is embedded in browser HTML', () => {
  assert.doesNotMatch(html, /service_role/i);
  assert.doesNotMatch(html, /sb_secret_[A-Za-z0-9]+/);
});
