const debug = require('../debug');
const EventEmitter = require('events');
const puppeteer = require('puppeteer');

let browser = null;

class DevToolsClient extends EventEmitter {
  constructor(inspectorUrl, { title } = {}) {
    super();

    this.inspectorUrl = inspectorUrl;

    this._title = title;
  }

  async setInspectorUrl(url) {
    if (url === this.inspectorUrl) return;

    this.inspectorUrl = url;

    if (this._page) {
      await this._loadDevTools();
    }
  }

  async activate() {
    if (!this._page) throw new Error('The client has not been launched yet');

    return this._page.bringToFront();
  }

  async launch() {
    if (this._page) return;

    if (!this.inspectorUrl) throw new Error('Can\'t launch without inspector URL');

    // Launch DevTools. We do this using puppeteer because you can't open `chrome://` URLs
    // from the terminal: https://stackoverflow.com/a/35632573
    //
    // DevTools launches in a Chromium instance. We could open dev tools in the user's regular Chrome
    // vs. the bundled Chromium, but puppeteer professes best compatibility with the bundled Chromium
    // https://github.com/GoogleChrome/puppeteer/#q-why-doesnt-puppeteer-vxxx-work-with-chromium-vyyy;
    // it would be a little more configuration to use the regular Chrome; and we should perhaps not
    // assume that the user has regular Chrome open.
    //
    // We cache our browser instance so that the user opens multiple debuggers in tabs vs. in new
    // browsers.
    let page;
    let needToInitializeDevTools = false;  // See where this is used below.
    if (!browser) {
      needToInitializeDevTools = true;

      browser = await puppeteer.launch({
        // So the user can see DevTools.
        headless: false,
        // Disable the default viewport so that DevTools will fill the window.
        defaultViewport: null
      });

      // Clear our variable if/when the user quits the browser it so we'll launch another
      // when next they want to use the debugger.
      browser.on('disconnected', () => {
        browser = null;
        this.emit('invalidated');
      });

      page = (await browser.pages())[0];
    }

    // Either there was no default page or that was already in use by another debugger
    // session.
    if (!page) page = await browser.newPage();

    page.on('close', () => this.emit('invalidated'));

    this._page = page;

    await this._loadDevTools();

    if (!needToInitializeDevTools) return;

    // The first time that DevTools is opened for any page it will open to the Console tab. Switch
    // to the Sources tab (one tabs to the right) and open the Console. Once we've done this for one
    // tab we won't need to do for another, it'll use the same settings.
    //
    // Ideally we would switch tabs just by clicking on the tab, it has a unique ID; but for some
    // reason the tabs don't respond to `click()` at least not when playing around in the console.
    try {
      // We would ideally wait for the Sources tab itself but that's within a shadow root mounted at
      // this element.
      await page.waitForSelector('.tabbed-pane.insertion-point-main', {
        visible: true,
        timeout: 5000
      });

      await page.keyboard.down('Meta');
      await page.keyboard.press('BracketRight');
      await page.keyboard.up('Meta');

      // The Escape key listener only becomes active when the tab content loads. This element is an
      // effective proxy.
      await page.waitForSelector('#sources-panel-sources-view', {
        visible: true,
        timeout: 5000
      });

      await page.keyboard.press('Escape');
    } catch (e) {
      debug('Could not switch to Sources tab and open Console:', e);
    }
  }

  async _loadDevTools() {
    // Open the process' view directly rather than chrome://inspect, both because it's more
    // convenient for the user as well as because chrome://inspect only shows servers on the
    // standard port.
    const queryUrl = this.inspectorUrl.replace(/^wss?:\/\//, '');
    await this._page.goto(`chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=${queryUrl}`);

    if (this._title) {
      await this._page.evaluate((title) => {
        // eslint-disable-next-line no-undef
        document.title = title;
      }, this._title);
    }
  }
}

module.exports = DevToolsClient;
