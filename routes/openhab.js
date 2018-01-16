var openhabRoutes = {},
    form = require('express-form'),
    field = form.field,
    logger = require('../logger.js'),
    Openhab = require('../models/openhab'),
    system = require('../system');

function updateOpenHABSettings(user, uuid, secret, req, res) {
    user.openhab(function (error, openhab) {
        if (error || openhab) {
            return;
        }
        openhab.uuid = uuid;
        openhab.secret = secret;
        openhab.save();
        req.flash('info', 'openHAB settings successfully updated');
        res.redirect('/openhab');
    });
}

function addOpenHABToUser(user, uuid, secret, name, req, res) {
    Openhab.create({
        name: name,
        account: user.account,
        uuid: uuid,
        secret: secret
    }, function (err) {
        if (err) {
            logger.debug('Could not save new openHAB instance: ' + err);
            req.flash('error', 'Could not save the new openHAB instance.');
        } else {
            req.flash('info', 'The new openHAB instance was saved successfully.');
        }
        res.redirect('/openhab');
    });
}

openhabRoutes.openhabget = function(req, res) {
    req.user.findOpenhabs(function(error, openhabs) {
        res.render('openhab', {
            title: "openHAB settings",
            user: req.user,
            multi: system.isMultiOpenHABInstanceEnabled(),
            openhabs: openhabs,
            errormessages:req.flash('error'),
            infomessages:req.flash('info')
        });
    });
};

openhabRoutes.openhabpostvalidate = form(
    field("openhabuuid", "openHAB UUID").trim().required().is(/^[a-zA-Z0-9-]+$/),
    field("openhabsecret", "openHAB secret").trim().required()
);

openhabRoutes.openhabpost = function(req, res) {
    var uuid, secret, name;

    if (!req.form.isValid) {
        req.user.openhab(function(error, openhab) {
            res.redirect('/openhab');
        });
        return;
    }

    uuid = req.body.openhabuuid;
    secret = req.body.openhabsecret;
    name = req.body.openhabname || '';
    Openhab.findOne({uuid: uuid}, function(error, openhab) {
        if (error) {
            req.flash('error', 'Could not check, if the openHAB instance is already registered.');
            res.redirect('/openhab');
            return;
        }
        if (openhab) {
            req.flash('error', 'This openHAB instance is already registered by another user.');
            res.redirect('/openhab');
            return;
        }

        if (system.isMultiOpenHABInstanceEnabled()) {
            addOpenHABToUser(req.user, uuid, secret, name, req, res);
        } else {
            updateOpenHABSettings(req.user, uuid, secret, req, res);
        }
    });
};

openhabRoutes.openhabdelete = function(req, res) {
    var uuid = req.params.uuid;

    if (uuid === null || uuid === undefined) {
        req.flash('error', 'Invalid openHAB UUID provided.');
        res.redirect('/openhab');
        return;
    }
    Openhab.findOne({uuid: uuid, account: req.user.account}, function (err, openhab) {
        if (err) {
            req.flash('error', 'An error occurred while trying to find the openHAB instance with the UUID ' + uuid);
            res.redirect('/openhab');
            return;
        }
        if (!openhab) {
            req.flash('error', 'The openHAB instance with the UUID ' + uuid + ' is either not registered or not owned by you.');
            res.redirect('/openhab');
            return;
        }

        openhab.remove();
        req.flash('info', 'The openHAB instance with the UUID ' + uuid + ' was deleted successfully.');
        res.redirect('/openhab');
    });
};

module.exports = openhabRoutes;
