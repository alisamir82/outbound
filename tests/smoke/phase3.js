const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const shots = process.env.SHOTS_DIR ?? '/tmp/outbound-smoke-shots';
require('fs').mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: `${shots}/fail-${name}.png`, fullPage: true }); } };
  const waitFor = async (text, ms = 60000) => page.waitForSelector(`text=${text}`, { timeout: ms });
  const login = async (email, pw, url) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', email); await page.fill('input[name=password]', pw);
    await page.click('button[type=submit]'); await page.waitForURL(url, { timeout: 15000 });
  };

  await step('admin-run-checks', async () => {
    await login('admin@example.com', 'Admin12345!', `${BASE}/admin`);
    await page.goto(`${BASE}/admin/health`);
    await page.click('text=Run checks now');
    await page.waitForSelector('text=sdr2@agency-demo.example.com', { timeout: 60000 });
    await waitFor('Bounce rate 3.8%');
    await waitFor('Warm-up disabled');
    await page.screenshot({ path: `${shots}/admin-health.png`, fullPage: true });
  });
  await step('admin-map-account', async () => {
    const row = page.locator('tr:has-text("sdr1@agency-demo.example.com")');
    await row.locator('select[name=clientId]').selectOption({ label: 'Acme Demo' });
    await row.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1500);
    await page.reload();
    const v = await page.locator('tr:has-text("sdr1@agency-demo.example.com") select[name=clientId] option:checked').innerText();
    if (v !== 'Acme Demo') throw new Error('mapping not saved: ' + v);
  });
  await step('admin-spend', async () => {
    await page.goto(`${BASE}/admin/spend`);
    await waitFor('By skill');
    await waitFor('Acme Demo');
    await page.screenshot({ path: `${shots}/admin-spend.png`, fullPage: true });
  });
  await step('admin-alerts-overview', async () => {
    await page.goto(`${BASE}/admin`);
    await waitFor('email health');
    await page.click('button:has-text("Dismiss") >> nth=0');
    await page.waitForTimeout(1000);
  });
  await step('admin-client-compliance', async () => {
    await page.goto(`${BASE}/admin/clients`);
    await page.click('text=Acme Demo');
    await page.fill('input[name=blockedRegions]', 'CA, de');
    await page.fill('input[name=dataRetentionDays]', '180');
    await page.click('button:has-text("Save")');
    await waitFor('Client saved');
    await page.reload();
    const v = await page.inputValue('input[name=blockedRegions]');
    if (v !== 'CA, DE') throw new Error('blocked regions = ' + v);
    await page.click('text=Sign out');
    await page.waitForURL(`${BASE}/login`);
  });
  await step('client-campaign-stats', async () => {
    await login('owner@acme-demo.example.com', 'Demo12345!', `${BASE}/app`);
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await waitFor('Last 14 days');
    await waitFor('Open rate');
  });
  await step('client-generate-report', async () => {
    await page.goto(`${BASE}/app/reports`);
    await page.click('text=Generate report now');
    await waitFor('Report is being generated');
    await page.waitForTimeout(6000);
    await page.reload();
    await page.waitForSelector('tbody tr >> a', { timeout: 30000 });
    await page.click('tbody tr >> nth=0 >> a');
    await waitFor('Weekly report');
    await waitFor('Next steps');
    await waitFor('Reply classifications');
    await page.screenshot({ path: `${shots}/report.png`, fullPage: true });
  });
  await step('client-proposal-approve', async () => {
    await page.goto(`${BASE}/app/reports`);
    await waitFor('Optimisation proposals');
    const n = await page.locator('button:has-text("Approve and apply")').count();
    if (n === 0) throw new Error('no proposals generated');
    await page.click('button:has-text("Approve and apply") >> nth=0');
    await page.waitForTimeout(4000);
    await page.reload();
    await page.waitForSelector('text=applied', { timeout: 30000 });
    await page.screenshot({ path: `${shots}/proposals.png`, fullPage: true });
  });
  await step('client-proposal-reject', async () => {
    const n = await page.locator('button:has-text("Reject")').count();
    if (n === 0) { console.log('  (no second proposal to reject)'); return; }
    await page.click('button:has-text("Reject") >> nth=0');
    await page.waitForTimeout(1500);
    await page.reload();
    await waitFor('rejected');
  });
  await step('client-lead-run-region-block', async () => {
    await page.goto(`${BASE}/app/icps`);
    await page.click('tbody tr >> nth=0 >> a');
    await page.fill('input[name=count]', '30');
    await page.click('text=Start lead run');
    await page.waitForURL(/\/app\/leads\/runs\//, { timeout: 15000 });
    await waitFor('Bulk approve', 60000);
    const countries = await page.$$eval('tbody tr td:nth-child(3) .text-xs', (els) => els.map((e) => e.textContent.trim()));
    if (countries.length === 0) throw new Error('no leads in run');
    const leaked = countries.filter((c) => c === 'DE' || c === 'CA');
    if (leaked.length) throw new Error('blocked regions leaked: ' + leaked.join(','));
  });
  await step('email-sent-check', async () => {
    // the report email is logged by the web/worker in dev mode; verify the DB marks it emailed via the UI column
    await page.goto(`${BASE}/app/reports`);
    const emailed = await page.locator('tbody tr >> nth=0 >> td >> nth=5').innerText();
    if (emailed.trim() === '—') throw new Error('report not emailed');
  });
  await browser.close();
})();
