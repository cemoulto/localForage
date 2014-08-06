!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.localforage=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*jshint latedef:false */

var Promise = require('promise');

/**
 * Drivers
 */
var indexeddb = require('./drivers/indexeddb');
var localstorage = require('./drivers/localstorage');
var websql = require('./drivers/websql');

var DriverType = {
    INDEXEDDB: 'asyncStorage',
    LOCALSTORAGE: 'localStorageWrapper',
    WEBSQL: 'webSQLStorage'
};

var DEFAULT_DRIVER_ORDER = [
    DriverType.INDEXEDDB,
    DriverType.WEBSQL,
    DriverType.LOCALSTORAGE
];

/**
 * Define library methods
 */
var LibraryMethods = [
    'clear',
    'getItem',
    'key',
    'keys',
    'length',
    'removeItem',
    'setItem'
];

/**
 * Export
 */
var localForage = module.exports = {
    INDEXEDDB: DriverType.INDEXEDDB,
    LOCALSTORAGE: DriverType.LOCALSTORAGE,
    WEBSQL: DriverType.WEBSQL,

    _config: {
        description: '',
        name: 'localforage',
        // Default DB size is _JUST UNDER_ 5MB, as it's the highest size
        // we can use without a prompt.
        size: 4980736,
        storeName: 'keyvaluepairs',
        version: 1.0
    },

    // Set any config values for localForage; can be called anytime before
    // the first API call (e.g. `getItem`, `setItem`).
    // We loop through options so we don't overwrite existing config
    // values.
    config: function(options) {
        // If the options argument is an object, we use it to set values.
        // Otherwise, we return either a specified config value or all
        // config values.
        if (typeof(options) === 'object') {
            // If localforage is ready and fully initialized, we can't set
            // any new configuration values. Instead, we return an error.
            if (this._ready) {
                return new Error('Can\'t call config() after localforage ' +
                                 'has been used.');
            }

            for (var i in options) {
                this._config[i] = options[i];
            }

            return true;
        } else if (typeof(options) === 'string') {
            return this._config[options];
        } else {
            return this._config;
        }
    },

    driver: function() {
        return this._driver || null;
    },

    _ready: false,

    _driverSet: null,

    setDriver: function(drivers, callback, errorCallback) {
        var self = this;

        if (typeof drivers === 'string') {
            drivers = [drivers];
        }

        this._driverSet = new Promise(function(resolve, reject) {
            var driverName = self._getFirstSupportedDriver(drivers);

            if (!driverName) {
                var error = new Error('No available storage method found.');
                self._driverSet = Promise.reject(error);

                if (errorCallback) {
                    errorCallback(error);
                }

                reject(error);

                return;
            }

            self._ready = null;
            
            // Extend using appropriate driver
            var driver;
            switch (driverName) {
                case self.INDEXEDDB:
                    driver = indexeddb;
                    break;
                case self.LOCALSTORAGE:
                    driver = localstorage;
                    break;
                case self.WEBSQL:
                    driver = websql;
            }

            self._extend(driver);

            // Return
            if (callback) {
                callback();
            }

            resolve();
        });

        return this._driverSet;
    },

    _getFirstSupportedDriver: function(drivers) {
        var isArray = Array.isArray || function(arg) {
            return Object.prototype.toString.call(arg) === '[object Array]';
        };

        if (drivers && isArray(drivers)) {
            for (var i = 0; i < drivers.length; i++) {
                var driver = drivers[i];

                if (this.supports(driver)) {
                    return driver;
                }
            }
        }

        return null;
    },

    supports: function(driverName) {
        return !!driverSupport[driverName];
    },

    ready: function(callback) {
        var ready = new Promise(function(resolve, reject) {
            localForage._driverSet.then(function() {
                if (localForage._ready === null) {
                    localForage._ready = localForage._initStorage(
                        localForage._config);
                }

                localForage._ready.then(resolve, reject);
            }, reject);
        });

        ready.then(callback, callback);

        return ready;
    },

    _extend: function(libraryMethodsAndProperties) {
        for (var i in libraryMethodsAndProperties) {
            if (libraryMethodsAndProperties.hasOwnProperty(i)) {
                this[i] = libraryMethodsAndProperties[i];
            }
        }
    }
};

// Check to see if IndexedDB is available and if it is the latest
// implementation; it's our preferred backend library. We use "_spec_test"
// as the name of the database because it's not the one we'll operate on,
// but it's useful to make sure its using the right spec.
// See: https://github.com/mozilla/localForage/issues/128
var driverSupport = (function(_this) {
    // Initialize IndexedDB; fall back to vendor-prefixed versions
    // if needed.
    var indexedDB = indexedDB || _this.indexedDB || _this.webkitIndexedDB ||
                    _this.mozIndexedDB || _this.OIndexedDB ||
                    _this.msIndexedDB;

    var result = {};

    result[localForage.WEBSQL] = !!_this.openDatabase;
    result[localForage.INDEXEDDB] = !!(
        indexedDB &&
        typeof indexedDB.open === 'function' &&
        indexedDB.open('_localforage_spec_test', 1)
                 .onupgradeneeded === null
    );

    result[localForage.LOCALSTORAGE] = !!(function() {
        try {
            return (localStorage &&
                    typeof localStorage.setItem === 'function');
        } catch (e) {
            return false;
        }
    })();

    return result;
})(window);

