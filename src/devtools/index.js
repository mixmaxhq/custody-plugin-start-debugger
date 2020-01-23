const DevToolsClient = require('./DevToolsClient');

/**
 * @type {Map<String, DevToolsClient>}
 *
 * Retains active DevTools clients (i.e. where the browser tab is still open) so that they can be
 * updated by `updateDevTools`.
 *
 * Derive the map keys using `clientKey`.
 */
const activeClients = new Map();

/**
 * Derives the key to use to to look up an active DevTools client for a given process.
 *
 * @param {Process} process - A custody process.
 *
 * @return {String} A key into `activeClients`.
 */
function clientKey(process) {
  return process.name;
}

/**
 * Starts the debugger for a given process. A call to `updateDevTools`, when the process updates
 * with the inspector URL, will then launch the client.
 *
 * @param {Process} process - A custody process.
 */
function startDebugger(process) {
  global.process.kill(process.child.pid, 'SIGUSR1');
}

/**
 * Launches DevTools to debug a given process.
 *
 * If the process has not started the debugger, this function will start the debugger. This function
 * must then be called again once the debugger has been started, at which point it will finally
 * launch DevTools.
 *
 * This function is idempotent if DevTools is already open and connected to the debugger for a given
 * process, though `activateAfterLaunch: true` may be passed to bring DevTools to the front.
 *
 * If DevTools is open, but disconnected from the debugger, this function will reconnect it. If
 * DevTools was disconnected because the process had stopped the debugger, this function will
 * restart it, but must be called again once the debugger has started in order to reconnect to the
 * debugger.
 *
 * @param {Process} process - A custody process.
 * @param {Object} opts
 *  @property {Boolean=false} activateAfterLaunch - Whether to activate the DevTools tab (bring it
 *    and the browser to the front) after the page launches.
 */
async function launchDevTools(process, { activateAfterLaunch = false } = {}) {
  const key = clientKey(process);

  let client = activeClients.get(key);
  if (client) {
    if (!process.child.inspectorUrl) {
      if (client.inspectorUrl) {
        // The inspector shut down; restart it. The debugger tab may be reloaded by calling
        // `launchDevTools` after the debugger has started.
        startDebugger(process);
      } else {
        // We already sent 'SIGUSR1' to the process below; nothing more to do until it starts the
        // debugger.
      }
      return;
    }

    // Set the inspector URL if it hadn't previously been set, and reload the debugger tab if
    // necessary.
    await client.setInspectorUrl(process.child.inspectorUrl);

    // Launch the debugger if it hadn't previously been launched.
    await client.launch();

    if (activateAfterLaunch) await client.activate();
  } else {
    if (!process.child.inspectorUrl) startDebugger(process);

    client = new DevToolsClient(process.child.inspectorUrl, {
      title: process.name,
    });

    if (client.inspectorUrl) {
      // The debugger was previously started. Launch the client now.
      await client.launch();

      if (activateAfterLaunch) await client.activate();
    } else {
      // The client may be launched by calling `launchDevTools` after the debugger has started.
    }

    activeClients.set(process.name, client);

    client.on('invalidated', () => {
      if (activeClients.get(key) === client) {
        activeClients.delete(key);
      }
    });
  }
}

/**
 * (Re)connects an existing DevTools client, previously created by `launchDevTools`, to the given
 * process. Call this after the process has started the debugger.
 *
 * The difference between this function and calling `launchDevTools` repeatedly is that this
 * function will only open DevTools for a process if that process had previously been passed to
 * `launchDevTools`.
 *
 * @param {Process} process - A custody process.
 */
async function updateDevTools(process) {
  const client = activeClients.get(clientKey(process));

  // The process is not being debugged.
  if (!client) return;

  // We sent SIGUSR1 to the process but it still hasn't started the inspector.
  if (!client.inspectorUrl && !process.child.inspectorUrl) return;

  // The URL is up to date.
  if (client.inspectorUrl === process.child.inspectorUrl) return;

  return launchDevTools(process);
}

module.exports = {
  launchDevTools,
  updateDevTools,
};
