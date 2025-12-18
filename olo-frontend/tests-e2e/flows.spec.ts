/// <reference lib="dom" />

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url))
const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function serveBuiltApp(page: Page) {
  await ensureDistReady()
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const filePath = await resolveAssetPath(url.pathname)
    const body = await fs.readFile(filePath)
    const contentType = MIME_MAP[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    await route.fulfill({
      status: 200,
      body,
      headers: {
        'content-type': contentType,
      },
    })
  })
  await page.goto('/')
}

async function ensureDistReady() {
  try {
    const stats = await fs.stat(DIST_DIR)
    if (!stats.isDirectory()) {
      throw new Error('dist/ is not a directory. Run npm run build before playwright.')
    }
  } catch (error) {
    throw new Error('Missing dist/ output. Run npm run build before playwright.', { cause: error })
  }
}

async function resolveAssetPath(pathname: string) {
  const clean = decodeURIComponent(pathname.split('?')[0] ?? '/').replace(/^\/+/, '')
  const candidate = path.join(DIST_DIR, clean || 'index.html')
  if (await fileExists(candidate)) {
    return candidate
  }
  return path.join(DIST_DIR, 'index.html')
}

async function fileExists(filePath: string) {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

test.beforeEach(async ({ page }) => {
  await serveBuiltApp(page)
})

const customersCsv = `customerId,acquisitionDate,channelSourceId
cust_high,2024-01-01,paid
cust_low,2024-01-02,brand
`

const transactionsCsv = `transactionId,customerId,revenueAmount,date
t1,cust_high,320,2024-01-03
t2,cust_low,80,2024-01-04
`

const channelsCsv = `channelId,name
paid,Paid Social
brand,Brand
`

const spendCsv = `channelId,date,spend
paid,2024-01-01,40
brand,2024-01-01,10
`

async function uploadDataset(page: Page, dataset: string, csv: string) {
  const fileInput = page.getByTestId('dataset-file-input')
  await fileInput.setInputFiles({
    name: `${dataset}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  const modal = page.locator('.import-modal')
  await expect(modal).toBeVisible({ timeout: 15000 })
  const datasetSelect = page.getByTestId('dataset-select')
  await datasetSelect.selectOption(dataset)
  await page.getByTestId('import-submit').click()
  await expect(page.getByTestId('import-status')).toBeVisible({
    timeout: 20000,
  })
  await page.getByRole('button', { name: 'Close' }).click()
}

async function resetStorage(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    if ('databases' in indexedDB && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs
          .map((db) => db.name)
          .filter(Boolean)
          .map(
            (name) =>
              new Promise<void>((resolve, reject) => {
                const req = indexedDB.deleteDatabase(name!)
                req.onsuccess = () => resolve()
                req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
              }),
          ),
      )
    } else {
      indexedDB.deleteDatabase('olo_meta_db')
    }
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
}

const customers = customersCsv
const transactions = transactionsCsv
const channels = channelsCsv
const spend = spendCsv

async function createProject(page: Page, name = 'E2E Ratio Lab') {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational Loop Optimizer' })).toBeVisible()
  await page.getByLabel('Project name').fill(name)
  await page.getByLabel('Currency').fill('USD')
  await page.getByLabel('Timezone').fill('UTC')
  await page.getByRole('button', { name: 'Launch workspace', exact: true }).click()
  await expect(page).toHaveURL(/\/project\//)
}

async function completeDataIntake(page: Page) {
  await page.getByTestId('nav-import').click()
  await expect(page.getByRole('heading', { name: /get your data in/i })).toBeVisible({ timeout: 15000 })
  await uploadDataset(page, 'customers', customers)
  await uploadDataset(page, 'transactions', transactions)
  await uploadDataset(page, 'channels', channels)
  await uploadDataset(page, 'channelSpendDaily', spend)
}

test('user flows: data intake, ratio views, spend plan, governance, exports', async ({ page }) => {
  await resetStorage(page)
  await createProject(page)
  await completeDataIntake(page)

  // Ratio dashboard
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('kpi-ltv-cac')).toBeVisible()
  await expect(page.locator('table').nth(1).getByText('Target').first()).toBeVisible()

  // Attribution map interaction
  await page.getByTestId('nav-attribution').click()
  await expect(page.getByText('Dynamic CAC attribution map')).toBeVisible()
  const firstEdge = page.locator('[data-testid^="edge-"]').first()
  await firstEdge.waitFor({ state: 'attached' })
  await firstEdge.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await expect(page.getByTestId('edge-detail-panel')).toBeVisible()

  // Spend plan flow
  await page.getByTestId('nav-plan').click()
  const firstInput = page.getByTestId('spend-input-paid')
  await firstInput.fill('1500')
  await page.getByTestId('approve-plan').click()
  await expect(page.getByText('Plan approved locally.')).toBeVisible()

  // Settings and audit log
  await page.getByTestId('nav-settings').click()
  await page.getByLabel('LTV window (days)').fill('60')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()

  await page.getByTestId('nav-audit').click()
  await expect(page.getByText('SETTINGS_CHANGE')).toBeVisible()

  // Export bundle confirmation
  await page.getByTestId('nav-export').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .zip' }).click(),
  ])
  await download.delete()
  await expect(page.getByText('Project bundle exported. Store it safely!')).toBeVisible()
})
