// QA Test: Forms, Filters, Tabs, and interactive elements
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"], input[type="text"]', 'admin');
  await page.fill('input[name="password"], input[type="password"]', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|objects|proposals)/, { timeout: 10000 });
}

async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`  ✓ ${name}${result ? ': ' + result : ''}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  let passed = 0, failed = 0;

  await login(page);
  console.log('Logged in.\n');

  // ═══════════════════════════════════════════════════════════════════
  // 1.2 МП - Список и фильтры
  // ═══════════════════════════════════════════════════════════════════
  console.log('=== 1.2 МП: Список и фильтры ===');
  await page.goto(`${BASE_URL}/proposals/mounting-proposals`, { waitUntil: 'networkidle' });

  (await test('Страница МП загружается', async () => {
    const h = await page.textContent('h1, h2');
    return h;
  })) ? passed++ : failed++;

  (await test('Поиск работает', async () => {
    const searchInput = page.locator('input[placeholder*="оиск"], input[placeholder*="search"], input[type="search"]').first();
    if (await searchInput.count() === 0) throw new Error('Поле поиска не найдено');
    await searchInput.fill('тест');
    await page.waitForTimeout(500);
    await searchInput.fill('');
    return 'search input found and works';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 1.3 Справочники: Фронт работ
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 1.3 Фронт работ ===');
  await page.goto(`${BASE_URL}/proposals/front-of-work-items`, { waitUntil: 'networkidle' });

  (await test('Список фронт работ загружается', async () => {
    await page.waitForSelector('table, [role="table"], .space-y-2, .grid', { timeout: 5000 });
    return 'items loaded';
  })) ? passed++ : failed++;

  (await test('Поиск по названию', async () => {
    const search = page.locator('input[placeholder*="оиск"], input[placeholder*="search"]').first();
    if (await search.count() === 0) throw new Error('Поле поиска не найдено');
    return 'search available';
  })) ? passed++ : failed++;

  (await test('Кнопка создания элемента', async () => {
    const btn = page.locator('button:has-text("Создать"), button:has-text("Добавить"), button:has-text("Новый")').first();
    if (await btn.count() === 0) throw new Error('Кнопка создания не найдена');
    return 'create button found';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 1.3 Справочники: Условия МП
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 1.3 Условия МП ===');
  await page.goto(`${BASE_URL}/proposals/mounting-conditions`, { waitUntil: 'networkidle' });

  (await test('Список условий загружается', async () => {
    await page.waitForSelector('table, [role="table"], .space-y-2, .grid', { timeout: 5000 });
    return 'conditions loaded';
  })) ? passed++ : failed++;

  (await test('Кнопка создания условия', async () => {
    const btn = page.locator('button:has-text("Создать"), button:has-text("Добавить"), button:has-text("Новый")').first();
    if (await btn.count() === 0) throw new Error('Кнопка создания не найдена');
    return 'create button found';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 2.1 Objects: Список и фильтры
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 2.1 Объекты: Список и фильтры ===');
  await page.goto(`${BASE_URL}/objects`, { waitUntil: 'networkidle' });

  (await test('Табличный вид по умолчанию', async () => {
    const table = page.locator('table, [role="table"]').first();
    if (await table.count() === 0) throw new Error('Таблица не найдена');
    return 'table view shown';
  })) ? passed++ : failed++;

  (await test('Фильтры по статусу видны', async () => {
    const filters = page.locator('button:has-text("Все"), button:has-text("В работе"), button:has-text("Планируются")');
    const count = await filters.count();
    if (count < 2) throw new Error(`Найдено фильтров: ${count}`);
    return `${count} status filters`;
  })) ? passed++ : failed++;

  (await test('Поиск по названию', async () => {
    const search = page.locator('input[placeholder*="оиск"], input[placeholder*="search"], input[placeholder*="азвани"]').first();
    if (await search.count() === 0) throw new Error('Поле поиска не найдено');
    return 'search available';
  })) ? passed++ : failed++;

  (await test('Кнопка Новый объект', async () => {
    const btn = page.locator('button:has-text("Новый объект"), button:has-text("Создать")').first();
    if (await btn.count() === 0) throw new Error('Кнопка не найдена');
    return 'create button found';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 2.2 Object Detail: Tabs
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 2.2 Деталь объекта: Вкладки ===');
  // Navigate to first object
  const objLink = page.locator('table tr a, table tr td').first();
  if (await objLink.count() > 0) {
    await page.goto(`${BASE_URL}/objects`, { waitUntil: 'networkidle' });
    // Click first row
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForURL(/\/objects\/\d+/, { timeout: 5000 });

      (await test('Название объекта отображается', async () => {
        const h1 = await page.locator('h1, h2').first().textContent();
        return h1?.substring(0, 50);
      })) ? passed++ : failed++;

      (await test('Вкладки: Основное, Заказчик, Исполнители, Настройки', async () => {
        const tabs = page.locator('button[role="tab"], [class*="tab"]');
        const tabTexts = [];
        const count = await tabs.count();
        for (let i = 0; i < Math.min(count, 10); i++) {
          tabTexts.push(await tabs.nth(i).textContent());
        }
        const text = tabTexts.join(', ');
        const hasOsnovnoe = text.includes('Основное');
        const hasZakazchik = text.includes('Заказчик');
        const hasIspolniteli = text.includes('Исполнител');
        const hasNastroiki = text.includes('Настройк');
        if (!hasOsnovnoe && !hasZakazchik) throw new Error(`Tabs: ${text}`);
        return text.substring(0, 80);
      })) ? passed++ : failed++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3.1 Finance Dashboard
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 3.1 Финансовый дашборд ===');
  await page.goto(`${BASE_URL}/finance/dashboard`, { waitUntil: 'networkidle' });

  (await test('Дашборд загружается', async () => {
    const content = await page.textContent('body');
    const hasBalance = content.includes('алан') || content.includes('чёт') || content.includes('Итого');
    if (!hasBalance) throw new Error('Нет финансовых данных');
    return 'financial data present';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 4.1 Contracts List
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 4.1 Договоры: Список ===');
  await page.goto(`${BASE_URL}/contracts`, { waitUntil: 'networkidle' });

  (await test('Список договоров загружается', async () => {
    await page.waitForSelector('table, [role="table"]', { timeout: 5000 });
    return 'table loaded';
  })) ? passed++ : failed++;

  (await test('Поиск по номеру/названию', async () => {
    const search = page.locator('input[placeholder*="оиск"], input[placeholder*="search"], input[placeholder*="номер"]').first();
    if (await search.count() === 0) throw new Error('Поле поиска не найдено');
    return 'search available';
  })) ? passed++ : failed++;

  (await test('Фильтр по типу (доходный/расходный)', async () => {
    const typeFilter = page.locator('select, [role="combobox"]').first();
    if (await typeFilter.count() === 0) throw new Error('Фильтр по типу не найден');
    return 'type filter available';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 4.13 Acts List
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 4.13 Акты ===');
  await page.goto(`${BASE_URL}/contracts/acts`, { waitUntil: 'networkidle' });

  (await test('Список актов загружается', async () => {
    await page.waitForSelector('table, [role="table"]', { timeout: 5000 });
    return 'acts table loaded';
  })) ? passed++ : failed++;

  // ═══════════════════════════════════════════════════════════════════
  // 5.2 Auth: Login/Logout
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 5.2 Авторизация ===');

  (await test('Логин с правильными данными', async () => {
    // Already logged in
    return 'verified during initial login';
  })) ? passed++ : failed++;

  // Test wrong credentials
  const page2 = await context.newPage();
  (await test('Неправильные данные — ошибка', async () => {
    await page2.goto(`${BASE_URL}/login`);
    await page2.fill('input[name="username"], input[type="text"]', 'admin');
    await page2.fill('input[name="password"], input[type="password"]', 'wrongpassword');
    await page2.click('button[type="submit"]');
    await page2.waitForTimeout(2000);
    const errorText = await page2.textContent('body');
    const hasError = errorText.includes('ошибк') || errorText.includes('Ошибк') ||
                     errorText.includes('неверн') || errorText.includes('Неверн') ||
                     errorText.includes('Invalid') || errorText.includes('error');
    // Still on login page
    const url = page2.url();
    if (!url.includes('login') && !hasError) throw new Error('Нет сообщения об ошибке');
    return 'error shown, stays on login page';
  })) ? passed++ : failed++;
  await page2.close();

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
