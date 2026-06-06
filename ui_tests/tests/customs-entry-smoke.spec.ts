import { expect, test } from '@playwright/test';

const loginEmail = process.env.UI_LOGIN_EMAIL;
const loginPassword = process.env.UI_LOGIN_PASSWORD;

async function login(page) {
  if (!loginEmail || !loginPassword) {
    throw new Error('UI_LOGIN_EMAIL and UI_LOGIN_PASSWORD are required.');
  }

  await page.goto('/app');
  if (page.url().includes('/login')) {
    await page.locator('#login_email').fill(loginEmail);
    await page.locator('#login_password').fill(loginPassword);
    await page.getByRole('button', { name: /login/i }).click();
  }
  await expect(page).toHaveURL(/\/app($|\/)/);
}

test('can open a new Customs Entry form', async ({ page }) => {
  await login(page);
  await page.goto('/app/customs-entry/new-customs-entry-1');
  await expect(page.getByRole('heading', { name: 'New Customs Entry' })).toBeVisible();
  await expect(page.locator('input[data-doctype="Customs Entry"][data-fieldname="filer_code"]')).toBeVisible();
});