function callWhenReady(libraryMethod) {
    localForage[libraryMethod] = function() {
        var _args = arguments;
        return localForage.ready().then(function() {
            return localForage[libraryMethod].apply(localForage, _args);
        });
    };
}

// Add a stub for each driver API method that delays the call to the
// corresponding driver method until localForage is ready. These stubs will
// be replaced by the driver methods as soon as the driver is loaded, so
// there is no performance impact.
for (var i = 0; i < LibraryMethods.length; i++) {
    callWhenReady(LibraryMethods[i]);
}

localForage.setDriver(DEFAULT_DRIVER_ORDER);

},{"./drivers/indexeddb":6,"./drivers/localstorage":7,"./drivers/websql":8,"promise":4}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(require,module,exports){
'use strict';

var asap = require('asap')

module.exports = Promise
function Promise(fn) {
  if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new')
  if (typeof fn !== 'function') throw new TypeError('not a function')
  var state = null
  var value = null
  var deferreds = []
  var self = this

  this.then = function(onFulfilled, onRejected) {
    return new Promise(function(resolve, reject) {
      handle(new Handler(onFulfilled, onRejected, resolve, reject))
    })
  }

  function handle(deferred) {
    if (state === null) {
      deferreds.push(deferred)
      return
    }
    asap(function() {
      var cb = state ? deferred.onFulfilled : deferred.onRejected
      if (cb === null) {
        (state ? deferred.resolve : deferred.reject)(value)
        return
      }
      var ret
      try {
        ret = cb(value)
      }
      catch (e) {
        deferred.reject(e)
        return
      }
      deferred.resolve(ret)
    })
  }

  function resolve(newValue) {
    try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.')
      if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
        var then = newValue.then
        if (typeof then === 'function') {
          doResolve(then.bind(newValue), resolve, reject)
          return
        }
      }
      state = true
      value = newValue
      finale()
    } catch (e) { reject(e) }
  }

  function reject(newValue) {
    state = false
    value = newValue
    finale()
  }

  function finale() {
    for (var i = 0, len = deferreds.length; i < len; i++)
      handle(deferreds[i])
    deferreds = null
  }

  doResolve(fn, resolve, reject)
}


function Handler(onFulfilled, onRejected, resolve, reject){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null
  this.onRejected = typeof onRejected === 'function' ? onRejected : null
  this.resolve = resolve
  this.reject = reject
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 */
function doResolve(fn, onFulfilled, onRejected) {
  var done = false;
  try {
    fn(function (value) {
      if (done) return
      done = true
      onFulfilled(value)
    }, function (reason) {
      if (done) return
      done = true
      onRejected(reason)
    })
  } catch (ex) {
    if (done) return
    done = true
    onRejected(ex)
  }
}

},{"asap":5}],4:[function(require,module,exports){
'use strict';

//This file contains then/promise specific extensions to the core promise API

var Promise = require('./core.js')
var asap = require('asap')

module.exports = Promise

/* Static Functions */

function ValuePromise(value) {
  this.then = function (onFulfilled) {
    if (typeof onFulfilled !== 'function') return this
    return new Promise(function (resolve, reject) {
      asap(function () {
        try {
          resolve(onFulfilled(value))
        } catch (ex) {
          reject(ex);
        }
      })
    })
  }
}
ValuePromise.prototype = Object.create(Promise.prototype)

var TRUE = new ValuePromise(true)
var FALSE = new ValuePromise(false)
var NULL = new ValuePromise(null)
var UNDEFINED = new ValuePromise(undefined)
var ZERO = new ValuePromise(0)
var EMPTYSTRING = new ValuePromise('')

Promise.resolve = function (value) {
  if (value instanceof Promise) return value

  if (value === null) return NULL
  if (value === undefined) return UNDEFINED
  if (value === true) return TRUE
  if (value === false) return FALSE
  if (value === 0) return ZERO
  if (value === '') return EMPTYSTRING

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then
      if (typeof then === 'function') {
        return new Promise(then.bind(value))
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex)
      })
    }
  }

  return new ValuePromise(value)
}

Promise.from = Promise.cast = function (value) {
  var err = new Error('Promise.from and Promise.cast are deprecated, use Promise.resolve instead')
  err.name = 'Warning'
  console.warn(err.stack)
  return Promise.resolve(value)
}

Promise.denodeify = function (fn, argumentCount) {
  argumentCount = argumentCount || Infinity
  return function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      while (args.length && args.length > argumentCount) {
        args.pop()
      }
      args.push(function (err, res) {
        if (err) reject(err)
        else resolve(res)
      })
      fn.apply(self, args)
    })
  }
}
Promise.nodeify = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
    try {
      return fn.apply(this, arguments).nodeify(callback)
    } catch (ex) {
      if (callback === null || typeof callback == 'undefined') {
        return new Promise(function (resolve, reject) { reject(ex) })
      } else {
        asap(function () {
          callback(ex)
        })
      }
    }
  }
}

Promise.all = function () {
  var calledWithArray = arguments.length === 1 && Array.isArray(arguments[0])
  var args = Array.prototype.slice.call(calledWithArray ? arguments[0] : arguments)

  if (!calledWithArray) {
    var err = new Error('Promise.all should be called with a single array, calling it with multiple arguments is deprecated')
    err.name = 'Warning'
    console.warn(err.stack)
  }

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([])
    var remaining = args.length
    function res(i, val) {
      try {
        if (val && (typeof val === 'object' || typeof val === 'function')) {
          var then = val.then
          if (typeof then === 'function') {
            then.call(val, function (val) { res(i, val) }, reject)
            return
          }
        }
        args[i] = val
        if (--remaining === 0) {
          resolve(args);
        }
      } catch (ex) {
        reject(ex)
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i])
    }
  })
}

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) { 
    reject(value);
  });
}

