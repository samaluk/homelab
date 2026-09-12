import {expect, test} from 'bun:test';

// Run only against an isolated local stack: this suite creates and deletes data.
const base = process.env.SITEBIN_TEST_URL;
const password = process.env.SITEBIN_TEST_OWNER_PASSWORD;
const integration = base && password ? test : test.skip;
const auth = {Authorization: `Basic ${Buffer.from(`owner:${password}`).toString('base64')}`};
const request = (path: string, init: RequestInit = {}) => fetch(new URL(path, base), {...init, redirect: 'manual'});
const owner = (path: string, init: RequestInit = {}) => request(path, {...init, headers: {...auth, ...init.headers}});

integration('owner portal and publishing API require login; cross-origin writes fail', async () => {
  for (const path of ['/', '/drop.js', '/api/sites', '/e/missing', '/mcp']) {
    expect((await request(path)).status).toBe(401);
  }
  expect((await request('/api/sites', {method: 'POST'})).status).toBe(401);
  expect((await owner('/')).status).toBe(200);
  for (const origin of ['null', 'https://untrusted.example']) {
    expect((await owner('/api/sites', {method: 'POST', headers: {Origin: origin}})).status).toBe(403);
  }
});

integration('shared report passwords, sandbox, expiry and deletion survive authenticated sessions', async () => {
  const content = '<!doctype html><html><body><h1>Synthetic report</h1><script>document.body.dataset.executed="yes"</script></body></html>';
  const viewerPassword = crypto.randomUUID();
  const data = new FormData();
  data.append('files', new Blob([content], {type: 'text/html'}), 'index.html');
  data.append('mode', 'webserver');
  data.append('view_password', viewerPassword);
  data.append('expires_at', new Date(Date.now() + 86400000).toISOString());
  const created = await owner('/api/sites', {method: 'POST', body: data});
  expect(created.status).toBe(201);
  const site = await created.json();
  const path = new URL(site.view_url).pathname;
  const editPath = '/api/sites/' + new URL(site.edit_url).pathname.split('/').at(-1);
  const editAuth = {'X-Edit-Password': site.edit_password};
  const update = (body: object) => owner(editPath, {method: 'PUT', headers: {...editAuth, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  try {
    expect(site.view_url.startsWith('https://')).toBe(true);
    expect(site.edit_url.startsWith('https://')).toBe(true);
    expect(site.view_password_protected).toBe(true);
    const gate = await request(path);
    expect(gate.status).toBe(401);
    expect(gate.headers.has('www-authenticate')).toBe(false);
    expect(gate.headers.get('cache-control')).toContain('no-store');
    expect(gate.headers.get('content-security-policy') || '').not.toContain('form-action \'none\'');
    expect(await gate.text()).not.toContain('Synthetic report');
    expect((await request(editPath, {headers: editAuth})).status).toBe(401);
    const unlock = await request('/_sitebin/unlock', {method: 'POST', body: new URLSearchParams({site: site.id, password: viewerPassword, redirect: path})});
    expect(unlock.status).toBe(303);
    const cookie = unlock.headers.get('set-cookie')!;
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Path=${path}`);
    const session = {Cookie: cookie.split(';')[0]};
    const report = await request(path, {headers: session});
    expect(report.status).toBe(200);
    expect(await report.text()).toBe(content);
    const csp = report.headers.get('content-security-policy')!;
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("connect-src 'none'");
    expect(report.headers.get('cache-control')).toContain('no-store');
    expect(report.headers.get('referrer-policy')).toBe('no-referrer');
    const partial = await request(path, {headers: {...session, Range: 'bytes=0-100'}});
    expect([200,206]).toContain(partial.status);
    expect(partial.headers.get('content-security-policy')).toContain('sandbox');
    expect((await update({expires_at: new Date(Date.now() - 1000).toISOString()})).ok).toBe(true);
    expect((await request(path, {headers: session})).status).toBe(410);
    expect((await update({expires_at: null})).ok).toBe(true);
    expect((await request(path, {headers: session})).status).toBe(200);
    expect((await update({view_password: crypto.randomUUID()})).ok).toBe(true);
    expect((await request(path, {headers: session})).status).toBe(401);
  } finally {
    expect((await owner(editPath, {method: 'DELETE', headers: editAuth})).ok).toBe(true);
  }
  expect((await request(path)).status).toBe(404);
}, 20000);
