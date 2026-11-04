const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const shots = process.env.SHOTS_DIR ?? '/tmp/outbound-smoke-shots';
require('fs').mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: `${shots}/fail-${name}.png`, fullPage: true }); } };
  const waitFor = async (text, ms = 60000) => page.waitForSelector(`text=${text}`, { timeout: ms });
  const simulate = async (text) => {
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await page.waitForSelector('textarea[name=text]');
    await page.fill('textarea[name=text]', text);
    await page.click('text=Inject reply');
    await waitFor('Reply injected');
  };

  await step('login', async () => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', 'owner@acme-demo.example.com');
    await page.fill('input[name=password]', 'Demo12345!');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
  });
  await step('reply-settings', async () => {
    await page.goto(`${BASE}/app/settings/replies`);
    await page.fill('input[name=senderName]', 'Dana Owner');
    await page.fill('textarea[name=signature]', 'Dana Owner · Head of Growth, Acme Demo');
    await page.fill('input[name=bookingLink]', 'https://cal.example.com/dana');
    await page.click('text=Save settings');
    await waitFor('Settings saved');
    await page.click('text=Use a demo calendar');
    await waitFor('demo-calendar@example.com');
    await page.screenshot({ path: `${shots}/reply-settings.png`, fullPage: true });
  });
  await step('kb-note', async () => {
    await page.goto(`${BASE}/app/knowledge`);
    await page.fill('input[name=name]', 'Northwind case study');
    await page.fill('textarea[name=text]', 'Northwind Logistics cut fleet mileage by 14% in 60 days after rolling out route optimisation across 180 drivers. Missed delivery windows fell from 9% to 3%. The rollout took three weeks and needed no new hardware.');
    await page.click('text=Add note');
    await waitFor('Northwind case study added');
    await page.waitForSelector('tr:has-text("Northwind case study") >> text=ready', { timeout: 30000 });
  });
  await step('kb-file', async () => {
    const fs = require('fs'); const p = `${shots}/pricing.md`;
    fs.writeFileSync(p, '# Pricing overview\n\nPlans start at a per-vehicle monthly fee with a 30-day pilot. Volume tiers apply above 200 vehicles. Onboarding is included.\n\n## Support\n\nAll plans include email support with a next-business-day response.');
    await page.setInputFiles('input[type=file]', p);
    await page.click('button:has-text("Upload")');
    await waitFor('uploaded, processing');
    await page.waitForSelector('tr:has-text("pricing.md") >> text=ready', { timeout: 30000 });
    await page.screenshot({ path: `${shots}/knowledge.png`, fullPage: true });
  });
  await step('simulate-interested', async () => {
    await simulate('This is interesting, tell me more. Could you do a call next week?');
  });
  await step('draft-pending', async () => {
    await page.goto(`${BASE}/app/inbox`);
    await page.waitForSelector('text=awaiting approval', { timeout: 30000 });
    await page.click('tbody tr >> nth=0 >> a');
    await page.waitForSelector('text=Suggested reply', { timeout: 30000 });
    await page.waitForSelector('text=Knowledge base sources used');
    await page.screenshot({ path: `${shots}/thread-draft.png`, fullPage: true });
  });
  await step('approve-and-book', async () => {
    await page.selectOption('select[name=slot]', { index: 1 });
    await page.click('text=Approve and send');
    await page.waitForSelector('li:has-text("You")', { timeout: 60000 });
    await page.waitForSelector('h2:has-text("Meetings")', { timeout: 15000 });
    await page.waitForSelector('text=mock · by human');
    await page.screenshot({ path: `${shots}/thread-sent.png`, fullPage: true });
  });
  await step('enable-autonomous', async () => {
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await page.click('text=Enable autonomous mode');
    await waitFor('Switch to approval mode');
  });
  await step('autonomous-send', async () => {
    // pick a different lead (second option) so a fresh thread is created
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await page.selectOption('select[name=leadId]', { index: 1 });
    await page.fill('textarea[name=text]', 'Sounds good, happy to book a demo. Tell me more.');
    await page.click('text=Inject reply');
    await waitFor('Reply injected');
    await page.goto(`${BASE}/app/inbox?filter=replied`);
    await page.waitForSelector('tbody tr', { timeout: 30000 });
    await page.click('tbody tr >> nth=0 >> a');
    await page.waitForSelector('text=Claude (auto)', { timeout: 30000 });
    await page.screenshot({ path: `${shots}/thread-auto.png`, fullPage: true });
  });
  await step('autonomous-escalates-pricing', async () => {
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await page.selectOption('select[name=leadId]', { index: 2 });
    await page.fill('textarea[name=text]', 'What is the pricing and can you offer a discount on a 3-year contract?');
    await page.click('text=Inject reply');
    await waitFor('Reply injected');
    await page.goto(`${BASE}/app/inbox`);
    await page.waitForSelector('text=escalated', { timeout: 30000 });
    await page.click('tbody tr:has-text("escalated") >> a');
    await waitFor('Escalated: needs a human');
    await waitFor('Pricing or discount mentioned');
  });
  await step('autonomous-unsubscribe', async () => {
    await page.goto(`${BASE}/app/campaigns`);
    await page.click('text=Q4 sales leaders');
    await page.selectOption('select[name=leadId]', { index: 3 });
    await page.fill('textarea[name=text]', 'Please unsubscribe me and remove me from your list.');
    await page.click('text=Inject reply');
    await waitFor('Reply injected');
    await page.goto(`${BASE}/app/inbox?filter=all`);
    await page.waitForSelector('tbody tr:has-text("unsubscribed")', { timeout: 30000 });
    await page.goto(`${BASE}/app/leads?status=unsubscribed`);
    await page.waitForSelector('tbody tr', { timeout: 15000 });
  });
  await step('dashboard-counts', async () => {
    await page.goto(`${BASE}/app`);
    await waitFor('Meetings booked');
    await waitFor('Replies to approve');
    await page.screenshot({ path: `${shots}/dashboard-phase2.png` });
  });
  await step('webhook-auth', async () => {
    const r = await page.request.post(`${BASE}/api/webhooks/instantly`, { data: { event_type: 'reply_received', lead_email: 'x@y.com' } });
    if (r.status() !== 403) throw new Error('expected 403, got ' + r.status());
  });
  await browser.close();
})();
