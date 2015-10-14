var childProcess = require('child_process');
var running = require('is-running');
var path = require('path');
var mkdirp = require('mkdirp');
var Promise = require('es6-promise').Promise;
var Control = module.exports = function (config) {
    this._fs = config.fs || require('fs');
    this._config = config;
};
Control.prototype._startDaemon = function () {
    var child = childProcess.spawn('node', [path.join(process.cwd(), this._config.daemonModulePath)], {
        stdio: this._getDaemonStdio(),
        detached: true
    });
    mkdirp.sync(path.dirname(this._config.pidpath), {fs: this._fs});
    this._fs.writeFileSync(this._config.pidpath, '' + child.pid);
    child.unref(); // now safe to exit the current process without killing the daemon
};
Control.prototype._getDaemonStdio = function () {
    return ['ignore', this._fs.openSync('./stdout.out', 'w'), this._fs.openSync('./stderr.out', 'w')];
};

Control.prototype._getDaemonPID = function () {
    try {
        return this._fs.readFileSync(this._config.pidpath, 'utf8');
    } catch (e) {
        if ('ENOENT' === e.code) {
            return undefined;
        }
        throw e;
    }
};
Control.prototype.ensureStopped = function () {
    var daemonpid = this._getDaemonPID();
    var forceKillTimeout;
    var giveUpTimeout;
    var pollInterval;
    var clearAsyncStuff;
    clearAsyncStuff = function () {
        clearTimeout(giveUpTimeout);
        clearTimeout(forceKillTimeout);
        clearInterval(pollInterval);
    };
    return new Promise(function (success, reject) {
        if (undefined === daemonpid) {
            success(); // daemon never ran
            return;
        }
        if (!running(daemonpid)) {
            success();
            return;
        }
        process.kill(daemonpid, 'SIGINT');
        pollInterval = setInterval(function () {
            if (!running(daemonpid)) {
                clearAsyncStuff();
                success();
            }
        }, 100);
        forceKillTimeout = setTimeout(function () {
            process.kill(daemonpid, 'SIGKILL');
        }, 1000);
        giveUpTimeout = setTimeout(function () {
            reject("could not kill daemon");
        }, 1500);
    }).then(function () {
        clearAsyncStuff();
    }, function (err) {
        clearAsyncStuff();
        throw err;
    });
};
Control.prototype.ensureRunning = function () {
    var daemonpid = this._getDaemonPID();
    if (undefined !== daemonpid && running(daemonpid)) {
        console.log('daemon for ' + this._config.daemonModulePath + ' is already running');
        return;
    }
    this._startDaemon(); // daemon is not running, so start it
};
