import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/${test.info().project.name}-${name}.png` });

async function serious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`);
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('entrance paints without WebGL and passes axe', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('enter')).toBeVisible();
  await expect(page.getByText('Zakariye Digital Universe', { exact: true }).first()).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0); // the 3D chunk loads only after ENTER
  await expect(page.getByRole('note')).toContainText(/HORDHACA|PREVIEW/);
  expect(await serious(page)).toEqual([]);
  await shot(page, '01-entrance');
});

test('full journey through all ten scenes', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text()));
  await page.goto('/?quality=balanced');
  await page.getByTestId('enter').click();

  // Scene 02 — real-time Awakening: a WebGL canvas, beat HUD, Skip from 0 s.
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(page.getByTestId('skip')).toBeVisible();
  await page.waitForTimeout(2600);
  await shot(page, '02-awakening');
  const hasGl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  expect(hasGl).toBe(true);
  // Software WebGL is slow here; the 6.5 s sequence may already have ended on its own.
  await page.getByTestId('skip').click({ force: true, timeout: 5000 }).catch(() => undefined);

  // Scene 03 — hub, guided orbit.
  await expect(page.getByTestId('enter-waxbarasho')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '03-hub');
  await page.getByTestId('orbit-next').click();
  await expect(page.getByTestId('enter-midnimo')).toBeVisible();
  await page.getByTestId('orbit-prev').click();
  await expect(page.getByTestId('enter-waxbarasho')).toBeVisible();

  // Scene 04 — Waxbarasho + station sheet.
  await page.getByTestId('enter-waxbarasho').click();
  await expect(page.getByTestId('station-code-lab')).toBeVisible();
  await page.waitForTimeout(2800);
  await shot(page, '04a-waxbarasho');
  await page.getByTestId('station-code-lab').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/Qabyo|Draft/);
  await page.waitForTimeout(1800);
  await shot(page, '04b-waxbarasho-station');
  await page.getByTestId('next-station').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('back-hub').click();

  // Scene 05 — Midnimo, network lights up.
  await page.getByTestId('orbit-next').click();
  await page.getByTestId('enter-midnimo').click();
  await expect(page.getByTestId('station-peer-mentoring')).toBeVisible();
  await page.getByTestId('station-peer-mentoring').click();
  await expect(page.getByText(/1 \/ 7 lit/)).toBeVisible();
  await page.waitForTimeout(2600);
  await shot(page, '05-midnimo');
  await page.keyboard.press('Escape');

  // Scene 06 + 07 — Hoggaan and the Roadmap Ring.
  await page.getByTestId('back-hub').click();
  await page.getByTestId('orbit-prev').click();
  await page.getByTestId('orbit-prev').click();
  await page.getByTestId('enter-hoggaan').click();
  await expect(page.getByTestId('open-roadmap')).toBeVisible();
  await page.waitForTimeout(2600);
  await shot(page, '06-hoggaan');
  await page.getByTestId('open-roadmap').click();
  await page.waitForTimeout(1500);
  await shot(page, '07a-roadmap-ring');

  // Third content point read -> the vote screen, then the feedback step.
  await expect(page.getByTestId('vote-cta')).toBeVisible({ timeout: 15_000 });
  await shot(page, '09a-vote-cta');
  await page.getByTestId('vote-continue').click();
  await page.getByTestId('fb-qayb').click();
  await page.getByTestId('fb-send').click();
  await expect(page.getByTestId('feedback')).toContainText(/Mahadsanid|Thank you/);
  await shot(page, '09b-feedback');
  await page.getByRole('button', { name: /Ku noqo khibradda|Back to the experience/ }).click();
  await expect(page.getByTestId('feedback')).toHaveCount(0);

  await page.getByTestId('roadmap-next').click();
  await expect(page.getByTestId('roadmap-pos')).toHaveText(/2 \/ 8/);
  await page.getByTestId('roadmap-list').click();
  await expect(page.getByRole('dialog')).toContainText(/Tababar koodh bille ah|Monthly coding workshop/);
  await expect(page.getByRole('dialog')).not.toContainText(/Completed ·|La dhammeeyay ·/);
  await shot(page, '07b-roadmap-list');
  await page.getByTestId('close-roadmap').click();

  // Scene 08 — profile from the menu: placeholders, never invented facts.
  await page.getByTestId('menu').click();
  await page.getByTestId('menu-profile').click();
  await expect(page.getByRole('dialog')).toContainText('Zakariye Mohamed Omar');
  await expect(page.getByRole('dialog')).toContainText(/MEEL-HAYE|PLACEHOLDER/);
  await shot(page, '08-profile');
  await page.getByTestId('close-profile').click();

  // Scene 10 — exit.
  await page.getByTestId('menu').click();
  await page.getByTestId('menu-exit').click();
  await page.waitForTimeout(3600);
  await shot(page, '10-exit');
  await page.getByTestId('exit-restart').click();
  await expect(page.getByTestId('enter')).toBeVisible();

  expect(errors).toEqual([]);
});

test('reduced motion cuts instead of flying, and the keyboard works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('enter').click();
  await expect(page.getByTestId('enter-waxbarasho')).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('enter-midnimo')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('enter-waxbarasho')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');
});

test('settings switch the language to English', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Dejinta|Settings/ }).click();
  await page.getByTestId('lang-en').click();
  await page.getByRole('button', { name: /Close|Xidh/ }).click();
  await expect(page.getByTestId('enter')).toHaveText(/Enter Experience/i);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
});

test('without WebGL the entrance offers the text version', async ({ page }) => {
  await page.goto('/?quality=text');
  await expect(page.getByTestId('no3d')).toContainText(/3D/);
  await expect(page.getByTestId('enter')).toHaveCount(0);
});

for (const path of ['/text/', '/profile/', '/roadmap/', '/about/']) {
  test(`static page ${path} has all content and passes axe`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    if (path === '/text/') {
      for (const w of ['Waxbarasho', 'Midnimo', 'Hoggaan']) await expect(page.getByRole('heading', { name: w, exact: true })).toBeVisible();
    }
    expect(await serious(page)).toEqual([]);
    if (path === '/text/') await shot(page, 'text-mode');
  });
}
