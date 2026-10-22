const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer: createPortProbe } = require('node:net');

const shotDir = process.env.CONFIG_TOPNAV_SHOTS || '';

(async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const probe = createPortProbe();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const server = await createServer({
    configFile: false, root: path.resolve(__dirname, '..'),
    cacheDir: 'node_modules/.vite-config-topnav-test', plugins: [react()],
    logLevel: 'error', optimizeDeps: { entries: ['index.html'] },
    server: { host: '127.0.0.1', port, strictPort: true, watch: null },
  });
  let browser;
  try {
    assert.equal(server.config.server.port, port, 'Use the allocated port instead of Vite’s default port');
    await server.listen();
    assert.equal(server.httpServer.address().port, port);
    const base = `http://127.0.0.1:${port}`;
    const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
    browser = await chromium.launch({ channel, headless: true, args: ['--no-proxy-server'] });
    const runtimeErrors = [];

    const computedOf = (page, selector) => page.locator(selector).first().evaluate(element => {
      const style = getComputedStyle(element);
      return {
        position: style.position,
        backgroundColor: style.backgroundColor,
        borderBottomWidth: style.borderBottomWidth,
        height: style.height,
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        color: style.color,
        borderBottomColor: style.borderBottomColor,
        fontWeight: style.fontWeight,
      };
    });

    const backgroundAlpha = (page, selector) => page.locator(selector).first().evaluate(element => {
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(element).backgroundColor;
      document.body.appendChild(probe);
      const parsed = getComputedStyle(probe).color;
      probe.remove();
      const parts = parsed.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
      return parts.length === 4 ? parts[3] : 1;
    });

    for (const locale of ['en', 'zh-CN']) {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 640, height: 600 }]) {
        const label = `${locale} ${viewport.width}x${viewport.height}`;
        const page = await browser.newPage({ viewport, locale });
        page.setDefaultTimeout(10000);
        page.setDefaultNavigationTimeout(60000);
        page.on('pageerror', error => runtimeErrors.push(`${label}: ${error}`));
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        await page.addInitScript(language => localStorage.setItem('easy-cli-proxy-api.locale', language), locale);
        await page.goto(`${base}?mock=running`, { waitUntil: 'domcontentloaded' });
        await page.locator('.app-shell').waitFor();
        await page.addStyleTag({ content: '#browser-mock-toolbar { display: none; }' });

        const openAdvanced = async () => {
          await page.locator('.nav-section').getByRole('button', {
            name: locale === 'en' ? 'Advanced Features' : '高级功能', exact: true,
          }).click();
          await page.locator('#config-subpage-panel').waitFor();
        };
        const openUsage = async () => {
          await page.locator('.nav-section').getByRole('button', {
            name: locale === 'en' ? 'Usage' : '使用记录', exact: true,
          }).click();
          await page.locator('#usage-tab-panel').waitFor();
        };

        await openAdvanced();

        const topnav = await computedOf(page, '.config-settings-topnav');
        assert.equal(topnav.position, 'static', `${label}: topnav must scroll with the page like the shared top bar`);
        assert.equal(topnav.borderBottomWidth, '0px', `${label}: topnav must not draw its own full-width divider`);
        assert.equal(await backgroundAlpha(page, '.config-settings-topnav'), 0, `${label}: topnav must be transparent, got ${topnav.backgroundColor}`);

        const advancedTab = await computedOf(page, '#config-subpage-tab-general.active');
        await openUsage();
        const usageTab = await computedOf(page, '.usage-tabs button.active');
        assert.equal(advancedTab.height, usageTab.height, `${label}: active tab height must match the shared tabs`);
        assert.equal(advancedTab.paddingTop, usageTab.paddingTop, `${label}: active tab padding must match the shared tabs`);
        assert.equal(advancedTab.paddingLeft, usageTab.paddingLeft, `${label}: active tab padding must match the shared tabs`);
        assert.equal(advancedTab.borderTopLeftRadius, usageTab.borderTopLeftRadius, `${label}: active tab radius must match the shared tabs`);
        assert.equal(advancedTab.borderBottomLeftRadius, usageTab.borderBottomLeftRadius, `${label}: active tab radius must match the shared tabs`);
        assert.equal(advancedTab.color, usageTab.color, `${label}: active tab color must match the shared tabs`);
        assert.equal(advancedTab.borderBottomColor, usageTab.borderBottomColor, `${label}: active tab underline must match the shared tabs`);
        assert.equal(advancedTab.backgroundColor, usageTab.backgroundColor, `${label}: active tab background must match the shared tabs`);
        assert.equal(advancedTab.fontWeight, usageTab.fontWeight, `${label}: active tab weight must match the shared tabs`);

        await openAdvanced();
        await page.locator('#config-subpage-tab-requests').click();
        await page.locator('#config-subpage-panel[aria-labelledby="config-subpage-tab-requests"]').waitFor();
        assert.equal(await page.locator('#config-subpage-tab-requests').getAttribute('aria-selected'), 'true');

        const search = page.locator('.config-settings-search input');
        await search.fill('retry');
        await page.locator('.config-search-results').waitFor();
        const results = await page.locator('.config-search-result-list > button').count();
        assert.ok(results > 0, `${label}: search must still list matching settings`);
        await search.press('Escape');
        await page.locator('.config-search-results').waitFor({ state: 'detached' });
        assert.equal(await search.inputValue(), '', `${label}: Escape must clear the search`);

        if (shotDir && viewport.width === 1280) {
          const { mkdirSync } = await import('node:fs');
          mkdirSync(shotDir, { recursive: true });
          await page.screenshot({ path: path.join(shotDir, `advanced-topnav-${locale}.png`), clip: { x: 0, y: 0, width: viewport.width, height: 320 } });
          await openUsage();
          await page.screenshot({ path: path.join(shotDir, `usage-topbar-${locale}.png`), clip: { x: 0, y: 0, width: viewport.width, height: 320 } });
        }
        await page.close();
      }
    }
    assert.deepEqual(runtimeErrors, [], `No runtime errors: ${runtimeErrors.join(' | ')}`);
    console.log('config-topnav-ui: passed 2 viewports x 2 locales');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.httpServer.close(resolve));
    await server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
