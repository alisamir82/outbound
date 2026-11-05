const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const shots = process.env.SHOTS_DIR ?? '/tmp/outbound-smoke-shots';
require('fs').mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); await page.screenshot({ path: `${shots}/fail-${name}.png` }); } };

  await step('login-admin', async () => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', 'admin@example.com');
    await page.fill('input[name=password]', 'Admin12345!');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
    await page.screenshot({ path: `${shots}/admin-overview.png` });
  });
  await step('clients-list', async () => {
    await page.goto(`${BASE}/admin/clients`);
    await page.waitForSelector('text=Acme Demo');
    await page.screenshot({ path: `${shots}/clients.png` });
  });
  await step('create-client', async () => {
    await page.goto(`${BASE}/admin/clients/new`);
    await page.fill('input[name=name]', 'Globex Corp');
    await page.fill('input[name=website]', 'https://globex.example.com');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await page.waitForSelector('text=Globex Corp');
  });
  await step('invite-client-admin', async () => {
    await page.fill('form:has(input[name=email]) input[name=name]', 'Pat Invitee');
    await page.fill('input[name=email]', 'pat@globex.example.com');
    await page.selectOption('select[name=role]', 'client_admin');
    await page.click('form:has(input[name=email]) button[type=submit]');
    await page.waitForSelector('text=Invitation sent to pat@globex.example.com', { timeout: 15000 });
    await page.waitForSelector('text=Invited');
    await page.screenshot({ path: `${shots}/client-detail.png` });
  });
  await step('update-client', async () => {
    const form = page.locator('form:has(select[name=status])');
    await form.locator('select[name=status]').selectOption('active');
    await form.locator('input[name=tokenBudgetMonthlyUsd]').fill('250');
    await form.locator('button[type=submit]').click();
    await page.waitForSelector('text=Client saved', { timeout: 15000 });
  });
  await step('integrations', async () => {
    await page.goto(`${BASE}/admin/settings/integrations`);
    const form = page.locator('form:has(input[name=key][value=instantly])');
    await form.locator('input[name=apiKey]').fill('test-instantly-key-123');
    await form.locator('input[name=enabled]').check();
    await form.locator('button[type=submit]').click();
    await page.waitForSelector('text=Instantly.ai saved', { timeout: 15000 });
    await page.reload();
    await page.waitForSelector('text=Set. Leave blank to keep');
    await page.screenshot({ path: `${shots}/integrations.png`, fullPage: true });
  });
  await step('view-as-client', async () => {
    await page.goto(`${BASE}/admin/clients`);
    await page.click('text=View as client >> nth=0');
    await page.waitForSelector('text=Viewing as a client');
    await page.waitForSelector('text=Outbound dashboard');
    await page.screenshot({ path: `${shots}/view-as-client.png` });
  });
  await step('logout', async () => {
    await page.click('text=Sign out');
    await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
  });
  await step('login-client-admin', async () => {
    await page.fill('input[name=email]', 'owner@acme-demo.example.com');
    await page.fill('input[name=password]', 'Demo12345!');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
    await page.waitForSelector('text=Acme Demo');
    await page.screenshot({ path: `${shots}/client-dashboard.png` });
  });
  await step('client-admin-blocked-from-admin', async () => {
    const r = await page.goto(`${BASE}/admin/clients`);
    if (!page.url().startsWith(`${BASE}/app`)) throw new Error('not redirected: ' + page.url());
  });
  await step('client-team', async () => {
    await page.goto(`${BASE}/app/team`);
    await page.waitForSelector('text=Sam SDR');
    await page.waitForSelector('text=Send invitation');
    await page.screenshot({ path: `${shots}/client-team.png` });
  });
  await step('forgot-password', async () => {
    await page.click('text=Sign out');
    await page.goto(`${BASE}/forgot-password`);
    await page.fill('input[name=email]', 'owner@acme-demo.example.com');
    await page.click('button[type=submit]');
    await page.waitForSelector('text=reset link has been sent');
  });
  await browser.close();
})();
