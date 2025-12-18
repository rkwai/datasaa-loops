/// <reference lib="dom" />

import { test, expect, type Page } from '@playwright/test'

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
  const datasetSelect = page.getByTestId('dataset-select')
  await expect(datasetSelect).toBeVisible({ timeout: 15000 })
  await datasetSelect.selectOption(dataset)
  const fileInput = page.getByTestId('dataset-file-input')
  await fileInput.setInputFiles({
    name: `${dataset}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await page.getByTestId('import-submit').click()
  await expect(page.getByTestId('import-status')).toBeVisible({
    timeout: 20000,
  })
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
  await expect(page.getByRole('heading', { name: 'Import wizard' })).toBeVisible({ timeout: 15000 })
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
  await page.locator('svg line').first().click({ position: { x: 5, y: 5 } })
  await expect(page.getByText('LTV:CAC')).toBeVisible()

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