Promise.race = function (values) {
  return new Promise(function (resolve, reject) { 
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    })
  });
}

/* Prototype Methods */

Promise.prototype.done = function (onFulfilled, onRejected) {
  var self = arguments.length ? this.then.apply(this, arguments) : this
  self.then(null, function (err) {
    asap(function () {
      throw err
    })
  })
}

Promise.prototype.nodeify = function (callback) {
  if (typeof callback != 'function') return this

  this.then(function (value) {
    asap(function () {
      callback(null, value)
    })
  }, function (err) {
    asap(function () {
      callback(err)
    })
  })
}

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
}

},{"./core.js":3,"asap":5}],5:[function(require,module,exports){
(function (process){

// Use the fastest possible means to execute a task in a future turn
// of the event loop.

// linked list of tasks (single, with head node)
var head = {task: void 0, next: null};
var tail = head;
var flushing = false;
var requestFlush = void 0;
var isNodeJS = false;

function flush() {
    /* jshint loopfunc: true */

    while (head.next) {
        head = head.next;
        var task = head.task;
        head.task = void 0;
        var domain = head.domain;

        if (domain) {
            head.domain = void 0;
            domain.enter();
        }

        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function() {
                   throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    flushing = false;
}

if (typeof process !== "undefined" && process.nextTick) {
    // Node.js before 0.9. Note that some fake-Node environments, like the
    // Mocha test runner, introduce a `process` global without a `nextTick`.
    isNodeJS = true;

    requestFlush = function () {
        process.nextTick(flush);
    };

} else if (typeof setImmediate === "function") {
    // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
    if (typeof window !== "undefined") {
        requestFlush = setImmediate.bind(window, flush);
    } else {
        requestFlush = function () {
            setImmediate(flush);
        };
    }

} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    requestFlush = function () {
        channel.port2.postMessage(0);
    };

} else {
    // old browsers
    requestFlush = function () {
        setTimeout(flush, 0);
    };
}

function asap(task) {
    tail = tail.next = {
        task: task,
        domain: isNodeJS && process.domain,
        next: null
    };

    if (!flushing) {
        flushing = true;
        requestFlush();
    }
};

module.exports = asap;


}).call(this,require('_process'))
},{"_process":2}],6:[function(require,module,exports){
// Exclude 'redefinition of {a}' from jshint as we are declaring a local var
// that appears to conflict with the global namespace.
// http://jslinterrors.com/redefinition-of-a
/*jshint -W079 */
/*jshint latedef:false */

// Some code originally from async_storage.js in
// [Gaia](https://github.com/mozilla-b2g/gaia).
// Originally found in https://github.com/mozilla-b2g/gaia/blob/e8f624e4cc9ea945727278039b3bc9bcb9f8667a/shared/js/async_storage.js

// Promises!
var Promise = require('promise');

var db = null;
var dbInfo = {};

// Initialize IndexedDB; fall back to vendor-prefixed versions if needed.
var indexedDB = indexedDB || window.indexedDB || window.webkitIndexedDB ||
                window.mozIndexedDB || window.OIndexedDB ||
                window.msIndexedDB;

// If IndexedDB isn't available, we get outta here!
if (!indexedDB) {
    return;
}

// Open the IndexedDB database (automatically creates one if one didn't
// previously exist), using any options set in the config.
function _initStorage(options) {
    if (options) {
        for (var i in options) {
            dbInfo[i] = options[i];
        }
    }

    return new Promise(function(resolve, reject) {
        var openreq = indexedDB.open(dbInfo.name, dbInfo.version);
        openreq.onerror = function() {
            reject(openreq.error);
        };
        openreq.onupgradeneeded = function() {
            // First time setup: create an empty object store
            openreq.result.createObjectStore(dbInfo.storeName);
        };
        openreq.onsuccess = function() {
            db = openreq.result;
            resolve();
        };
    });
}

function getItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readonly')
                          .objectStore(dbInfo.storeName);
            var req = store.get(key);

            req.onsuccess = function() {
                var value = req.result;
                if (value === undefined) {
                    value = null;
                }

                deferCallback(callback,value);

                resolve(value);
            };

            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

function setItem(key, value, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readwrite')
                          .objectStore(dbInfo.storeName);

            // The reason we don't _save_ null is because IE 10 does
            // not support saving the `null` type in IndexedDB. How
            // ironic, given the bug below!
            // See: https://github.com/mozilla/localForage/issues/161
            if (value === null) {
                value = undefined;
            }

            var req = store.put(value, key);
            req.onsuccess = function() {
                // Cast to undefined so the value passed to
                // callback/promise is the same as what one would get out
                // of `getItem()` later. This leads to some weirdness
                // (setItem('foo', undefined) will return `null`), but
                // it's not my fault localStorage is our baseline and that
                // it's weird.
                if (value === undefined) {
                    value = null;
                }

                deferCallback(callback, value);

                resolve(value);
            };
            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

function removeItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readwrite')
                          .objectStore(dbInfo.storeName);

            // We use a Grunt task to make this safe for IE and some
            // versions of Android (including those used by Cordova).
            // Normally IE won't like `.delete()` and will insist on
            // using `['delete']()`, but we have a build step that
            // fixes this for us now.
            var req = store.delete(key);
            req.onsuccess = function() {

                deferCallback(callback);

                resolve();
            };

            req.onerror = function() {
                if (callback) {
                    callback(req.error);
                }

                reject(req.error);
            };

            // The request will be aborted if we've exceeded our storage
            // space. In this case, we will reject with a specific
            // "QuotaExceededError".
            req.onabort = function(event) {
                var error = event.target.error;
                if (error === 'QuotaExceededError') {
                    if (callback) {
                        callback(error);
                    }

                    reject(error);
                }
            };
        }, reject);
    });
}

