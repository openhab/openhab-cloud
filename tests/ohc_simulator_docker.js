const compose = require('docker-compose');
var path = require('path');

compose.upAll({cwd: path.join('deployment', 'docker'), log: true})
    .then(function (done) {
            console.log("Docker runned ");
            setTimeout(waitDocker, 10000);
        }, function (err) {
            console.log("Cannot run docker", err)
        }
    );


function waitDocker() {
    console.log("Wait Docker loading...");
}