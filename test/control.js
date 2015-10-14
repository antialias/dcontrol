var sinon = require('sinon');
var Control = require('../control');
var MemoryFileSystem = require("memory-fs");
var mkdirp = require('mkdirp');
var path = require('path');
var running = require('is-running');
var exec = require('child_process').exec;
var assert = require('assert');
var childProcess = require('child_process');
var Promise = require('es6-promise').Promise;
describe('daemon controller', function () {
    var mfs;
    var config;
    var daemonRunning;
    var sandbox;
    var garbagepid;
    var goodpid;
    beforeEach(function () {
        goodpid = '987654321';
        garbagepid = '1234567890';
        sandbox = sinon.sandbox.create();
        sandbox.stub(Control.prototype, '_getDaemonStdio', function () {return 'inherit';});
        daemonRunning = false;
        mfs = new MemoryFileSystem();
        config = {
            fs: mfs,
            pidpath: '/test/pid/path'
        };
    });
    afterEach(function () {
        sandbox.restore();
    });
    describe('config.fs', function () {
        it('should override the default filesystem module', sinon.test(function () {
            var fsMock = this.mock(mfs);
            fsMock.expects('readFileSync').once();
            var control = new Control(config);
            this.stub(control, '_startDaemon'); // make sure that we don't start the daemon
            this.stub(control, 'ensureRunning', control.ensureRunning);
            control.ensureRunning();
            fsMock.verify();
        }));
    });
    describe('ensureStopped', function () {
        var control;
        var numPolls;
        var daemonRunning;
        beforeEach(function () {
            daemonRunning = true;
            control = new Control(config);
            numPolls = 0;
            sandbox.stub(running, 'stub', function (pid) {
                ++numPolls;
                return daemonRunning;
            });
        });
        it("should succeed even if the daemon isn't running", sinon.test(function (done) {
            daemonRunning = false;
            this.stub(Control.prototype, "_getDaemonPID", function () {return garbagepid;});
            control.ensureStopped().then(function () {
                done();
            }, function (err) {
                done(err);
            });
            this.clock.tick(1000);
        }));
        it("should succeed even if the daemon never ran", sinon.test(function (done) {
            daemonRunning = false;
            this.stub(Control.prototype, "_getDaemonPID", function () {return undefined;});
            control.ensureStopped().then(function () {
                done();
            }, function (err) {
                done(err);
            });
            this.clock.tick(1000);
        }));
        it("should start by sending SIGINT to the process", sinon.test(function (done) {
            daemonRunning = true;
            this.stub(Control.prototype, "_getDaemonPID", function () {return goodpid;});
            this.stub(process, 'kill', function (pid, signal) {
                assert.equal(signal, 'SIGINT');
                assert.equal(pid, goodpid);
                done();
            });
            control.ensureStopped();
            daemonRunning = false;
            this.clock.tick(1000);
        }));
        it("should not SIGKILL if SIGINT kills the process before 1000 ms", sinon.test(function (done) {
            daemonRunning = true;
            this.stub(Control.prototype, "_getDaemonPID", function () {return goodpid;});
            var receivedSIGINT = false;
            this.stub(process, 'kill', function (pid, signal) {
                assert.equal(pid, goodpid);
                assert.equal('SIGINT', signal);
                receivedSIGINT = true;
            });
            control.ensureStopped().then(function () {
                assert.equal(receivedSIGINT, true);
                done();
            }, function (err) {
                done(err);
            });
            daemonRunning = false;
            this.clock.tick(1000);
        }));
        it("should send SIGKILL if SIGINT fails to kill the process after 1000 ms", sinon.test(function (done) {
            daemonRunning = true;
            this.stub(Control.prototype, "_getDaemonPID", function () {return goodpid;});
            var receivedSIGKILL = false;
            this.stub(process, 'kill', function (pid, signal) {
                if (signal === 'SIGKILL') {
                    receivedSIGKILL = true;
                    assert.equal(pid, goodpid);
                }
            });
            control.ensureStopped().then(function () {
                assert.equal(receivedSIGKILL, true);
                done();
            }, null).then(null, function (err) {
                done(err);
            });
            this.clock.tick(1000);
            daemonRunning = false;
            this.clock.tick(999);
        }));
        it('should poll the process and resolve the deferred when it has exited', sinon.test(function (done) {
            daemonRunning = true;
            var receivedSIGINT = false;
            var receivedSIGKILL = false;
            this.stub(Control.prototype, "_getDaemonPID", function () {return goodpid;});
            this.stub(process, 'kill', function (pid, signal) {
                assert.equal(pid, goodpid);
                if (signal === 'SIGKILL') {
                    receivedSIGKILL = true;
                } else if (signal === 'SIGKILL') {
                    receivedSIGINT = true;
                }
            });
            control.ensureStopped().then(function () {
                assert.equal(numPolls, 5);
                done();
            }).then(null, function (err) {
                done(err);
            });
            this.clock.tick(100);
            this.clock.tick(100);
            this.clock.tick(100);
            daemonRunning = false;
            this.clock.tick(100);
        }));
    });
    describe('ensureRunning', function () {
        var control;
        var mock;
        beforeEach(function () {
            mkdirp.sync(path.dirname(config.pidpath), {fs: mfs});
            control = new Control(config);
            mock = sandbox.mock(control);
        });
        it('should not start if the process with fakeDaemon.pid is running', function (done) {
            var fakeDaemon;
            var fakeDaemonFinished;
            fakeDaemonFinished = new Promise(function (success) {
                fakeDaemon = exec('sleep 1', success);
            });
            mfs.writeFileSync(config.pidpath, '' + fakeDaemon.pid);
            mock.expects('_startDaemon').never();
            control.ensureRunning();
            mock.verify();
            fakeDaemon.kill();
            fakeDaemonFinished.then(function () {done();});
        });
        it('should start if the process with daemon.pid is not running', function () {
            mfs.writeFileSync(config.pidpath, '1234567890'); // let's hope that isn't a real pid
            mock.expects('_startDaemon').once();
            control.ensureRunning();
            mock.verify();
        });
        describe('_startDaemon', function () {
            beforeEach(function () {
                sandbox.stub(childProcess, 'spawn', function () {
                    return {
                        unref: function () {},
                        pid: goodpid
                    };
                });
            });
            it('should create the containing directory for pidpath if it does not exist', function () {
                mfs = config.fs = new MemoryFileSystem();
                control = new Control(config);
                var errorReadingNonExistentPath = false;
                try {
                    mfs.readFileSync(config.pidpath, 'utf8');
                } catch(e) {
                    errorReadingNonExistentPath = true;
                }
                assert.equal(errorReadingNonExistentPath, true, 'pidpath exists even though we reset the memory filesystem');
                control.ensureRunning();
                daemonpid = mfs.readFileSync(config.pidpath, 'utf8');
                assert.equal(daemonpid, goodpid, 'daemon pid was not what we were expecting');
            });
            it('should record the daemon process id when starting a new daemon', sinon.test(function () {
                var daemonpid;
                mfs.writeFileSync(config.pidpath, garbagepid);
                control.ensureRunning();
                daemonpid = mfs.readFileSync(config.pidpath, 'utf8');
                assert.equal(daemonpid, goodpid, 'pid from child process was not used');
            }));
        });
    });
});
