var app = require('../app');

var mongoose = require('mongoose');

const Errors = {
    DBERROR: 'DBERROR'
}

exports.gethealth = function(req, res) {
    const mongoose_state = mongoose.connection.readyState
    var errors = collectErrors();
    if (errors.length == 0) {
        res.status(200).json({
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
};
