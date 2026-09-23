import { expect, test } from '@playwright/test'

test('descrição de evento maliciosa permanece inerte na página pública', async ({ page }) => {
  await page.goto('/entrar')
  await page.getByRole('button', { name: '[demo] entrar como Ana', exact: true }).click()
  await page.evaluate(() => {
    window.history.pushState({}, '', '/coletivo/col-litoral/eventos/novo')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await page.getByLabel('Nome do evento').fill('Teste Markdown seguro')
  await page.getByLabel('Início').fill('2027-01-10T20:00')
  await page.getByLabel('Cidade').fill('Recife')
  await page.getByLabel('Local').fill('Teatro')
  await page.locator('#ev-desc').fill('[abrir](https://example.org/"onmouseover="alert`1`)\n<img src=x onerror=alert(1)>\n[perigo](javascript:alert(1))')
  await page.getByLabel('Evento gratuito').check()
  await page.getByRole('button', { name: 'publicar evento' }).click()
  await page.getByRole('link', { name: /Teste Markdown seguro/ }).click()

  const link = page.getByRole('link', { name: 'abrir' })
  await expect(link).toHaveAttribute('href', 'https://example.org/"onmouseover="alert`1`')
  expect(await link.getAttribute('onmouseover')).toBeNull()
  await expect(page.locator('img[onerror]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'perigo' })).toHaveCount(0)
})
