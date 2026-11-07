import { expect, test } from '@playwright/test'

const group = {
  id: 42,
  kind: 'group',
  name: 'Browser avatar room',
  description: 'Private avatar rendering test',
  avatar_url: '/api/conversations/42/group-avatar/0123456789abcdef0123456789abcdef.png',
  title: 'Browser avatar room',
  created_at: '2026-11-07T00:00:00+00:00',
  participants: [
    { id: 1, username: 'tester', display_name: 'Browser tester', role: 'admin' },
    { id: 2, username: 'member', display_name: 'Group member', role: 'member' },
  ],
  last_message: null,
  unread_count: 0,
}

const currentUser = { id: 1, username: 'tester', display_name: 'Browser tester', avatar_url: null }
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6XcAAAAASUVORK5CYII=',
  'base64',
)

async function expectAvatarToRender(locator) {
  await expect(locator).toBeVisible()
  await expect.poll(() => locator.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
}

test('private group avatar renders in list, chat header, and info after refresh', async ({ page }) => {
  let activeGroup = { ...group }
  const refreshedAvatarUrl = '/api/conversations/42/group-avatar/fedcba9876543210fedcba9876543210.png'
  const requestedAvatarPaths = []
  await page.addInitScript(() => localStorage.setItem('midnight_token', 'browser-test-token'))
  await page.route('**/socket.io/**', route => route.abort())
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/api/auth/me') {
      return route.fulfill({ json: { user: currentUser } })
    }
    if (url.pathname === '/api/conversations' && request.method() === 'GET') {
      return route.fulfill({ json: { conversations: [activeGroup] } })
    }
    if (url.pathname === '/api/conversations/42' && request.method() === 'GET') {
      return route.fulfill({ json: { conversation: { ...activeGroup, avatar_url: null } } })
    }
    if (url.pathname === '/api/conversations/42/messages') {
      return route.fulfill({ json: { messages: [], has_more: false } })
    }
    if (url.pathname === '/api/conversations/42/read') {
      return route.fulfill({ json: { message: 'Read' } })
    }
    if (url.pathname === '/api/conversations/42/group-avatar' && request.method() === 'POST') {
      expect(request.headers().authorization).toBe('Bearer browser-test-token')
      activeGroup = { ...activeGroup, avatar_url: refreshedAvatarUrl }
      return route.fulfill({ json: { conversation: activeGroup } })
    }
    if ([group.avatar_url, refreshedAvatarUrl].includes(url.pathname)) {
      expect(request.headers().authorization).toBe('Bearer browser-test-token')
      requestedAvatarPaths.push(url.pathname)
      return route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected API request: ${url.pathname}` } })
  })

  const verifyAllLocations = async () => {
    await expectAvatarToRender(page.locator('.conversation-mark img'))
    await page.locator('.conversation-preview').click()
    await expectAvatarToRender(page.locator('.group-avatar-header img'))
    await page.locator('.group-header-trigger').click()
    await expectAvatarToRender(page.locator('.group-avatar-large img'))
  }

  await page.goto('/messages')
  await verifyAllLocations()

  await page.locator('.group-info-screen input[type="file"]').setInputFiles({
    name: 'new-group-picture.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  })
  await expectAvatarToRender(page.locator('.group-avatar-large img'))
  await expectAvatarToRender(page.locator('.conversation-mark img'))
  await expect.poll(() => requestedAvatarPaths.includes(refreshedAvatarUrl)).toBe(true)
  await page.locator('.group-info-header > button').click()
  await expectAvatarToRender(page.locator('.group-avatar-header img'))

  await page.reload()
  await verifyAllLocations()
})
