const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const shots = process.env.SHOTS_DIR ?? '/tmp/outbound-smoke-shots';
require('fs').mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: `${shots}/fail-${name}.png` }); } };
  const waitFor = async (text, ms = 60000) => page.waitForSelector(`text=${text}`, { timeout: ms });

  await step('login', async () => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', 'owner@acme-demo.example.com');
    await page.fill('input[name=password]', 'Demo12345!');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
  });
  await step('create-icp', async () => {
    await page.goto(`${BASE}/app/icps/new`);
    await page.fill('textarea[name=prompt]', 'We sell AI-powered reply handling to B2B sales teams of 20-200 reps in the UK and US. Buyers are heads of sales and revenue operations. Customers book 30% more meetings from outbound within 60 days.');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/app\/icps\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await waitFor('Value proposition');
    await page.screenshot({ path: `${shots}/icp-detail.png`, fullPage: true });
  });
  await step('edit-icp', async () => {
    await page.fill('input[name=name]', 'UK/US sales leaders');
    await page.click('text=Save changes');
    await waitFor('Saved as version 2');
  });
  await step('start-lead-run', async () => {
    await page.fill('input[name=count]', '40');
    await page.click('text=Start lead run');
    await page.waitForURL(/\/app\/leads\/runs\/[0-9a-f-]{36}$/, { timeout: 15000 });
  });
  await step('lead-run-completes', async () => {
    await waitFor('Bulk approve', 60000);
    await page.screenshot({ path: `${shots}/lead-run.png`, fullPage: true });
  });
  await step('approve-by-score', async () => {
    await page.click('text=Approve by score');
    await page.waitForFunction(() => {
      const tiles = [...document.querySelectorAll('p.text-2xl')];
      const labels = [...document.querySelectorAll('p.uppercase')].map(p => p.textContent.trim());
      const i = labels.indexOf('Awaiting review');
      return i >= 0 && tiles[i] && tiles[i].textContent.trim() === '0';
    }, null, { timeout: 20000 });
  });
  await step('manual-reject', async () => {
    const boxes = page.locator('input[name=leadId]');
    await boxes.nth(0).check();
    await page.click('button:has-text("Reject selected")');
    await page.waitForSelector('text=/1 lead rejected/', { timeout: 15000 });
  });
  await step('leads-filter', async () => {
    await page.goto(`${BASE}/app/leads?status=approved`);
    await waitFor('Leads');
    const n = await page.locator('input[name=leadId]').count();
    if (n < 5) throw new Error('expected approved leads, got ' + n);
  });
  await step('create-campaign', async () => {
    await page.goto(`${BASE}/app/campaigns/new`);
    await page.fill('input[name=name]', 'Q4 sales leaders');
    await page.selectOption('select[name=icpId]', { label: 'UK/US sales leaders' });
    await page.fill('textarea[name=brief]', 'Lead with the meetings-booked angle, mention the 30% uplift, offer a 15-minute demo.');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/app\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15000 });
  });
  await step('copy-generated', async () => {
    await page.waitForSelector('textarea[name=body_0]', { timeout: 60000 });
    await page.screenshot({ path: `${shots}/campaign-review.png`, fullPage: true });
  });
  await step('edit-copy', async () => {
    await page.fill('input[name=subject_1]', 'one more angle');
    await page.click('text=Save edits');
    await waitFor('Copy saved');
  });
  await step('approve-copy', async () => {
    await page.click('text=Approve copy');
    await page.waitForSelector('text=/Push \\d+ leads and launch/', { timeout: 15000 });
  });
  await step('push-campaign', async () => {
    await page.click('text=/Push \\d+ leads and launch/');
    await page.waitForSelector('text=Instantly ID: mock-campaign', { timeout: 60000 });
    await page.waitForSelector('span:has-text("active")', { timeout: 60000 });
    await page.screenshot({ path: `${shots}/campaign-active.png`, fullPage: true });
  });
  await step('leads-pushed', async () => {
    await page.goto(`${BASE}/app/leads?status=pushed`);
    const n = await page.locator('tbody tr').count();
    if (n < 5) throw new Error('expected pushed rows, got ' + n);
  });
  await step('skills-override', async () => {
    await page.goto(`${BASE}/app/settings/skills`);
    const form = page.locator('form:has(input[name=skillKey][value=copywriter])');
    await form.locator('textarea').fill('You are a copywriter for Acme. Keep every email under 60 words and always mention the free route audit.');
    await form.locator('button[type=submit]').click();
    await waitFor('Copywriter override saved');
    await waitFor('Overridden');
    await page.click('text=Reset to default');
    await page.waitForSelector('text=Overridden', { state: 'detached', timeout: 15000 });
  });
  await step('dashboard', async () => {
    await page.goto(`${BASE}/app`);
    await waitFor('Live campaigns');
    await page.screenshot({ path: `${shots}/dashboard-phase1.png` });
  });
  await step('admin-view-as', async () => {
    await page.click('text=Sign out');
    await page.waitForURL(`${BASE}/login`);
    await page.fill('input[name=email]', 'admin@example.com');
    await page.fill('input[name=password]', 'Admin12345!');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
    await page.goto(`${BASE}/admin/clients`);
    await page.click('text=View as client >> nth=0');
    await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
    await waitFor('as super admin');
    await page.goto(`${BASE}/app/campaigns`);
    await waitFor('Q4 sales leaders');
    await page.click('text=Back to admin');
    await page.waitForURL(`${BASE}/admin/clients`, { timeout: 15000 });
  });
  await step('admin-spend', async () => {
    await page.goto(`${BASE}/admin`);
    await waitFor('AI spend (month)');
  });
  await browser.close();
})();
