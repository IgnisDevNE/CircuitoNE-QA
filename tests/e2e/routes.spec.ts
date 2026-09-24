import { expect, test } from '@playwright/test'

const publicRoutes = [
  ['/', 'Início'],
  ['/artistas', 'Artistas'],
  ['/artistas/art-anerie', 'ANERIE'],
  ['/coletivos', 'Coletivos e Produtoras'],
  ['/coletivos/col-litoral', 'LITORAL SUL'],
  ['/eventos', 'Eventos Programados'],
  ['/eventos/ev-porto', 'PORTO NOTURNO — TECHNO NA ORLA'],
  ['/entrar', 'Entrar'],
  ['/cadastro', 'Cadastro'],
] as const

const privateRoutes = [
  ['/painel', 'Dashboard'],
  ['/painel/perfil/art-anerie', 'Editar ANERIE'],
  ['/painel/dados', 'Editar Dados'],
  ['/painel/dados/nova-atuacao', 'Nova atuação'],
  ['/painel/seguranca', 'Segurança'],
  ['/painel/mensagens', 'Central de Mensagens'],
  ['/painel/coletivos', 'Meus Coletivos'],
  ['/painel/explorar/artistas', 'explorar/artistas'],
  ['/painel/explorar/servicos', 'explorar/serviços'],
  ['/painel/explorar/audiovisual', 'explorar/audiovisual'],
  ['/painel/explorar/coletivos', 'explorar/coletivos'],
  ['/coletivo/col-litoral/painel', 'LITORAL SUL · Dashboard'],
  ['/coletivo/col-litoral/mensagens', 'LITORAL SUL · Mensagens'],
  ['/coletivo/col-litoral/solicitacoes', 'LITORAL SUL · Solicitações'],
  ['/coletivo/col-litoral/eventos/novo', 'LITORAL SUL · Criar Evento'],
  ['/coletivo/col-litoral/membros', 'LITORAL SUL · Membros'],
  ['/coletivo/col-litoral/editar', 'LITORAL SUL · Editar'],
  ['/coletivo/col-litoral/perfil', 'LITORAL SUL · Perfil'],
] as const

test.beforeEach(async ({ page, baseURL }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T15:00:00.000Z'))
  // O protótipo não precisa de serviços externos para esta caracterização.
  await page.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
    ? route.continue()
    : route.abort())
})

test.afterEach(async ({ page }, info) => {
  const visualPaths = ['/', '/artistas/art-anerie', '/cadastro', '/coletivo/col-litoral/painel']
  if (info.status === 'passed' && visualPaths.includes(new URL(page.url()).pathname)) {
    await info.attach('viewport', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
  }
})

for (const [path, title] of publicRoutes) {
  test(`rota pública ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    await expect(page).toHaveTitle(`${title} · CIRCUITO NE`)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('link direto do artista mantém o perfil público após recarga', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/artistas/art-anerie')
  await expect(page.getByRole('heading', { name: 'ANERIE', exact: true })).toBeVisible()
  const response = await page.reload()
  expect(response?.status()).toBe(200)
  await expect(page).toHaveURL(/\/artistas\/art-anerie$/)
  await expect(page).toHaveTitle('ANERIE · CIRCUITO NE')
  await expect(page.getByRole('heading', { name: 'ANERIE', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('hidrata a agenda com o relógio do servidor mesmo se o navegador estiver em outra data', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2030-01-01T12:00:00.000Z'))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/eventos')
  await expect(page.getByText('PORTO NOTURNO — TECHNO NA ORLA').first()).toBeVisible()
  expect(errors).toEqual([])
})

for (const [path, title] of privateRoutes) {
  test(`rota com sessão mock ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/entrar')
    await page.getByRole('button', { name: '[demo] entrar como Ana', exact: true }).click()
    await expect(page).toHaveURL(/\/painel$/)
    // Caracteriza a renderização a partir do histórico. O mock perde a sessão
    // em recargas; navegação por links tem jornada própria abaixo.
    await page.evaluate((pathname) => {
      window.history.pushState({}, '', pathname)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    await expect(page).toHaveTitle(`${title} · CIRCUITO NE`)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('jornada pública por links, voltar e avançar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Explorar artistas', exact: true }).click()
  await expect(page).toHaveURL(/\/artistas$/)
  await page.goBack()
  await expect(page).toHaveTitle('Início · CIRCUITO NE')
  await page.goForward()
  await expect(page).toHaveTitle('Artistas · CIRCUITO NE')
})

test('rota desconhecida permite voltar ao início', async ({ page }) => {
  await page.goto('/rota-inexistente')
  await expect(page.getByText('404 — página não encontrada.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'voltar ao início', exact: true }).click()
  await expect(page).toHaveTitle('Início · CIRCUITO NE')
})

test('parâmetro com escape inválido é rejeitado sem quebrar a página', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // O runtime SSR rejeita a URL malformada com 400.
  // Um histórico manipulado também deve oferecer caminho de recuperação.
  const response = await page.goto('/artistas/%E0%A4%A')
  expect(response?.status()).toBe(400)
  await page.goto('/')
  await page.getByRole('link', { name: 'Explorar artistas', exact: true }).click()
  await expect(page).toHaveURL(/\/artistas$/)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/artistas/%E0%A4%A')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('link', { name: 'voltar ao início', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'voltar ao início', exact: true }).click()
  await expect(page).toHaveTitle('Início · CIRCUITO NE')
  expect(errors).toEqual([])
})

test('filtros de artistas combinam busca e estilo e recuperam lista vazia', async ({ page }) => {
  await page.goto('/artistas')
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('recifense')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'ANERIE', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dub', exact: true }).click()
  await expect(page.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeVisible()
  await page.getByRole('button', { name: 'todos', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('')
  await expect(page.getByRole('article')).toHaveCount(4)
})
