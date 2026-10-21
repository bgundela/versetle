import { expect, test } from '@playwright/test';
import { createPuzzle } from '../packages/game-core/src/index';
import { defaults } from '../packages/shared/src/index';
const song = {
  id: 123,
  title: 'Test Garden',
  artist: 'Test Artist',
  album: 'Original test fixture',
  duration: 180,
};
const source = Array.from(
  { length: 14 },
  (_, i) => `Through the open garden I find another bright morning ${i}`,
);
const fixture = createPuzzle(song, source, defaults, 'test');
test('plays five rounds, reveals answers, saves results and recovers on refresh', async ({
  page,
}) => {
  let round = 0;
  await page.route('**/api/puzzle', async (route) => {
    round++;
    await route.fulfill({
      json: {
        puzzle: {
          ...fixture,
          seed: `test-${round}`,
          song: { ...song, title: `Test Garden ${round}` },
        },
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make it your game.' }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/versetle-setup-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Let’s play' }).click();
  for (let i = 1; i <= 5; i++) {
    await expect(
      page.getByRole('heading', { name: `Test Garden ${i}`, exact: true }),
    ).toBeVisible();
    for (const b of fixture.blanks)
      await page
        .getByRole('textbox', { name: new RegExp(`^Blank ${b.id + 1},`) })
        .fill(b.answer);
    if (i === 1) {
      await page.reload();
      await expect(
        page.getByRole('textbox', { name: /^Blank 1,/ }),
      ).toHaveValue(fixture.blanks[0].answer);
    }
    if (i === 1)
      await page.screenshot({
        path: `/tmp/versetle-game-${test.info().project.name}.png`,
        fullPage: true,
      });
    await page.getByRole('button', { name: 'Lock in answers' }).click();
    await expect(page.getByRole('status')).toContainText('100% accuracy');
    if (i < 5) await page.getByRole('button', { name: 'Next round' }).click();
  }
  await page.getByRole('button', { name: 'See my results' }).click();
  await expect(
    page.getByRole('heading', { name: 'You’ve got good taste.' }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/versetle-results-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'You’ve got good taste.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Another round?' }).click();
  await expect(
    page.getByRole('region', { name: 'Recent games' }),
  ).toContainText('100% accuracy');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('searches, selects a song, and recovers from a failed puzzle request', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/search?*', (route) =>
    route.fulfill({ json: { songs: [song] } }),
  );
  await page.route('**/api/puzzle', (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 502,
        json: { error: 'Provider unavailable. Try again.' },
      });
    }
    return route.fulfill({ json: { puzzle: fixture } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Find a song' }).click();
  await page
    .getByRole('textbox', { name: 'Song or artist' })
    .fill('Test Garden');
  await page.getByRole('button', { name: /Test Garden Test Artist/ }).click();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.locator('.error-box')).toHaveText(
    'Provider unavailable. Try again.',
  );
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Garden', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lock in answers' }).click();
  await expect(page.getByRole('status')).toContainText('0% accuracy');
  await page.getByRole('button', { name: 'See my results' }).click();
  await expect(page.getByText('Total points / 150')).toBeVisible();
});
test('expires a restored round once without adding duplicate scores', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Let’s play' })).toBeEnabled();
  await page.evaluate(
    ({ puzzle, config }) =>
      localStorage.setItem(
        'versetle.session.v1',
        JSON.stringify({
          version: 1,
          phase: 'round',
          puzzle,
          settings: { ...config, rounds: 1 },
          selection: { mode: 'random', artist: '', song: null },
          answers: {},
          endsAt: Date.now() - 1000,
          played: [],
          excluded: [],
        }),
      ),
    { puzzle: fixture, config: defaults },
  );
  await page.reload();
  await expect(page.getByRole('status')).toContainText('0% accuracy');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('0% accuracy');
  await page.getByRole('button', { name: 'See my results' }).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
});
test('validates API requests', async ({ request }) => {
  expect((await request.get('/api/search?q=a')).status()).toBe(400);
  expect(
    (
      await request.post('/api/puzzle', { data: { settings: { seconds: 1 } } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/puzzle', {
        data: 'invalid',
        headers: { 'Content-Type': 'application/json' },
      })
    ).status(),
  ).toBe(400);
});

for (const style of ['lines', 'mixed'] as const) {
  test(`${style} blanks fit the screen and receive full credit`, async ({
    page,
  }) => {
    await page.route('**/api/puzzle', async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          puzzle: createPuzzle(song, source, body.settings, 'style-check'),
        },
      });
    });
    await page.goto('/');
    await page
      .getByRole('combobox', { name: 'Blank style', exact: true })
      .selectOption(style);
    await page.getByRole('button', { name: 'Let’s play' }).click();
    const puzzle = createPuzzle(
      song,
      source,
      { ...defaults, style },
      'style-check',
    );
    for (const blank of puzzle.blanks)
      await page
        .getByRole('textbox', { name: new RegExp(`^Blank ${blank.id + 1},`) })
        .fill(blank.answer);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Lock in answers' }).click();
    await expect(page.getByRole('status')).toContainText('100% accuracy');
  });
}

test('plays with browser storage disabled', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'])
      Object.defineProperty(Storage.prototype, method, {
        value: () => {
          throw new Error('Storage unavailable');
        },
      });
  });
  await page.route('**/api/puzzle', (route) =>
    route.fulfill({ json: { puzzle: fixture } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Garden', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lock in answers' }).click();
  await expect(page.getByRole('status')).toContainText('0% accuracy');
});

test('automatically submits when the countdown expires', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/puzzle', (route) =>
    route.fulfill({ json: { puzzle: fixture } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s play' }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Garden', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(91_000);
  await expect(page.getByRole('status')).toContainText('0% accuracy');
  await expect(
    page.getByRole('button', { name: 'Lock in answers' }),
  ).toHaveCount(0);
});