function clear(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readwrite')
                          .objectStore(dbInfo.storeName);
            var req = store.clear();

            req.onsuccess = function() {
                deferCallback(callback);

                resolve();
            };

            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

function length(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readonly')
                          .objectStore(dbInfo.storeName);
            var req = store.count();

            req.onsuccess = function() {
                if (callback) {
                    callback(req.result);
                }

                resolve(req.result);
            };

            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

function key(n, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        if (n < 0) {
            if (callback) {
                callback(null);
            }

            resolve(null);

            return;
        }

        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readonly')
                          .objectStore(dbInfo.storeName);

            var advanced = false;
            var req = store.openCursor();
            req.onsuccess = function() {
                var cursor = req.result;
                if (!cursor) {
                    // this means there weren't enough keys
                    if (callback) {
                        callback(null);
                    }

                    resolve(null);

                    return;
                }

                if (n === 0) {
                    // We have the first key, return it if that's what they
                    // wanted.
                    if (callback) {
                        callback(cursor.key);
                    }

                    resolve(cursor.key);
                } else {
                    if (!advanced) {
                        // Otherwise, ask the cursor to skip ahead n
                        // records.
                        advanced = true;
                        cursor.advance(n);
                    } else {
                        // When we get here, we've got the nth key.
                        if (callback) {
                            callback(cursor.key);
                        }

                        resolve(cursor.key);
                    }
                }
            };

            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

function keys(callback) {
    var _this = this;

    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var store = db.transaction(dbInfo.storeName, 'readonly')
                          .objectStore(dbInfo.storeName);

            var req = store.openCursor();
            var keys = [];

            req.onsuccess = function() {
                var cursor = req.result;

                if (!cursor) {
                    if (callback) {
                        callback(keys);
                    }

                    resolve(keys);
                    return;
                }

                keys.push(cursor.key);
                cursor.continue();
            };

            req.onerror = function() {
                if (callback) {
                    callback(null, req.error);
                }

                reject(req.error);
            };
        }, reject);
    });
}

// Under Chrome the callback is called before the changes (save, clear)
// are actually made. So we use a defer function which wait that the
// call stack to be empty.
// For more info : https://github.com/mozilla/localForage/issues/175
// Pull request : https://github.com/mozilla/localForage/pull/178
function deferCallback(callback, value) {
    if (callback) {
        return setTimeout(function() {
            return callback(value);
        }, 0);
    }
}

module.exports = {
    _driver: 'asyncStorage',
    _initStorage: _initStorage,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    length: length,
    key: key,
    keys: keys
};
},{"promise":4}],7:[function(require,module,exports){
// Exclude 'redefinition of {a}' from jshint as we are declaring a local var
// that appears to conflict with the global namespace.
// http://jslinterrors.com/redefinition-of-a
/*jshint -W079 */
/*jshint -W020 */
/*jshint latedef:false */

// If IndexedDB isn't available, we'll fall back to localStorage.
// Note that this will have considerable performance and storage
// side-effects (all data will be serialized on save and only data that
// can be converted to a string via `JSON.stringify()` will be saved).

var Promise = require('promise');

var keyPrefix = '';
var dbInfo = {};

var localStorage = null;

// If the app is running inside a Google Chrome packaged webapp, or some
// other context where localStorage isn't available, we don't use
// localStorage. This feature detection is preferred over the old
// `if (window.chrome && window.chrome.runtime)` code.
// See: https://github.com/mozilla/localForage/issues/68
try {
    // If localStorage isn't available, we get outta here!
    // This should be inside a try catch
    if (!window.localStorage || !('setItem' in window.localStorage)) {
        return;
    }
    // Initialize localStorage and create a variable to use throughout
    // the code.
    localStorage = window.localStorage;
} catch (e) {
    return;
}

// Config the localStorage backend, using options set in the config.
function _initStorage(options) {
    if (options) {
        for (var i in options) {
            dbInfo[i] = options[i];
        }
    }

    keyPrefix = dbInfo.name + '/';

    return Promise.resolve();
}

var SERIALIZED_MARKER = '__lfsc__:';
var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;

// OMG the serializations!
var TYPE_ARRAYBUFFER = 'arbf';
var TYPE_BLOB = 'blob';
var TYPE_INT8ARRAY = 'si08';
var TYPE_UINT8ARRAY = 'ui08';
var TYPE_UINT8CLAMPEDARRAY = 'uic8';
var TYPE_INT16ARRAY = 'si16';
var TYPE_INT32ARRAY = 'si32';
var TYPE_UINT16ARRAY = 'ur16';
var TYPE_UINT32ARRAY = 'ui32';
var TYPE_FLOAT32ARRAY = 'fl32';
var TYPE_FLOAT64ARRAY = 'fl64';
var TYPE_SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER_LENGTH +
                                    TYPE_ARRAYBUFFER.length;

// Remove all keys from the datastore, effectively destroying all data in
// the app's key/value store!
function clear(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            localStorage.clear();

            if (callback) {
                callback();
            }

            resolve();
        }, reject);
    });
}

