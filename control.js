var spawn = require('child_process').spawn;
var running = require('is-running');
var Control = module.exports = function (config) {
    this._fs = config.fs || require('fs');
    this._config = config;
};
Control.prototype._startDaemon = function () {
    var child = spawn('node', ['./daemon.js'], {
        stdio: ['ignore', this._fs.openSync('./stdout.out', 'w'), this._fs.openSync('./stderr.out', 'w')],
        detached: true
    });
    child.unref(); // now safe to exit the current process without killing the daemon
};
Control.prototype.ensureRunning = function () {
    var daemonpid = this._fs.readFileSync(this._config.pidpath, 'utf8');
    if (running(daemonpid)) {
        return;
    }
    this._startDaemon(); // daemon is not running, so start it
};
