import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Local dev owner from the gitignored apps/api/.env (created by the dev setup, never committed). */
function devAdmin() {
  try {
    const env = Object.fromEntries(
      readFileSync('apps/api/.env', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
    return { email: env.DEV_ADMIN_EMAIL, password: env.DEV_ADMIN_PASSWORD };
  } catch {
    return { email: undefined, password: undefined };
  }
}

test.describe('admin', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  test('rejects a wrong password with a generic message', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.getByLabel('Email').fill('nobody@example.org');
    await page.getByLabel('Password').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });

  test('owner signs in and sees live aggregate reports only', async ({ page }) => {
    const { email, password } = devAdmin();
    test.skip(!email || !password, 'no local dev admin configured');
    await page.goto('http://localhost:5173/');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Page views', { exact: true })).toBeVisible();
    await expect(page.getByText(/Totals only/)).toBeVisible();
    // Owner actions require 2FA: the warning is shown until it is set up.
    await expect(page.getByText(/need two-factor authentication/)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `docs/screenshots/${test.info().project.name}-11-admin.png`, fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
