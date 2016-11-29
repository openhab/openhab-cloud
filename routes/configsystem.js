var User = require('../models/user');
var Openhab = require('../models/openhab');
var OpenhabConfig = require('../models/openhabconfig');

exports.get = function(req, res) {
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            OpenhabConfig.findOne({openhab: openhab.id}, function(error, openhabConfig) {
                if (!error && openhabConfig) {
                    var selectedPid;
                    if (req.params.hasOwnProperty('pid')) {
                        selectedPid = req.params.pid;
                    } else {
                        for (var pid in openhabConfig.config) {
                            selectedPid = pid;
                            break;
                        }
                    }
                    console.log("openHAB-cloud: Selected " + selectedPid);
                    res.render('configsystem', { openhabConfig: openhabConfig.config, selectedPid: selectedPid,
                        title: "System Configuration", user: req.user, openhab: openhab,
                        errormessages:req.flash('error'), infomessages:req.flash('info') });
                }
            });
        } else {

        }
    });
}