// Retrieve an item from the store. Unlike the original async_storage
// library in Gaia, we don't modify return values at all. If a key's value
// is `undefined`, we pass that value to the callback function.
function getItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            try {
                var result = localStorage.getItem(keyPrefix + key);

                // If a result was found, parse it from the serialized
                // string into a JS object. If result isn't truthy, the key
                // is likely undefined and we'll pass it straight to the
                // callback.
                if (result) {
                    result = _deserialize(result);
                }

                if (callback) {
                    callback(result);
                }

                resolve(result);
            } catch (e) {
                if (callback) {
                    callback(null, e);
                }

                reject(e);
            }
        }, reject);
    });
}

// Same as localStorage's key() method, except takes a callback.
function key(n, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var result;
            try {
                result = localStorage.key(n);
            } catch (error) {
                result = null;
            }

            // Remove the prefix from the key, if a key is found.
            if (result) {
                result = result.substring(keyPrefix.length);
            }

            if (callback) {
                callback(result);
            }
            resolve(result);
        }, reject);
    });
}

function keys(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var length = localStorage.length;
            var keys = [];

            for (var i = 0; i < length; i++) {
                keys.push(localStorage.key(i).substring(keyPrefix.length));
            }

            if (callback) {
                callback(keys);
            }

            resolve(keys);
        }, reject);
    });
}

// Supply the number of keys in the datastore to the callback function.
function length(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            var result = localStorage.length;

            if (callback) {
                callback(result);
            }

            resolve(result);
        }, reject);
    });
}

// Remove an item from the store, nice and simple.
function removeItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            localStorage.removeItem(keyPrefix + key);

            if (callback) {
                callback();
            }

            resolve();
        }, reject);
    });
}

// Deserialize data we've inserted into a value column/field. We place
// special markers into our strings to mark them as encoded; this isn't
// as nice as a meta field, but it's the only sane thing we can do whilst
// keeping localStorage support intact.
//
// Oftentimes this will just deserialize JSON content, but if we have a
// special marker (SERIALIZED_MARKER, defined above), we will extract
// some kind of arraybuffer/binary data/typed array out of the string.
function _deserialize(value) {
    // If we haven't marked this string as being specially serialized (i.e.
    // something other than serialized JSON), we can just return it and be
    // done with it.
    if (value.substring(0,
        SERIALIZED_MARKER_LENGTH) !== SERIALIZED_MARKER) {
        return JSON.parse(value);
    }

    // The following code deals with deserializing some kind of Blob or
    // TypedArray. First we separate out the type of data we're dealing
    // with from the data itself.
    var serializedString = value.substring(TYPE_SERIALIZED_MARKER_LENGTH);
    var type = value.substring(SERIALIZED_MARKER_LENGTH,
                               TYPE_SERIALIZED_MARKER_LENGTH);

    // Fill the string into a ArrayBuffer.
    // 2 bytes for each char.
    var buffer = new ArrayBuffer(serializedString.length * 2);
    var bufferView = new Uint16Array(buffer);
    for (var i = serializedString.length - 1; i >= 0; i--) {
        bufferView[i] = serializedString.charCodeAt(i);
    }

    // Return the right type based on the code/type set during
    // serialization.
    switch (type) {
        case TYPE_ARRAYBUFFER:
            return buffer;
        case TYPE_BLOB:
            return new Blob([buffer]);
        case TYPE_INT8ARRAY:
            return new Int8Array(buffer);
        case TYPE_UINT8ARRAY:
            return new Uint8Array(buffer);
        case TYPE_UINT8CLAMPEDARRAY:
            return new Uint8ClampedArray(buffer);
        case TYPE_INT16ARRAY:
            return new Int16Array(buffer);
        case TYPE_UINT16ARRAY:
            return new Uint16Array(buffer);
        case TYPE_INT32ARRAY:
            return new Int32Array(buffer);
        case TYPE_UINT32ARRAY:
            return new Uint32Array(buffer);
        case TYPE_FLOAT32ARRAY:
            return new Float32Array(buffer);
        case TYPE_FLOAT64ARRAY:
            return new Float64Array(buffer);
        default:
            throw new Error('Unkown type: ' + type);
    }
}

// Converts a buffer to a string to store, serialized, in the backend
// storage library.
function _bufferToString(buffer) {
    var str = '';
    var uint16Array = new Uint16Array(buffer);

    try {
        str = String.fromCharCode.apply(null, uint16Array);
    } catch (e) {
        // This is a fallback implementation in case the first one does
        // not work. This is required to get the phantomjs passing...
        for (var i = 0; i < uint16Array.length; i++) {
            str += String.fromCharCode(uint16Array[i]);
        }
    }

    return str;
}

