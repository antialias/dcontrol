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
    beforeEach(function () {
        daemonRunning = false;
        mfs = new MemoryFileSystem();
        config = {
            fs: mfs,
            pidpath: '/test/pid/path'
        };
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
    describe('ensureRunning', function () {
        var sandbox;
        var control;
        var mock;
        beforeEach(function () {
            sandbox = sinon.sandbox.create();
            mkdirp.sync(path.dirname(config.pidpath), {fs: mfs});
            control = new Control(config);
            mock = sandbox.mock(control);
        });
        afterEach(function () {
            sandbox.restore();
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
            it('should record the daemon process id when starting a new daemon', sinon.test(function () {
                var goodpid = '987654321';
                var garbagepid = '1234567890';
                var daemonpid;
                this.stub(childProcess, 'spawn', function () {
                    return {
                        unref: function () {},
                        pid: goodpid
                    };
                });
                this.stub(control, '_getDaemonStdio', function () {return 'inherit'});
                mfs.writeFileSync(config.pidpath, garbagepid);
                control.ensureRunning();
                daemonpid = mfs.readFileSync(config.pidpath, 'utf8');
                assert.equal(daemonpid, goodpid, 'pid from child process was not used');
            }));
        });
    });
});
