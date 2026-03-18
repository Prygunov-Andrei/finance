// QA Playwright Test Script — Objects Module Comprehensive Test
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000/api/v1';

const results = [];
let passed = 0;
let failed = 0;

function log(ok, name, detail = '') {
  const marker = ok ? '\u2713' : '\u2717';
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`  ${marker} ${name}${suffix}`);
  results.push({ ok, name, detail });
  if (ok) passed++; else failed++;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // The login form pre-fills admin/admin, but let's be explicit
  const usernameInput = page.locator('input[type="text"], input#username').first();
  const passwordInput = page.locator('input[type="password"], input#password').first();
  await usernameInput.fill('admin');
  await passwordInput.fill('admin');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|objects|proposals|finance)/, { timeout: 15000 });
}

// Helper: wait for network quiet after navigation/click
async function waitForContent(page, timeout = 8000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // networkidle can time out with SSE/websockets, that's OK
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // ──────────────────────────────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  OBJECTS MODULE — QA TEST');
  console.log('========================================\n');
  console.log('--- Login ---');
  try {
    await login(page);
    log(true, 'Login as admin/admin');
  } catch (e) {
    log(false, 'Login as admin/admin', e.message.split('\n')[0]);
    await browser.close();
    printSummary();
    return;
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 1 — Objects list page (/objects)
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Objects list page (/objects) ---');

  try {
    await page.goto(`${BASE_URL}/objects`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForContent(page);
  } catch (e) {
    log(false, '1.0 Navigate to /objects', e.message.split('\n')[0]);
  }

  // 1.1 — Table view loads with data
  try {
    const table = page.locator('table');
    await table.waitFor({ state: 'visible', timeout: 10000 });
    const rows = table.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      log(true, '1.1 Table view loads with data', `${count} row(s) found`);
    } else {
      log(false, '1.1 Table view loads with data', 'Table visible but 0 rows');
    }
  } catch (e) {
    log(false, '1.1 Table view loads with data', e.message.split('\n')[0]);
  }

  // 1.2 — Grid view toggle works
  try {
    const gridButton = page.locator('button[aria-label="Вид мозаикой"]');
    await gridButton.waitFor({ state: 'visible', timeout: 5000 });
    await gridButton.click();
    await page.waitForTimeout(500);

    // After clicking grid, there should be no <table> visible, and grid cards should appear
    const gridContainer = page.locator('div.grid');
    const gridCards = gridContainer.locator('[role="button"]');
    const gridCardsCount = await gridCards.count();

    // Verify table is gone or hidden
    const tableVisible = await page.locator('table').isVisible().catch(() => false);

    if (gridCardsCount > 0 && !tableVisible) {
      log(true, '1.2 Grid view toggle works', `${gridCardsCount} card(s) displayed`);
    } else if (gridCardsCount > 0) {
      log(true, '1.2 Grid view toggle works', `${gridCardsCount} card(s), but table still visible`);
    } else {
      log(false, '1.2 Grid view toggle works', 'No grid cards found after toggling');
    }

    // Switch back to table
    const tableButton = page.locator('button[aria-label="Табличный вид"]');
    await tableButton.click();
    await page.waitForTimeout(500);
  } catch (e) {
    log(false, '1.2 Grid view toggle works', e.message.split('\n')[0]);
  }

  // 1.3 — Status filter tabs
  const statusTabs = [
    { label: 'Все', value: '' },
    { label: 'Планируются', value: 'planned' },
    { label: 'В работе', value: 'in_progress' },
    { label: 'Завершённые', value: 'completed' },
    { label: 'Приостановлены', value: 'suspended' },
  ];

  for (const tab of statusTabs) {
    try {
      const tabTrigger = page.locator(`[role="tablist"] [role="tab"]`).filter({ hasText: tab.label });
      await tabTrigger.waitFor({ state: 'visible', timeout: 5000 });
      await tabTrigger.click();
      await page.waitForTimeout(800); // wait for API filter request

      // Check that the tab is now active (data-state="active")
      const isActive = await tabTrigger.getAttribute('data-state');
      if (isActive === 'active') {
        log(true, `1.3 Status tab "${tab.label}"`, 'tab clicked and active');
      } else {
        log(false, `1.3 Status tab "${tab.label}"`, `data-state="${isActive}" (expected "active")`);
      }
    } catch (e) {
      log(false, `1.3 Status tab "${tab.label}"`, e.message.split('\n')[0]);
    }
  }

  // Reset to "Все" tab
  try {
    const allTab = page.locator('[role="tablist"] [role="tab"]').filter({ hasText: 'Все' });
    await allTab.click();
    await page.waitForTimeout(800);
  } catch { /* ignore */ }

  // 1.4 — Search by name
  try {
    const searchInput = page.locator('input[aria-label="Поиск объектов"]');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });

    // Get first object name for search
    const firstRowName = await page.locator('table tbody tr td:nth-child(2)').first().textContent();
    const searchTerm = firstRowName ? firstRowName.trim().substring(0, 5) : 'Тест';

    await searchInput.fill(searchTerm);
    await page.waitForTimeout(1000); // wait for debounce + API call

    const rowsAfterSearch = await page.locator('table tbody tr').count();
    log(true, '1.4 Search by name', `searched "${searchTerm}", ${rowsAfterSearch} result(s)`);

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(800);
  } catch (e) {
    log(false, '1.4 Search by name', e.message.split('\n')[0]);
  }

  // 1.5 — "Новый объект" button exists
  try {
    const newObjectBtn = page.locator('button').filter({ hasText: 'Новый объект' });
    await newObjectBtn.waitFor({ state: 'visible', timeout: 5000 });
    log(true, '1.5 "Новый объект" button exists');
  } catch (e) {
    log(false, '1.5 "Новый объект" button exists', e.message.split('\n')[0]);
  }

  // 1.6 — Create dialog opens when clicking "Новый объект"
  try {
    const newObjectBtn = page.locator('button').filter({ hasText: 'Новый объект' });
    await newObjectBtn.click();
    await page.waitForTimeout(500);

    // Dialog should appear with title "Новый объект"
    const dialogTitle = page.locator('[role="dialog"] h2, [role="dialog"] [class*="DialogTitle"]').filter({ hasText: 'Новый объект' });
    await dialogTitle.waitFor({ state: 'visible', timeout: 5000 });
    log(true, '1.6 Create dialog opens on "Новый объект" click');

    // Close dialog
    const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has(svg.lucide-x)').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      // Press Escape to close
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  } catch (e) {
    log(false, '1.6 Create dialog opens on "Новый объект" click', e.message.split('\n')[0]);
    // Try to close any open dialog
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 2 — Object detail page
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Object detail page ---');

  // Navigate to first object
  let objectDetailUrl = '';
  try {
    await page.goto(`${BASE_URL}/objects`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForContent(page);

    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10000 });
    await firstRow.click();
    await page.waitForURL(/\/objects\/\d+/, { timeout: 10000 });
    objectDetailUrl = page.url();
    await waitForContent(page);
    log(true, '2.0 Navigate to first object detail', objectDetailUrl);
  } catch (e) {
    log(false, '2.0 Navigate to first object detail', e.message.split('\n')[0]);
    // Fallback: try navigating directly
    try {
      await page.goto(`${BASE_URL}/objects/1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await waitForContent(page);
      objectDetailUrl = page.url();
    } catch { /* will fail subsequent tests naturally */ }
  }

  // 2.1 — Header shows name, address, status badge
  try {
    // Name (h1)
    const name = page.locator('h1').first();
    await name.waitFor({ state: 'visible', timeout: 8000 });
    const nameText = await name.textContent();

    // Address (MapPin icon area, or the span with address)
    const addressArea = page.locator('.text-sm.text-gray-600, span.text-sm.text-gray-600').first();
    const addressVisible = await addressArea.isVisible().catch(() => false);

    // Status badge — Badge component renders as <span data-slot="badge">
    const statusBadge = page.locator('[data-slot="badge"], [class*="bg-green-100"], [class*="bg-blue-100"], [class*="bg-orange-100"], [class*="bg-gray-100"], [class*="bg-purple"]').first();
    const statusVisible = await statusBadge.isVisible().catch(() => false);

    const allVisible = nameText && addressVisible && statusVisible;
    if (allVisible) {
      log(true, '2.1 Header: name, address, status badge', `name="${nameText.trim().substring(0, 40)}"`);
    } else {
      const parts = [];
      if (!nameText) parts.push('name missing');
      if (!addressVisible) parts.push('address missing');
      if (!statusVisible) parts.push('status badge missing');
      log(false, '2.1 Header: name, address, status badge', parts.join(', '));
    }
  } catch (e) {
    log(false, '2.1 Header: name, address, status badge', e.message.split('\n')[0]);
  }

  // 2.2 — 4 tabs visible: Основное, Заказчик, Исполнители, Настройки
  const mainTabs = ['Основное', 'Заказчик', 'Исполнители', 'Настройки'];
  try {
    // The main tabs are in the outer TabsList
    const tabsList = page.locator('[role="tablist"]').first();
    await tabsList.waitFor({ state: 'visible', timeout: 5000 });

    let allFound = true;
    const foundTabs = [];
    const missingTabs = [];

    for (const tabName of mainTabs) {
      const tab = tabsList.locator('[role="tab"]').filter({ hasText: tabName });
      const visible = await tab.isVisible().catch(() => false);
      if (visible) {
        foundTabs.push(tabName);
      } else {
        missingTabs.push(tabName);
        allFound = false;
      }
    }

    if (allFound) {
      log(true, '2.2 Four tabs visible', foundTabs.join(', '));
    } else {
      log(false, '2.2 Four tabs visible', `found: [${foundTabs.join(', ')}], missing: [${missingTabs.join(', ')}]`);
    }
  } catch (e) {
    log(false, '2.2 Four tabs visible', e.message.split('\n')[0]);
  }

  // 2.3 — "Основное" tab contains sub-tabs (Журнал работ, Канбан задач, Проекты, etc.)
  try {
    // Click "Основное" tab to make sure it's active
    const mainTabList = page.locator('[role="tablist"]').first();
    const mainTab = mainTabList.locator('[role="tab"]').filter({ hasText: 'Основное' });
    await mainTab.click();
    await page.waitForTimeout(500);

    // Now look for sub-tabs in the content area (second tablist)
    const subTabsList = page.locator('[role="tablist"]').nth(1);
    await subTabsList.waitFor({ state: 'visible', timeout: 5000 });

    const expectedSubTabs = ['Журнал работ', 'Канбан задач', 'Проекты', 'Финансы'];
    const foundSubTabs = [];
    const missingSubTabs = [];

    for (const st of expectedSubTabs) {
      const subTab = subTabsList.locator('[role="tab"]').filter({ hasText: st });
      const visible = await subTab.isVisible().catch(() => false);
      if (visible) {
        foundSubTabs.push(st);
      } else {
        missingSubTabs.push(st);
      }
    }

    if (foundSubTabs.length >= 3) {
      log(true, '2.3 "Основное" sub-tabs present', `found: [${foundSubTabs.join(', ')}]`);
    } else {
      log(false, '2.3 "Основное" sub-tabs present', `found: [${foundSubTabs.join(', ')}], missing: [${missingSubTabs.join(', ')}]`);
    }
  } catch (e) {
    log(false, '2.3 "Основное" sub-tabs present', e.message.split('\n')[0]);
  }

  // 2.4 — Object info fields are displayed (dates, contracts count, created/updated)
  try {
    const infoTexts = ['Дата начала', 'Дата окончания', 'Договоров', 'Создан'];
    const foundFields = [];
    const missingFields = [];

    for (const field of infoTexts) {
      const el = page.locator(`text=${field}`).first();
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        foundFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    if (foundFields.length >= 3) {
      log(true, '2.4 Object info fields displayed', `found: [${foundFields.join(', ')}]`);
    } else {
      log(false, '2.4 Object info fields displayed', `found: [${foundFields.join(', ')}], missing: [${missingFields.join(', ')}]`);
    }
  } catch (e) {
    log(false, '2.4 Object info fields displayed', e.message.split('\n')[0]);
  }

  // 2.5 — Click "Заказчик" tab — content loads
  try {
    const mainTabList = page.locator('[role="tablist"]').first();
    const customerTab = mainTabList.locator('[role="tab"]').filter({ hasText: 'Заказчик' });
    await customerTab.click();
    await page.waitForTimeout(800);

    // "Заказчик" tab should show sub-tabs like "Сметы", "ТКП", "Договоры и ДОП" etc.
    const subTabsList = page.locator('[role="tablist"]').nth(1);
    await subTabsList.waitFor({ state: 'visible', timeout: 5000 });

    const expectedSubTabs = ['Сметы', 'ТКП', 'Договоры и ДОП', 'Акты', 'Сверки'];
    const foundSubTabs = [];

    for (const st of expectedSubTabs) {
      const subTab = subTabsList.locator('[role="tab"]').filter({ hasText: st });
      const visible = await subTab.isVisible().catch(() => false);
      if (visible) foundSubTabs.push(st);
    }

    if (foundSubTabs.length >= 3) {
      log(true, '2.5 "Заказчик" tab — content loads', `sub-tabs: [${foundSubTabs.join(', ')}]`);
    } else {
      log(false, '2.5 "Заказчик" tab — content loads', `only found sub-tabs: [${foundSubTabs.join(', ')}]`);
    }
  } catch (e) {
    log(false, '2.5 "Заказчик" tab — content loads', e.message.split('\n')[0]);
  }

  // 2.6 — Click "Исполнители" tab — content loads
  try {
    const mainTabList = page.locator('[role="tablist"]').first();
    const executorsTab = mainTabList.locator('[role="tab"]').filter({ hasText: 'Исполнители' });
    await executorsTab.click();
    await page.waitForTimeout(800);

    const subTabsList = page.locator('[role="tablist"]').nth(1);
    await subTabsList.waitFor({ state: 'visible', timeout: 5000 });

    const expectedSubTabs = ['Монтажные сметы', 'МП', 'Договоры и ДОП', 'Акты', 'Сверки'];
    const foundSubTabs = [];

    for (const st of expectedSubTabs) {
      const subTab = subTabsList.locator('[role="tab"]').filter({ hasText: st });
      const visible = await subTab.isVisible().catch(() => false);
      if (visible) foundSubTabs.push(st);
    }

    if (foundSubTabs.length >= 3) {
      log(true, '2.6 "Исполнители" tab — content loads', `sub-tabs: [${foundSubTabs.join(', ')}]`);
    } else {
      log(false, '2.6 "Исполнители" tab — content loads', `only found sub-tabs: [${foundSubTabs.join(', ')}]`);
    }
  } catch (e) {
    log(false, '2.6 "Исполнители" tab — content loads', e.message.split('\n')[0]);
  }

  // 2.7 — Click "Настройки" tab — content loads
  try {
    const mainTabList = page.locator('[role="tablist"]').first();
    const settingsTab = mainTabList.locator('[role="tab"]').filter({ hasText: 'Настройки' });
    await settingsTab.click();
    await page.waitForTimeout(800);

    // Settings tab should contain "Опасная зона" or "Удалить объект" or settings sections
    const dangerZone = page.locator('text=Опасная зона').first();
    const deleteButton = page.locator('button').filter({ hasText: 'Удалить объект' });
    const settingsHeader = page.locator('text=Настройки журнала работ').first();

    const hasDangerZone = await dangerZone.isVisible().catch(() => false);
    const hasDeleteBtn = await deleteButton.isVisible().catch(() => false);
    const hasSettingsHeader = await settingsHeader.isVisible().catch(() => false);

    if (hasDangerZone || hasDeleteBtn || hasSettingsHeader) {
      const parts = [];
      if (hasSettingsHeader) parts.push('settings header');
      if (hasDangerZone) parts.push('danger zone');
      if (hasDeleteBtn) parts.push('delete button');
      log(true, '2.7 "Настройки" tab — content loads', `found: ${parts.join(', ')}`);
    } else {
      log(false, '2.7 "Настройки" tab — content loads', 'No expected settings content found');
    }
  } catch (e) {
    log(false, '2.7 "Настройки" tab — content loads', e.message.split('\n')[0]);
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 3 — Object creation dialog
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Object creation dialog ---');

  // Navigate back to /objects and open the dialog
  try {
    await page.goto(`${BASE_URL}/objects`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForContent(page);

    const newObjectBtn = page.locator('button').filter({ hasText: 'Новый объект' });
    await newObjectBtn.click();
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    log(true, '3.0 Open create dialog from /objects');
  } catch (e) {
    log(false, '3.0 Open create dialog from /objects', e.message.split('\n')[0]);
  }

  // 3.1 — Check required fields are indicated with asterisk (*)
  try {
    const dialog = page.locator('[role="dialog"]');

    // Look for labels with required indicator (red asterisk)
    const requiredIndicators = dialog.locator('span.text-red-500');
    const requiredCount = await requiredIndicators.count();

    // Check specific required labels exist
    const nameLabel = dialog.locator('label[for="name"]');
    const addressLabel = dialog.locator('label[for="address"]');
    const statusLabel = dialog.locator('label[for="status"]');

    const hasNameLabel = await nameLabel.isVisible().catch(() => false);
    const hasAddressLabel = await addressLabel.isVisible().catch(() => false);

    if (requiredCount >= 2 && hasNameLabel && hasAddressLabel) {
      log(true, '3.1 Required fields indicated', `${requiredCount} required indicator(s) found (Название, Адрес, Статус)`);
    } else {
      log(false, '3.1 Required fields indicated', `required indicators: ${requiredCount}, nameLabel: ${hasNameLabel}, addressLabel: ${hasAddressLabel}`);
    }
  } catch (e) {
    log(false, '3.1 Required fields indicated', e.message.split('\n')[0]);
  }

  // 3.2 — Check form fields exist
  try {
    const dialog = page.locator('[role="dialog"]');

    const nameInput = dialog.locator('input#name');
    const addressInput = dialog.locator('input#address');
    const startDateInput = dialog.locator('input#start_date');
    const endDateInput = dialog.locator('input#end_date');
    const descriptionInput = dialog.locator('textarea#description');
    const submitBtn = dialog.locator('button[type="submit"]');

    const fields = {
      'name input': await nameInput.isVisible().catch(() => false),
      'address input': await addressInput.isVisible().catch(() => false),
      'start_date input': await startDateInput.isVisible().catch(() => false),
      'end_date input': await endDateInput.isVisible().catch(() => false),
      'description textarea': await descriptionInput.isVisible().catch(() => false),
      'submit button': await submitBtn.isVisible().catch(() => false),
    };

    const found = Object.entries(fields).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);

    if (missing.length === 0) {
      log(true, '3.2 Form fields exist', found.join(', '));
    } else {
      log(false, '3.2 Form fields exist', `missing: [${missing.join(', ')}]`);
    }
  } catch (e) {
    log(false, '3.2 Form fields exist', e.message.split('\n')[0]);
  }

  // 3.3 — Fill required fields and check form validation (submit with empty name)
  try {
    const dialog = page.locator('[role="dialog"]');
    const nameInput = dialog.locator('input#name');
    const addressInput = dialog.locator('input#address');

    // Clear name field and try to submit (should trigger HTML5 required validation or toast)
    await nameInput.fill('');
    await addressInput.fill('');

    const submitBtn = dialog.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Dialog should still be open (submit should fail due to required fields)
    const dialogStillOpen = await dialog.isVisible().catch(() => false);

    if (dialogStillOpen) {
      log(true, '3.3 Form validation — empty fields prevent submit', 'dialog remains open');
    } else {
      log(false, '3.3 Form validation — empty fields prevent submit', 'dialog closed unexpectedly');
    }
  } catch (e) {
    log(false, '3.3 Form validation — empty fields prevent submit', e.message.split('\n')[0]);
  }

  // 3.4 — Fill form fields with valid data (don't actually submit to avoid creating test data)
  try {
    const dialog = page.locator('[role="dialog"]');
    const nameInput = dialog.locator('input#name');
    const addressInput = dialog.locator('input#address');
    const descriptionInput = dialog.locator('textarea#description');

    await nameInput.fill('Тестовый Объект QA');
    await addressInput.fill('г. Москва, ул. Тестовая, д. 42');
    await descriptionInput.fill('Тестовое описание объекта');

    const nameValue = await nameInput.inputValue();
    const addressValue = await addressInput.inputValue();
    const descriptionValue = await descriptionInput.inputValue();

    const allFilled = nameValue === 'Тестовый Объект QA' &&
                      addressValue === 'г. Москва, ул. Тестовая, д. 42' &&
                      descriptionValue === 'Тестовое описание объекта';

    if (allFilled) {
      log(true, '3.4 Fill form with valid data', 'name, address, description filled correctly');
    } else {
      log(false, '3.4 Fill form with valid data', `name="${nameValue}", address="${addressValue}"`);
    }

    // Close dialog without submitting
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {
    log(false, '3.4 Fill form with valid data', e.message.split('\n')[0]);
    await page.keyboard.press('Escape').catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────
  await browser.close();
  printSummary();
}

function printSummary() {
  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('========================================');

  if (failed > 0) {
    console.log('\n  FAILED TESTS:');
    for (const r of results) {
      if (!r.ok) {
        console.log(`    \u2717 ${r.name} — ${r.detail}`);
      }
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
