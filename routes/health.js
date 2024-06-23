var system = require('../system');

var mongoose = require('mongoose');

const Errors = {
    DBERROR: 'DBERROR'
}

exports.gethealth = function (req, res) {
    const isHealthEndpointEnabled = system.isHealthEndpointEnabled();
    if (!isHealthEndpointEnabled) {
        return res.status(404).send("not found");
    } else {
        const mongoose_state = mongoose.connection.readyState
        var errors = collectErrors();
        if (errors.length == 0) {
            return res.status(200).json({
                status: "OK",
                mongoose: mongoose_state
            });
        } else {
            return res.status(500).json({
                status: "Not OK",
                mongoose: mongoose_state,
                errors: errors
            });
        }

        function collectErrors() {
            var errors = [];
            switch (mongoose_state) {
                case 0:
                    errors.push({
                        error: Errors.DBERROR,
                        message: "mongodb disconnected"
                    });
                    break;
                case 2:
                    errors.push({
                        error: Errors.DBERROR,
                        message: "mongodb connecting"
                    });
                    break;
                case 3:
                    errors.push({
                        error: Errors.DBERROR,
                        message: "mongodb disconnecting"
                    });
                    break;
            };
            return errors;
        }
    }
};
