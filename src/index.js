const launchDevTools = require('./launchDevTools');

const DEFAULT_KEY = 'd';

let pidAwaitingDebugger = null;

module.exports = function({ debug }) {
  return {
    // TODO(jeff): Reconnect the debugger if the user restarts the process.
    update(process) {
      if (!process.child || (process.child.pid !== pidAwaitingDebugger) || !process.child.inspectorUrl) {
        return;
      }

      launchDevTools(process.child.inspectorUrl).catch((err) => {
        debug('Could not launch debugger:', err);
      });
      pidAwaitingDebugger = null;
    },

    commands(process, { opts }) {
      if (!process.child || !process.child.pid) {
        // The process is not instrumented with `custody-probe>=0.3.0`. Reliance on `custody-probe`
        // also conveniently filters for Node processes.
        return [];
      }

      return [
        [opts.key || DEFAULT_KEY, {
          get verb() {
            return 'launch debugger';
          },

          async toggle() {
            // Start the debugger if necessary. We'll then launch DevTools when the process updates
            // with the inspector URL.
            if (!process.child.inspectorUrl) {
              pidAwaitingDebugger = process.child.pid;
              global.process.kill(process.child.pid, 'SIGUSR1');
              return;
            }

            // The debugger was previously started. Launch the client now.
            return launchDevTools(process.child.inspectorUrl);
          }
        }]
      ];
    }
  };
};