// Serialize a value, afterwards executing a callback (which usually
// instructs the `setItem()` callback/promise to be executed). This is how
// we store binary data with localStorage.
function _serialize(value, callback) {
    var valueString = '';
    if (value) {
        valueString = value.toString();
    }

    // Cannot use `value instanceof ArrayBuffer` or such here, as these
    // checks fail when running the tests using casper.js...
    //
    // TODO: See why those tests fail and use a better solution.
    if (value && (value.toString() === '[object ArrayBuffer]' ||
                  value.buffer && value.buffer.toString() === '[object ArrayBuffer]')) {
        // Convert binary arrays to a string and prefix the string with
        // a special marker.
        var buffer;
        var marker = SERIALIZED_MARKER;

        if (value instanceof ArrayBuffer) {
            buffer = value;
            marker += TYPE_ARRAYBUFFER;
        } else {
            buffer = value.buffer;

            if (valueString === '[object Int8Array]') {
                marker += TYPE_INT8ARRAY;
            } else if (valueString === '[object Uint8Array]') {
                marker += TYPE_UINT8ARRAY;
            } else if (valueString === '[object Uint8ClampedArray]') {
                marker += TYPE_UINT8CLAMPEDARRAY;
            } else if (valueString === '[object Int16Array]') {
                marker += TYPE_INT16ARRAY;
            } else if (valueString === '[object Uint16Array]') {
                marker += TYPE_UINT16ARRAY;
            } else if (valueString === '[object Int32Array]') {
                marker += TYPE_INT32ARRAY;
            } else if (valueString === '[object Uint32Array]') {
                marker += TYPE_UINT32ARRAY;
            } else if (valueString === '[object Float32Array]') {
                marker += TYPE_FLOAT32ARRAY;
            } else if (valueString === '[object Float64Array]') {
                marker += TYPE_FLOAT64ARRAY;
            } else {
                callback(new Error("Failed to get type for BinaryArray"));
            }
        }

        callback(marker + _bufferToString(buffer));
    } else if (valueString === "[object Blob]") {
        // Conver the blob to a binaryArray and then to a string.
        var fileReader = new FileReader();

        fileReader.onload = function() {
            var str = _bufferToString(this.result);

            callback(SERIALIZED_MARKER + TYPE_BLOB + str);
        };

        fileReader.readAsArrayBuffer(value);
    } else {
        try {
            callback(JSON.stringify(value));
        } catch (e) {
            if (this.console && this.console.error) {
                this.console.error("Couldn't convert value into a JSON string: ", value);
            }

            callback(null, e);
        }
    }
}

// Set a key's value and run an optional callback once the value is set.
// Unlike Gaia's implementation, the callback function is passed the value,
// in case you want to operate on that value only after you're sure it
// saved, or something like that.
function setItem(key, value, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            // Convert undefined values to null.
            // https://github.com/mozilla/localForage/pull/42
            if (value === undefined) {
                value = null;
            }

            // Save the original value to pass to the callback.
            var originalValue = value;

            _serialize(value, function(value, error) {
                if (error) {
                    if (callback) {
                        callback(null, error);
                    }

                    reject(error);
                } else {
                    try {
                        localStorage.setItem(keyPrefix + key, value);
                    } catch (e) {
                        // localStorage capacity exceeded.
                        // TODO: Make this a specific error/event.
                        if (e.name === 'QuotaExceededError' ||
                            e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                            if (callback) {
                                callback(null, e);
                            }

                            reject(e);
                        }
                    }

                    if (callback) {
                        callback(originalValue);
                    }

                    resolve(originalValue);
                }
            });
        }, reject);
    });
}

