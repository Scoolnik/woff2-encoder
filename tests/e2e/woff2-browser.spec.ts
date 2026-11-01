import { expect, test, type Page } from '@playwright/test';

interface MatchResult {
  actualLength: number;
  actualPrefix: string;
  expectedLength: number;
  expectedPrefix: string;
  matches: boolean;
}

interface FontMetrics {
  numGlyphs: number;
  unitsPerEm: number;
}

interface BrowserFixture {
  compressArrayBufferMatches(
    inputName: string,
    expectedName: string
  ): Promise<MatchResult>;
  compressMatches(
    inputName: string,
    expectedName: string
  ): Promise<MatchResult>;
  syncCallsBeforePreload(): Promise<(string | null)[]>;
  compressSyncMatches(
    inputName: string,
    expectedName: string,
    asArrayBuffer: boolean
  ): Promise<MatchResult>;
  decompressSyncMatches(
    inputName: string,
    expectedName: string,
    asArrayBuffer: boolean
  ): Promise<MatchResult>;
  subpathDecompressSyncMatches(
    inputName: string,
    expectedName: string,
    asArrayBuffer: boolean
  ): Promise<MatchResult>;
  concurrentCallsMatch(): Promise<MatchResult[]>;
  decompressArrayBufferMatches(
    inputName: string,
    expectedName: string
  ): Promise<MatchResult>;
  decompressMatches(
    inputName: string,
    expectedName: string
  ): Promise<MatchResult>;
  parseDecompressedFont(inputName: string): Promise<FontMetrics>;
  repeatedCallsMatch(): Promise<MatchResult[]>;
  subpathDecompressMatches(
    inputName: string,
    expectedName: string
  ): Promise<MatchResult>;
}

declare global {
  interface Window {
    woff2E2E: BrowserFixture;
  }
}

/**
 * Opens the browser fixture page.
 *
 * @param page - The Playwright page.
 * @returns A promise that resolves after the page is ready.
 */
async function openFixture(page: Page): Promise<void> {
  await page.goto('/tests/e2e/fixtures/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');
}

/**
 * Asserts that browser output exactly matched the expected fixture.
 *
 * @param result - The browser comparison result.
 * @returns Nothing.
 */
function expectMatch(result: MatchResult): void {
  expect(result.matches).toBe(true);
  expect(result.actualLength).toBe(result.expectedLength);
  expect(result.actualPrefix).toBe(result.expectedPrefix);
}

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test('compress loads wasm and returns WOFF2 data', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.woff2E2E.compressMatches('og.ttf', 'enc-ttf.woff2')
  );

  expectMatch(result);
});

test('compress accepts ArrayBuffer input in the browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.woff2E2E.compressArrayBufferMatches('og.ttf', 'enc-ttf.woff2')
  );

  expectMatch(result);
});

test('root decompress loads wasm and returns SFNT data', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.woff2E2E.decompressMatches('og.woff2', 'dec-woff2.ttf')
  );

  expectMatch(result);
});

test('root decompress accepts ArrayBuffer input in the browser', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.woff2E2E.decompressArrayBufferMatches('og.woff2', 'dec-woff2.ttf')
  );

  expectMatch(result);
});

test('subpath decompress export works in the browser', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.woff2E2E.subpathDecompressMatches('og.woff2', 'dec-woff2.ttf')
  );

  expectMatch(result);
});

test('decompressed output parses as an OpenType font in the browser', async ({
  page,
}) => {
  const metrics = await page.evaluate(() =>
    window.woff2E2E.parseDecompressedFont('og.woff2')
  );

  expect(metrics.numGlyphs).toBeGreaterThan(0);
  expect(metrics.unitsPerEm).toBeGreaterThan(0);
});

test('repeated calls reuse initialized modules', async ({ page }) => {
  const results = await page.evaluate(() =>
    window.woff2E2E.repeatedCallsMatch()
  );

  expect(results).toHaveLength(4);
  for (const result of results) {
    expectMatch(result);
  }
});

test('concurrent calls do not race module initialization', async ({ page }) => {
  const results = await page.evaluate(() =>
    window.woff2E2E.concurrentCallsMatch()
  );

  expect(results).toHaveLength(8);
  for (const result of results) {
    expectMatch(result);
  }
});

test('reload can initialize and call the modules again', async ({ page }) => {
  expectMatch(
    await page.evaluate(() =>
      window.woff2E2E.compressMatches('og.ttf', 'enc-ttf.woff2')
    )
  );

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');

  expectMatch(
    await page.evaluate(() =>
      window.woff2E2E.decompressMatches('og.woff2', 'dec-woff2.ttf')
    )
  );
});

test('sync APIs reject calls before preload in the browser', async ({
  page,
}) => {
  const codes = await page.evaluate(() =>
    window.woff2E2E.syncCallsBeforePreload()
  );

  expect(codes).toEqual([
    'MODULE_NOT_INITIALIZED',
    'MODULE_NOT_INITIALIZED',
    'MODULE_NOT_INITIALIZED',
  ]);
});

for (const asArrayBuffer of [false, true]) {
  const inputType = asArrayBuffer ? 'ArrayBuffer' : 'Uint8Array';

  test(`compressSync accepts ${inputType} after preload in the browser`, async ({
    page,
  }) => {
    const result = await page.evaluate(
      (useArrayBuffer) =>
        window.woff2E2E.compressSyncMatches(
          'og.ttf',
          'enc-ttf.woff2',
          useArrayBuffer
        ),
      asArrayBuffer
    );

    expectMatch(result);
  });

  test(`decompressSync accepts ${inputType} after preload in the browser`, async ({
    page,
  }) => {
    const result = await page.evaluate(
      (useArrayBuffer) =>
        window.woff2E2E.decompressSyncMatches(
          'og.woff2',
          'dec-woff2.ttf',
          useArrayBuffer
        ),
      asArrayBuffer
    );

    expectMatch(result);
  });

  test(`subpath decompressSync accepts ${inputType} after preload in the browser`, async ({
    page,
  }) => {
    const result = await page.evaluate(
      (useArrayBuffer) =>
        window.woff2E2E.subpathDecompressSyncMatches(
          'og.woff2',
          'dec-woff2.ttf',
          useArrayBuffer
        ),
      asArrayBuffer
    );

    expectMatch(result);
  });
}
