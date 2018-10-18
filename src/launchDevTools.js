const puppeteer = require('puppeteer');

let browser = null;

module.exports = async function launchDevTools(inspectorUrl) {
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
    browser.on('disconnected', () => browser = null);

    page = (await browser.pages())[0];
  }

  // Either there was no default page or that was already in use by another debugger
  // session.
  if (!page) page = await browser.newPage();

  // Open the process' view directly rather than chrome://inspect, both because it's more
  // convenient for the user as well as because chrome://inspect only shows servers on the
  // standard port.
  inspectorUrl = inspectorUrl.replace(/^wss?:\/\//, '');
  await page.goto(`chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${inspectorUrl}`);

  if (!needToInitializeDevTools) return;

  // The first time that DevTools is opened for any page it will open to the Elements tab. Switch to
  // the Sources tab (two tabs to the right) and open the Console. Once we've done this for one tab
  // we won't need to do for another, it'll use the same settings.
  //
  // Ideally we would switch tabs just by clicking on the tab, it has a unique ID; but for some
  // reason the tabs don't respond to `click()` at least not when playing around in the console.
  await page.keyboard.down('Meta');
  await page.keyboard.press('BracketRight');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Meta');

  // For some reason, this won't register immediately. I think that it will only work
  // after DevTools has loaded in which case this might be too short on some machines…
  // wish I knew how to listen for DevTools loading. Note that `page#goto` already
  // listened for the 'load' event, so this must be something else.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await page.keyboard.press('Escape');
};