module.exports = {
    _driver: 'localStorageWrapper',
    _initStorage: _initStorage,
    // Default API, from Gaia/localStorage.
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    length: length,
    key: key,
    keys: keys
};
},{"promise":4}],8:[function(require,module,exports){
// Exclude 'redefinition of {a}' from jshint as we are declaring a local var
// that appears to conflict with the global namespace.
// http://jslinterrors.com/redefinition-of-a
/*jshint -W079 */
/*jshint latedef:false */

/*
 * Includes code from:
 *
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */

var Promise = require('promise');

// Sadly, the best way to save binary data in WebSQL is Base64 serializing
// it, so this is how we store it to prevent very strange errors with less
// verbose ways of binary <-> string data storage.
var BASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

var openDatabase = window.openDatabase;
var db = null;
var dbInfo = {};

var SERIALIZED_MARKER = '__lfsc__:';
var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;

// OMG the serializations!
var TYPE_ARRAYBUFFER = 'arbf';
var TYPE_BLOB = 'blob';
var TYPE_INT8ARRAY = 'si08';
var TYPE_UINT8ARRAY = 'ui08';
var TYPE_UINT8CLAMPEDARRAY = 'uic8';
var TYPE_INT16ARRAY = 'si16';
var TYPE_INT32ARRAY = 'si32';
var TYPE_UINT16ARRAY = 'ur16';
var TYPE_UINT32ARRAY = 'ui32';
var TYPE_FLOAT32ARRAY = 'fl32';
var TYPE_FLOAT64ARRAY = 'fl64';
var TYPE_SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER_LENGTH + TYPE_ARRAYBUFFER.length;

// If WebSQL methods aren't available, we can stop now.
if (!openDatabase) {
    return;
}

// Open the WebSQL database (automatically creates one if one didn't
// previously exist), using any options set in the config.
function _initStorage(options) {
    var _this = this;

    if (options) {
        for (var i in options) {
            dbInfo[i] = typeof(options[i]) !== 'string' ? options[i].toString() : options[i];
        }
    }

    return new Promise(function(resolve, reject) {
        // Open the database; the openDatabase API will automatically
        // create it for us if it doesn't exist.
        try {
            db = openDatabase(dbInfo.name, dbInfo.version,
                              dbInfo.description, dbInfo.size);
        } catch (e) {
            return _this.setDriver('localStorageWrapper').then(resolve, reject);
        }

        // Create our key/value table if it doesn't exist.
        db.transaction(function(t) {
            t.executeSql('CREATE TABLE IF NOT EXISTS ' + dbInfo.storeName +
                         ' (id INTEGER PRIMARY KEY, key unique, value)', [], function() {
                resolve();
            }, function(t, error) {
                reject(error);
            });
        });
    });
}

function getItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                t.executeSql('SELECT * FROM ' + dbInfo.storeName +
                             ' WHERE key = ? LIMIT 1', [key], function(t, results) {
                    var result = results.rows.length ? results.rows.item(0).value : null;

                    // Check to see if this is serialized content we need to
                    // unpack.
                    if (result) {
                        result = _deserialize(result);
                    }

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, function(t, error) {
                    if (callback) {
                        callback(null, error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

function setItem(key, value, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            // The localStorage API doesn't return undefined values in an
            // "expected" way, so undefined is always cast to null in all
            // drivers. See: https://github.com/mozilla/localForage/pull/42
            if (value === undefined) {
                value = null;
            }

            // Save the original value to pass to the callback.
            var originalValue = value;

            _serialize(value, function(value, error) {
                if (error) {
                    reject(error);
                } else {
                    db.transaction(function(t) {
                        t.executeSql('INSERT OR REPLACE INTO ' + dbInfo.storeName +
                                     ' (key, value) VALUES (?, ?)', [key, value], function() {
                            if (callback) {
                                callback(originalValue);
                            }

                            resolve(originalValue);
                        }, function(t, error) {
                            if (callback) {
                                callback(null, error);
                            }

                            reject(error);
                        });
                    }, function(sqlError) { // The transaction failed; check
                                            // to see if it's a quota error.
                        if (sqlError.code === sqlError.QUOTA_ERR) {
                            // We reject the callback outright for now, but
                            // it's worth trying to re-run the transaction.
                            // Even if the user accepts the prompt to use
                            // more storage on Safari, this error will
                            // be called.
                            //
                            // TODO: Try to re-run the transaction.
                            if (callback) {
                                callback(null, sqlError);
                            }

                            reject(sqlError);
                        }
                    });
                }
            });
        }, reject);
    });
}

function removeItem(key, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                t.executeSql('DELETE FROM ' + dbInfo.storeName +
                             ' WHERE key = ?', [key], function() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, function(t, error) {
                    if (callback) {
                        callback(error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

// Deletes every item in the table.
// TODO: Find out if this resets the AUTO_INCREMENT number.
function clear(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                t.executeSql('DELETE FROM ' + dbInfo.storeName, [], function() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, function(t, error) {
                    if (callback) {
                        callback(error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

// Does a simple `COUNT(key)` to get the number of items stored in
// localForage.
function length(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                // Ahhh, SQL makes this one soooooo easy.
                t.executeSql('SELECT COUNT(key) as c FROM ' +
                             dbInfo.storeName, [], function(t, results) {
                    var result = results.rows.item(0).c;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, function(t, error) {
                    if (callback) {
                        callback(null, error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

// Return the key located at key index X; essentially gets the key from a
// `WHERE id = ?`. This is the most efficient way I can think to implement
// this rarely-used (in my experience) part of the API, but it can seem
// inconsistent, because we do `INSERT OR REPLACE INTO` on `setItem()`, so
// the ID of each key will change every time it's updated. Perhaps a stored
// procedure for the `setItem()` SQL would solve this problem?
// TODO: Don't change ID on `setItem()`.
function key(n, callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                t.executeSql('SELECT key FROM ' + dbInfo.storeName +
                             ' WHERE id = ? LIMIT 1', [n + 1], function(t, results) {
                    var result = results.rows.length ? results.rows.item(0).key : null;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, function(t, error) {
                    if (callback) {
                        callback(null, error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

function keys(callback) {
    var _this = this;
    return new Promise(function(resolve, reject) {
        _this.ready().then(function() {
            db.transaction(function(t) {
                t.executeSql('SELECT key FROM ' + dbInfo.storeName, [],
                             function(t, results) {
                    var length = results.rows.length;
                    var keys = [];

                    for (var i = 0; i < length; i++) {
                        keys.push(results.rows.item(i).key);
                    }

                    if (callback) {
                        callback(keys);
                    }

                    resolve(keys);
                }, function(t, error) {
                    if (callback) {
                        callback(null, error);
                    }

                    reject(error);
                });
            });
        }, reject);
    });
}

// Converts a buffer to a string to store, serialized, in the backend
// storage library.
function _bufferToString(buffer) {
    // base64-arraybuffer
    var bytes = new Uint8Array(buffer);
    var i;
    var base64String = '';

    for (i = 0; i < bytes.length; i += 3) {
        /*jslint bitwise: true */
        base64String += BASE_CHARS[bytes[i] >> 2];
        base64String += BASE_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64String += BASE_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64String += BASE_CHARS[bytes[i + 2] & 63];
    }

    if ((bytes.length % 3) === 2) {
        base64String = base64String.substring(0, base64String.length - 1) + "=";
    } else if (bytes.length % 3 === 1) {
        base64String = base64String.substring(0, base64String.length - 2) + "==";
    }

    return base64String;
}

// Deserialize data we've inserted into a value column/field. We place
// special markers into our strings to mark them as encoded; this isn't
// as nice as a meta field, but it's the only sane thing we can do whilst
// keeping localStorage support intact.
//
// Oftentimes this will just deserialize JSON content, but if we have a
// special marker (SERIALIZED_MARKER, defined above), we will extract
// some kind of arraybuffer/binary data/typed array out of the string.
function _deserialize(value) {
    // If we haven't marked this string as being specially serialized (i.e.
    // something other than serialized JSON), we can just return it and be
    // done with it.
    if (value.substring(0, SERIALIZED_MARKER_LENGTH) !== SERIALIZED_MARKER) {
        return JSON.parse(value);
    }

    // The following code deals with deserializing some kind of Blob or
    // TypedArray. First we separate out the type of data we're dealing
    // with from the data itself.
    var serializedString = value.substring(TYPE_SERIALIZED_MARKER_LENGTH);
    var type = value.substring(SERIALIZED_MARKER_LENGTH, TYPE_SERIALIZED_MARKER_LENGTH);

    // Fill the string into a ArrayBuffer.
    var bufferLength = serializedString.length * 0.75;
    var len = serializedString.length;
    var i;
    var p = 0;
    var encoded1, encoded2, encoded3, encoded4;

    if (serializedString[serializedString.length - 1] === "=") {
        bufferLength--;
        if (serializedString[serializedString.length - 2] === "=") {
            bufferLength--;
        }
    }

    var buffer = new ArrayBuffer(bufferLength);
    var bytes = new Uint8Array(buffer);

    for (i = 0; i < len; i+=4) {
        encoded1 = BASE_CHARS.indexOf(serializedString[i]);
        encoded2 = BASE_CHARS.indexOf(serializedString[i+1]);
        encoded3 = BASE_CHARS.indexOf(serializedString[i+2]);
        encoded4 = BASE_CHARS.indexOf(serializedString[i+3]);

        /*jslint bitwise: true */
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    // Return the right type based on the code/type set during
    // serialization.
    switch (type) {
        case TYPE_ARRAYBUFFER:
            return buffer;
        case TYPE_BLOB:
            return new Blob([buffer]);
        case TYPE_INT8ARRAY:
            return new Int8Array(buffer);
        case TYPE_UINT8ARRAY:
            return new Uint8Array(buffer);
        case TYPE_UINT8CLAMPEDARRAY:
            return new Uint8ClampedArray(buffer);
        case TYPE_INT16ARRAY:
            return new Int16Array(buffer);
        case TYPE_UINT16ARRAY:
            return new Uint16Array(buffer);
        case TYPE_INT32ARRAY:
            return new Int32Array(buffer);
        case TYPE_UINT32ARRAY:
            return new Uint32Array(buffer);
        case TYPE_FLOAT32ARRAY:
            return new Float32Array(buffer);
        case TYPE_FLOAT64ARRAY:
            return new Float64Array(buffer);
        default:
            throw new Error('Unkown type: ' + type);
    }
}

// Serialize a value, afterwards executing a callback (which usually
// instructs the `setItem()` callback/promise to be executed). This is how
// we store binary data with localStorage.
function _serialize(value, callback) {
    var valueString = '';
    if (value) {
        valueString = value.toString();
    }

    // Cannot use `value instanceof ArrayBuffer` or such here, as these
    // checks fail when running the tests using casper.js...
    //
    // TODO: See why those tests fail and use a better solution.
    if (value && (value.toString() === '[object ArrayBuffer]' ||
                  value.buffer && value.buffer.toString() === '[object ArrayBuffer]')) {
        // Convert binary arrays to a string and prefix the string with
        // a special marker.
        var buffer;
        var marker = SERIALIZED_MARKER;

        if (value instanceof ArrayBuffer) {
            buffer = value;
            marker += TYPE_ARRAYBUFFER;
        } else {
            buffer = value.buffer;

            if (valueString === '[object Int8Array]') {
                marker += TYPE_INT8ARRAY;
            } else if (valueString === '[object Uint8Array]') {
                marker += TYPE_UINT8ARRAY;
            } else if (valueString === '[object Uint8ClampedArray]') {
                marker += TYPE_UINT8CLAMPEDARRAY;
            } else if (valueString === '[object Int16Array]') {
                marker += TYPE_INT16ARRAY;
            } else if (valueString === '[object Uint16Array]') {
                marker += TYPE_UINT16ARRAY;
            } else if (valueString === '[object Int32Array]') {
                marker += TYPE_INT32ARRAY;
            } else if (valueString === '[object Uint32Array]') {
                marker += TYPE_UINT32ARRAY;
            } else if (valueString === '[object Float32Array]') {
                marker += TYPE_FLOAT32ARRAY;
            } else if (valueString === '[object Float64Array]') {
                marker += TYPE_FLOAT64ARRAY;
            } else {
                callback(new Error("Failed to get type for BinaryArray"));
            }
        }

        callback(marker + _bufferToString(buffer));
    } else if (valueString === "[object Blob]") {
        // Conver the blob to a binaryArray and then to a string.
        var fileReader = new FileReader();

        fileReader.onload = function() {
            var str = _bufferToString(this.result);

            callback(SERIALIZED_MARKER + TYPE_BLOB + str);
        };

        fileReader.readAsArrayBuffer(value);
    } else {
        try {
            callback(JSON.stringify(value));
        } catch (e) {
            if (this.console && this.console.error) {
                this.console.error("Couldn't convert value into a JSON string: ", value);
            }

            callback(null, e);
        }
    }
}

module.exports = {
    _driver: 'webSQLStorage',
    _initStorage: _initStorage,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    length: length,
    key: key,
    keys: keys
};
},{"promise":4}]},{},[1])(1)
});