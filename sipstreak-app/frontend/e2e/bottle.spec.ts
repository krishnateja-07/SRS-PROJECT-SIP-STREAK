import { expect, test, type Page } from '@playwright/test'

const stored = (page: Page) => page.getByText('Stored in your bottle').locator('xpath=following-sibling::div[1]')
const mlOf = async (page: Page) => Number(((await stored(page).innerText()) || '0').replace(/[^0-9]/g, ''))

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGL|shader|GLSL/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`) })
  return errors
}

async function loginAsPriya(page: Page) {
  await page.goto('/#login')
  await page.getByRole('button', { name: 'Log in as Priya' }).click()
  await expect(page.getByText('Stored in your bottle')).toBeVisible({ timeout: 15_000 })
}

test('landing page renders the 3D bottle with a compiled water shader and no errors', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  const gl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
  expect(gl).toBe(true)
  await page.waitForTimeout(2500)
  expect(errors).toEqual([])
})

test('logging water changes the 3D canvas and the stored amount, and removing restores it', async ({ page }) => {
  const errors = watchErrors(page)
  await loginAsPriya(page)
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(2500)
  const before = await canvas.screenshot()
  const startMl = await mlOf(page)

  await page.getByRole('button', { name: 'Log 500 ml Bottle' }).click()
  await page.waitForTimeout(700) // mid-ripple: the shader is animating the surface
  const during = await canvas.screenshot()
  expect(Buffer.compare(before, during)).not.toBe(0)
  await expect.poll(() => mlOf(page)).toBe(startMl + 500)

  await page.getByRole('button', { name: 'Remove 500 ml' }).click()
  await expect.poll(() => mlOf(page)).toBe(startMl)
  expect(errors).toEqual([])
})

test('set an exact total and clear the bottle', async ({ page }) => {
  await loginAsPriya(page)
  await page.getByLabel('Set exact total for today').fill('1200')
  await page.getByRole('button', { name: 'Set', exact: true }).click()
  await expect.poll(() => mlOf(page)).toBe(1200)
  await page.getByRole('button', { name: /Clear today.s water/ }).click()
  await page.getByRole('button', { name: 'Yes, clear' }).click()
  await expect.poll(() => mlOf(page)).toBe(0)
})

test('leaderboard shows ranked squads', async ({ page }) => {
  await loginAsPriya(page)
  await page.goto('/#leaderboard')
  await expect(page.getByText('Hostel Block A').first()).toBeVisible({ timeout: 15_000 })
})
