// QA Playwright Test Script — массовая проверка страниц
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000/api/v1';

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"], input[type="text"]', 'admin');
  await page.fill('input[name="password"], input[type="password"]', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|objects|proposals)/, { timeout: 10000 });
}

async function checkPage(page, path, name) {
  const errors = [];
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = response?.status() || 0;

    // Check for error states in the page
    const pageContent = await page.textContent('body');
    const hasError = pageContent.includes('Ошибка') && pageContent.includes('500');
    const hasCrash = pageContent.includes('Something went wrong') || pageContent.includes('Application error');

    if (status >= 400) errors.push(`HTTP ${status}`);
    if (hasCrash) errors.push('App crash detected');

    const result = errors.length === 0 ? 'OK' : `FAIL: ${errors.join(', ')}`;
    const consoleNote = consoleErrors.length > 0 ? ` [${consoleErrors.length} console errors]` : '';
    console.log(`  ${result} ${name} (${path})${consoleNote}`);

    return { path, name, ok: errors.length === 0, errors, consoleErrors };
  } catch (e) {
    console.log(`  FAIL ${name} (${path}): ${e.message.split('\n')[0]}`);
    return { path, name, ok: false, errors: [e.message.split('\n')[0]], consoleErrors };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('=== Logging in... ===');
  await login(page);
  console.log('  Logged in successfully\n');

  // Get IDs from API for detail pages
  const token = await page.evaluate(() => localStorage.getItem('access_token') || '');

  const results = [];

  // ─── Section 1: Commercial Proposals ─────────────────────────────
  console.log('=== 1. КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ ===');
  results.push(await checkPage(page, '/proposals/technical-proposals', '1.1 Список ТКП'));
  results.push(await checkPage(page, '/proposals/mounting-proposals', '1.2 Список МП'));
  results.push(await checkPage(page, '/proposals/front-of-work-items', '1.3 Фронт работ'));
  results.push(await checkPage(page, '/proposals/mounting-conditions', '1.3 Условия МП'));
  results.push(await checkPage(page, '/commercial/kanban', '1.4 Kanban КП'));
  results.push(await checkPage(page, '/marketing/objects', '1.4 Маркетинг'));

  // ─── Section 2: Objects ──────────────────────────────────────────
  console.log('\n=== 2. ОБЪЕКТЫ ===');
  results.push(await checkPage(page, '/objects', '2.1 Список объектов'));

  // ─── Section 3: Finance ──────────────────────────────────────────
  console.log('\n=== 3. ФИНАНСЫ ===');
  results.push(await checkPage(page, '/finance/dashboard', '3.1 Дашборд'));
  results.push(await checkPage(page, '/finance/payments', '3.2-3.4 Платежи (tabs)'));
  results.push(await checkPage(page, '/supply/invoices', '3.2 Счета'));
  results.push(await checkPage(page, '/bank-payment-orders', '3.5 Платёжные поручения'));
  results.push(await checkPage(page, '/bank-statements', '3.6 Банковские выписки'));
  results.push(await checkPage(page, '/supply/recurring', '3.8 Периодические'));
  results.push(await checkPage(page, '/supply/income', '3.9 Доходы'));
  results.push(await checkPage(page, '/supply/requests', '3.10 Запросы'));
  results.push(await checkPage(page, '/settings/bitrix', '3.11 Битрикс'));

  // ─── Section 4: Contracts ────────────────────────────────────────
  console.log('\n=== 4. ДОГОВОРА ===');
  results.push(await checkPage(page, '/contracts', '4.1 Список договоров'));
  results.push(await checkPage(page, '/contracts/framework-contracts', '4.2 Рамочные'));
  results.push(await checkPage(page, '/contracts/framework-contracts/create', '4.2 Создание рамочного'));
  results.push(await checkPage(page, '/contracts/acts', '4.13 Акты'));
  results.push(await checkPage(page, '/estimates/estimates', '4.5 Сметы'));
  results.push(await checkPage(page, '/contracts/instructions', '5.4 Инструкции'));

  // ─── Section 5: General ──────────────────────────────────────────
  console.log('\n=== 5. ОБЩИЕ ===');
  results.push(await checkPage(page, '/dashboard', '5.1 Дашборд'));
  results.push(await checkPage(page, '/counterparties', '5.3 Контрагенты'));
  results.push(await checkPage(page, '/settings', '5.3 Настройки'));
  results.push(await checkPage(page, '/help', '5.4 Помощь'));

  // Now test detail pages
  console.log('\n=== DETAIL PAGES ===');

  // Get first IDs
  const apiHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Get first object
  let objId = null;
  try {
    const objResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/objects/`);
    objId = objResp?.results?.[0]?.id;
  } catch(e) {}

  if (objId) {
    results.push(await checkPage(page, `/objects/${objId}`, '2.2 Деталь объекта'));
  }

  // Get first TKP
  let tkpId = null;
  try {
    const tkpResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/technical-proposals/`);
    tkpId = tkpResp?.results?.[0]?.id;
  } catch(e) {}

  if (tkpId) {
    results.push(await checkPage(page, `/proposals/technical-proposals/${tkpId}`, '1.1 Деталь ТКП'));
  }

  // Get first MP
  let mpId = null;
  try {
    const mpResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/mounting-proposals/`);
    mpId = mpResp?.results?.[0]?.id;
  } catch(e) {}

  if (mpId) {
    results.push(await checkPage(page, `/proposals/mounting-proposals/${mpId}`, '1.2 Деталь МП'));
  }

  // Get first contract
  let contractId = null;
  try {
    const cResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/contracts/`);
    contractId = cResp?.results?.[0]?.id;
  } catch(e) {}

  if (contractId) {
    results.push(await checkPage(page, `/contracts/${contractId}`, '4.1 Деталь договора'));
  }

  // Get first invoice
  let invoiceId = null;
  try {
    const iResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/invoices/`);
    invoiceId = iResp?.results?.[0]?.id;
  } catch(e) {}

  if (invoiceId) {
    results.push(await checkPage(page, `/supply/invoices/${invoiceId}`, '3.2 Деталь счёта'));
  }

  // Get first estimate
  let estimateId = null;
  try {
    const eResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/estimates/`);
    estimateId = eResp?.results?.[0]?.id;
  } catch(e) {}

  if (estimateId) {
    results.push(await checkPage(page, `/estimates/estimates/${estimateId}`, '4.5 Деталь сметы'));
  }

  // Get first act
  let actId = null;
  try {
    const aResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }});
      return r.json();
    }, `${API_URL}/acts/`);
    actId = aResp?.results?.[0]?.id;
  } catch(e) {}

  if (actId) {
    results.push(await checkPage(page, `/contracts/acts/${actId}`, '4.13 Деталь акта'));
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`  Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n  FAILED PAGES:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`    ${r.name} (${r.path}): ${r.errors.join(', ')}`);
    });
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
