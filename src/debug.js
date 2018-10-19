let debugFn = () => {};

/**
 * Modules in this package must not use `console.log` lest they overwrite custody's display.
 * Instead, they should use this function.
 *
 * @param {...Any} args - Arguments to pass to the debug function.
 */
module.exports = function debug(...args) {
  return debugFn.apply(this, args);
};

/**
 * Caches the debug function provided by custody when this plugin is initialized for use via
 * `debug`.
 *
 * @param {Function} fn - The debug function provided by custody when this plugin is initialized.
 */
module.exports.setDebugFn = function(fn) {
  debugFn = fn;
};
