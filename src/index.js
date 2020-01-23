const { updateDevTools, launchDevTools } = require('./devtools');
const { setDebugFn } = require('./debug');

const DEFAULT_KEY = 'd';

/**
 * Determines if we can launch the debugger for the specified process.
 *
 * Only Node processes instrumented with `custody-probe>=0.3.0` can be debugged.
 *
 * @param {Process} process - A custody process.
 *
 * @return {Boolean} `true` iff we can debug the process.
 */
function canDebugProcess(process) {
  // The first condition here filters for the use of `custody-probe` (and processes being Node). The
  // second filters for `custody-probe>=0.3.0`, which provides us `child.pid` and
  // `child.inspectorUrl` as well as overriding 'SIGUSR1' handling to dynamically assign a port to
  // the inspector.
  return process.child && process.child.pid;
}

module.exports = function({ debug }, opts) {
  setDebugFn(debug);

  return {
    update(process) {
      if (!canDebugProcess(process)) return;

      updateDevTools(process).catch((e) => debug('Could not launch debugger:', e));
    },

    commands(process) {
      if (!canDebugProcess(process)) return [];

      return [
        [
          opts.key || DEFAULT_KEY,
          {
            verb: 'launch debugger',
            toggle() {
              return launchDevTools(process, {
                // Bring DevTools to the foreground if it was previously open.
                activateAfterLaunch: true,
              });
            },
          },
        ],
      ];
    },
  };
};
