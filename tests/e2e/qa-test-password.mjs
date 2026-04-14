// E2E: выдача учётной записи и пароля сотруднику через UI «Персонал»
//
// Сценарий:
//   1. Админ логинится.
//   2. Через API создаёт тестового Employee (без User).
//   3. В UI открывает карточку сотрудника и нажимает «Создать» → вводит username.
//   4. Устанавливает пароль (два поля + кнопка «Установить пароль»).
//   5. Разлогинивается, логинится под новыми кредами — ожидаем успех.
//   6. Cleanup: удаляет созданного User и Employee через API.
//
// Требует: dev-local.sh запущен (backend:8000 + frontend:3000).

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000/api/v1';

const ts = Date.now();
const TEST_FULL_NAME = `E2E Тестовый Сотрудник ${ts}`;
const TEST_USERNAME = `e2e_test_${ts}`;
const TEST_PASSWORD = 'E2e_StrongPa55!';

async function apiLogin(username, password) {
  const r = await fetch(`${API_URL}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`API login failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data.access;
}

async function apiCall(token, path, opts = {}) {
  const r = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const body = r.status === 204 ? null : await r.text();
  return { status: r.status, body: body && body.length ? JSON.parse(body) : null };
}

async function uiLogin(page, username, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"], input[type="text"]', username);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|erp|objects|proposals)/, { timeout: 15000 });
}

async function main() {
  const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

  console.log(`\n=== E2E: выдача учётной записи и пароля (${TEST_USERNAME}) ===\n`);

  const adminToken = await apiLogin(ADMIN_USER, ADMIN_PASS);

  // 1. Создаём Employee через API
  const createEmp = await apiCall(adminToken, '/personnel/employees/', {
    method: 'POST',
    body: JSON.stringify({ full_name: TEST_FULL_NAME, is_active: true }),
  });
  if (createEmp.status !== 201) throw new Error(`Не удалось создать Employee: ${JSON.stringify(createEmp)}`);
  const employeeId = createEmp.body.id;
  console.log(`  [+] Employee создан (id=${employeeId})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const cleanup = async () => {
    try {
      await apiCall(adminToken, `/personnel/employees/${employeeId}/`, { method: 'DELETE' });
      console.log(`  [+] Cleanup: Employee ${employeeId} удалён`);
    } catch (e) {
      console.log(`  [!] Cleanup Employee: ${e.message}`);
    }
    // Пытаемся удалить User (потребует Django admin или /api/v1/users/ endpoint — оставляем через shell, если что)
  };

  try {
    // 2. UI: логинимся админом
    await uiLogin(page, ADMIN_USER, ADMIN_PASS);
    console.log('  [+] UI login admin OK');

    // 3. Переходим в персонал
    await page.goto(`${BASE_URL}/erp/personnel`);
    await page.waitForLoadState('networkidle');

    // Поиск по ФИО
    const searchInput = page.locator('input[placeholder*="Поиск"], input[type="search"]').first();
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill(TEST_FULL_NAME);
    await page.waitForTimeout(600);

    // Клик по строке
    await page.getByText(TEST_FULL_NAME).first().click();
    await page.waitForSelector('text=Учётная запись', { timeout: 10000 });
    console.log('  [+] Карточка сотрудника открыта');

    // 4. Кнопка «Создать» → диалог → username → Создать
    await page.getByRole('button', { name: /Создать/i }).first().click();
    await page.waitForSelector('text=Создать учётную запись', { timeout: 5000 });

    const usernameField = page.locator('#new_username');
    await usernameField.fill(TEST_USERNAME);
    await page.getByRole('button', { name: /^Создать$/ }).click();
    await page.waitForSelector('text=Пароль доступа', { timeout: 10000 });
    console.log(`  [+] User '${TEST_USERNAME}' создан и привязан`);

    // 5. Установка пароля
    await page.locator('#new_password').fill(TEST_PASSWORD);
    await page.locator('#new_password_confirm').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Установить пароль/i }).click();
    await page.waitForSelector('text=Пароль установлен', { timeout: 10000 });
    console.log('  [+] Пароль установлен');

    // 6. Разлогиниваемся и проверяем логин под новыми кредами
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    const userToken = await apiLogin(TEST_USERNAME, TEST_PASSWORD);
    if (!userToken) throw new Error('Не удалось получить токен под новыми кредами');
    console.log('  [+] Логин под новыми кредами: OK');

    console.log('\n=== PASS ===\n');
  } catch (e) {
    console.error('\n=== FAIL ===');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
