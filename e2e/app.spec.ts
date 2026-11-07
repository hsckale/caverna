import { expect, test } from '@playwright/test';

test('shows the Caverna Jiu-Jitsu welcome screen and opens the login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Caverna Jiu-Jitsu' })).toBeVisible();
  await page.getByRole('button', { name: 'Já tenho conta' }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('lets a student start the registration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await expect(page.getByLabel('Nome completo')).toBeVisible();
  await expect(page.getByLabel('Código da academia')).toBeVisible();
});
