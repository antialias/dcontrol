var DaemonSpawner = require('./control');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var configPath = 'daemonSpawnerconfig';
var spawner;
if (argv.config) {
    configPath = argv.config;
}
var showHelpAndExit = function () {
    console.log(require('fs').readFileSync(path.join(__dirname, 'help.txt'), 'utf8'));
    process.exit(1);
};
if (argv.help) {
    showHelpAndExit();
}
spawner = new DaemonSpawner(require(path.join(process.cwd(), configPath)));
if (argv.start) {
    spawner.ensureRunning();
} else if (argv.stop) {
    spawner.ensureStopped();
} else if (argv.restart) {
    spawner.ensureStopped().then(function () {
        spawner.ensureRunning();
    });
} else {
    showHelpAndExit();
}
