var passport = require('passport');
var User = require('../models/user');
var UserAccount = require('../models/useraccount');
var Openhab = require('../models/openhab');
var Invitation = require('../models/invitation');
var Enrollment = require('../models/enrollment');
var LostPassword = require('../models/lostpassword');
var EmailVerification = require('../models/emailverification');
var AccessLog = require('../models/accesslog');
var Event = require('../models/event');
var Item = require('../models/item');
var Notification = require('../models/notification');
var OAuth2Token = require('../models/oauth2token');
var OpenHABAccessLog = require('../models/openhabaccesslog');
var UserDevice = require('../models/userdevice');
var UserDeviceLocationHistory = require('../models/userdevicelocationhistory');
var form = require('express-form'),
    field = form.field;
var path           = require('path')
    , templatesDir   = path.resolve(__dirname, '..', 'templates')
    , emailTemplates = require('email-templates')
    , nodemailer     = require('nodemailer');
var uuid = require('uuid');
var mailer = require('../mailer');
var logger = require('../logger');
var app = require('../app');
var system = require('../system');
var UserPassword = require('../userpassword');

exports.lostpasswordget = function(req, res) {
    res.render('lostpassword', {title: "Lost my password", user: req.user,
        errormessages:req.flash('error'), infomessages:req.flash('info')});
}

exports.lostpasswordpostvalidate = form(
    field("email", "E-Mail").trim().toLower().isEmail().required()
);

exports.loginpostvalidate = form(
    field("username", "E-Mail").trim().toLower().isEmail().required(),
    field("password", "Password").trim().required()
);

exports.lostpasswordpost = function(req, res) {
    if (!req.form.isValid) {
//        res.render('lostpassword', {title: "Lost my password", user: req.user,
//            errormessages:req.flash('error'), infomessages:req.flash('info')});
        res.redirect('/lostpassword');
    } else {
        User.findOne({username: req.form.email}, function(error, lostUser) {
            // resetSuccess indicates, if there's no technical error, only, it doesn't mean, thatan account with the e-mail address exists.
            var resetSuccess = true;

            if (!error && lostUser) {
                var recoveryCode = uuid.v1();
                var newLostPassword = new LostPassword({user: lostUser.id, recoveryCode: recoveryCode});
                newLostPassword.save(function(error) {
                    if (!error) {
                        var locals = {
                            email: lostUser.username,
                            resetUrl: system.getBaseURL() + "/lostpasswordreset?resetCode=" + recoveryCode
                        };
                        mailer.sendEmail(lostUser.username, "Password recovery", 'lostpassword-email', locals, function(error) {
                            if (error) {
                                resetSuccess = false;
                                logger.error(error);
                            }
                        });
                    } else {
                        resetSuccess = false;
                        req.flash('error', 'There was an error while processing your request');
                        res.redirect('/lostpassword');
                    }
                });
            } else if (error) {
                resetSuccess = false;
                req.flash('error', 'There was an error while processing your request');
                res.redirect('/lostpassword');
            }

            if (resetSuccess) {
                req.flash('info', 'We\'ve sent a password reset link to your e-mail address, if an account with this address exists.');
                res.redirect('/');
            }
        });
    }
}

exports.lostpasswordresetget = function(req, res) {
    if (req.query['resetCode'] != null) {
        resetCode = req.query['resetCode'];
    } else {
        res.redirect('/');
    }
    res.render('lostpasswordreset', { title: "Set your new password", user: req.user, resetCode: resetCode,
        errormessages:req.flash('error'), infomessages:req.flash('info') });
}

exports.lostpasswordresetpostvalidate = form(
    field("password", "New password").trim().required(),
    field("password2", "Repeat new password").trim().required(),
    field("resetCode", "Reset Code").required()
);

exports.lostpasswordresetpost = function(req, res) {
    if (!req.form.isValid) {
        res.redirect('/lostpasswordreset?resetCode=' + req.form.resetCode);
    } else {
        if (req.form.password != req.form.password2) {
            req.flash('error', 'Passwords don\'t match');
            res.redirect('/lostpasswordreset?resetCode=' + req.form.resetCode);
        } else {
            LostPassword.findOne({recoveryCode: req.form.resetCode, used: false}, function(error, lostPassword) {
                if (lostPassword && !error) {
                    User.findOne({_id: lostPassword.user}, function(error, lostUser) {
                        if (lostUser && !error) {
                            var userPassword, result;

                            userPassword = new UserPassword(lostUser);
                            result = userPassword.setPassword(req.form.password, function(error) {
                                if (!error) {
                                    lostPassword.used = true;
                                    lostPassword.save();
                                    req.flash('info', 'New password has been successfully set');
                                    res.redirect('/login');
                                } else {
                                    req.flash('error', 'There was an error while processing your request');
                                    res.redirect('/');
                                }
                            });

                            if (!result) {
                                UserPassword.printPasswordNotComplexEnoughError(req);
                                res.redirect('/lostpasswordreset?resetCode=' + req.form.resetCode);
                            }
                        } else {
                            req.flash('error', 'There was an error while processing your request');
                            res.redirect('/');
                        }
                    });
                } else if (error) {
                    req.flash('error', 'There was an error while processing your request');
                    res.redirect('/');
                } else {
                    req.flash('error', 'Your password reset code is invalid or expired');
                    res.redirect('/');
                }
            });
        }
    }
}

exports.enrollget = function(req, res) {
    res.redirect('/login');
}

exports.enrollpost = function(req, res) {
    res.redirect('/login');
}

exports.accountget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        res.render('account', { title: "Account", user: req.user, openhab: openhab,
            errormessages:req.flash('error'), infomessages:req.flash('info') });
    });
}

exports.accountpostvalidate = form(
    field("openhabuuid", "openHAB UUID").trim().required(),
    field("openhabsecret", "openHAB secret").trim().required()
);

exports.accountpost = function(req, res) {
    if (!req.form.isValid) {
        req.user.openhab(function(error, openhab) {
            res.redirect('/account');
        });
    } else {
        req.user.openhab(function(error, openhab) {
            if (!error && openhab) {
                openhab.uuid = req.form.openhabuuid;
                openhab.secret = req.form.openhabsecret;
                openhab.save();
                req.flash('info', 'openHAB settings successfully updated');
                res.redirect('/account');
            }
        });
    }
}

exports.accountpasswordpostvalidate = form(
    field("oldpassword", "Old password").trim().required(),
    field("password", "New password").trim().required(),
    field("password1", "Re-type new password").trim().required()
);

exports.accountpasswordpost = function(req, res) {
    if (!req.form.isValid) {
        res.redirect('/account');
        return;
    }

    // first check, if both new passwords match each other
    if (req.form.password !== req.form.password1) {
        req.flash('error', 'Passwords don\'t match');
        res.redirect('/account');
        return;
    }

    // make sure, that the old password is correct before changing it
    req.user.checkPassword(req.form.oldpassword, function (err, isCorrect) {
        if (err) {
            req.flash('error', 'Could not check old password due to an unknown authentication error.');
            return;
        }

        if (!isCorrect) {
            req.flash('error', 'Old password isn\'t correct.');
            res.redirect('/account');
            return;
        }

        // save the new password and redirect
        userPassword = new UserPassword(req.user);
        if (!userPassword.setPassword(req.form.password)) {
            UserPassword.printPasswordNotComplexEnoughError(req);
            res.redirect('/account');
        } else {
            req.flash('info', 'Password successfully changed');
            res.redirect('/account');
        }
    });
}

exports.itemsdeleteget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        res.render('itemsdelete', {
            title: "Delete my items and events", user: req.user, openhab: openhab,
            errormessages: req.flash('error'), infomessages: req.flash('info')
        });
    });
}

exports.itemsdeletepost = function(req, res) {
    req.user.openhab(function(error, openhab) {
        Event.remove({openhab: openhab.id}, function(error) {
            if (!error) {
                Item.remove({openhab: openhab.id}, function(error) {
                    if (!error) {
                        req.flash('info', 'Items and events deleted successfully');
                        res.redirect('/account');
                    } else {
                        logger.error('openHAB-cloud: Error deleting events: ' + error);
                        req.flash('error', 'There was an error while processing your request');
                        res.redirect('/account');
                    }
                });
            } else {
                logger.error('openHAB-cloud: Error deleting items: ' + error);
                req.flash('error', 'There was an error while processing your request');
                res.redirect('/account');
            }
        });
    });
}

exports.accountdeleteget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        res.render('accountdelete', {
            title: "Delete my account", user: req.user, openhab: openhab,
            errormessages: req.flash('error'), infomessages: req.flash('info')
        });
    });
}

// !!! This is a very dangerous function, it deletes all account data !!!
exports.accountdeletepost = function(req, res) {
    logger.info('openHAB-cloud: Deleting data for ' + req.user.username);
    UserAccount.findOne({_id: req.user.account}, function(error, userAccount) {
        if (!error && userAccount) {
            Openhab.findOne({account: userAccount.id}, function(error, openhab) {
                if (!error && openhab) {
                    Item.remove({openhab: openhab.id}, function(error) {
                        if (!error) {
                            Event.remove({openhab: openhab.id}, function(error) {
                                if (!error) {
                                    UserDevice.remove({owner: req.user.id}, function(error) {
                                        if (!error) {
                                            Notification.remove({user: req.user.id}, function(error) {
                                                if (!error) {
                                                    OAuth2Token.remove({user: req.user.id}, function(error) {
                                                        if (!error) {
                                                            Openhab.remove({account: req.user.account}, function(error) {
                                                                if (!error) {
                                                                    UserAccount.remove({_id: req.user.account}, function(error) {
                                                                        if (!error) {
                                                                            User.remove({account: req.user.account}, function(error) {
                                                                                if (!error) {
                                                                                    req.logout();
                                                                                    res.redirect('/');
                                                                                } else {
                                                                                    logger.error(error);
                                                                                }
                                                                            });
                                                                        } else {
                                                                            logger.error(error);
                                                                        }
                                                                    });
                                                                } else {
                                                                    logger.error(error);
                                                                }
                                                            });
                                                        } else {
                                                            logger.error(error);
                                                        }
                                                    });
                                                } else {
                                                    logger.error(error);
                                                }
                                            });
                                        } else {
                                            logger.error(error);
                                        }
                                    });
                                } else {
                                    logger.error(error);
                                }
                            });
                        } else {
                            logger.error(error);
                        }
                    });
                }
            });
        } else {
            if (error) {
                logger.error(error);
                req.flash('error', "An error occured during operation, please contact support");
                res.redirect('/accountdelete');
            } else {
                logger.error('Unable to find account');
                req.flash('error', "An error occured during operation, please contact support");
                res.redirect('/accountdelete');
            }
        }
    });
}

exports.registerpostvalidateall =     form(
    field("agree", "Agreeing to terms and privacy policy").trim().required(),
    field("username", "Username").trim().toLower().isEmail().required(),
    field("password", "Password").trim().required(),
    field("openhabuuid", "openHAB UUID").trim().required(),
    field("openhabsecret", "openHAB secret").trim().required()
);

exports.registerpostvalidate =     form(
	    field("username", "Username").trim().toLower().isEmail().required(),
	    field("password", "Password").trim().required(),
	    field("openhabuuid", "openHAB UUID").trim().required(),
	    field("openhabsecret", "openHAB secret").trim().required()
	);

exports.registerpost = function(req, res) {
    var registration_enabled = ("registration_enabled" in app.config) ? app.config.registration_enabled : true; 

    if (!registration_enabled) {
	req.flash('error', "Registration is currently disabled.");
        res.render('login', { title: "Login / Sign up", user: req.user,
            errormessages:req.flash('error'), infomessages:req.flash('info') });
    } else if (!req.form.isValid) {
        res.render('login', { title: "Login / Sign up", user: req.user,
            errormessages:req.flash('error'), infomessages:req.flash('info') });
    } else {
        User.findOne({username: req.form.username}, function(err, existingUser) {
            if (existingUser) {
                req.flash('error', "A user with this e-mail is already registered.");
                res.render('login', { title: "Login / Sign up", user: req.user,
                    errormessages:req.flash('error'), infomessages:req.flash('info') });
            } else if (!err) {
                Openhab.findOne({uuid: req.form.openhabuuid},function(err, existingOpenhab) {
                    if (existingOpenhab) {
                      req.flash('error', "UUID is already in use on another account.");
                      res.render('login', { title: "Login / Sign up", user: req.user,
                          errormessages:req.flash('error'), infomessages:req.flash('info') });
                    } else {
                        if (!UserPassword.isComplexEnough(req.form.password)) {
                            UserPassword.printPasswordNotComplexEnoughError(req);
                            res.render('login', { title: "Login / Sign up", user: req.user,
                                errormessages:req.flash('error'), infomessages:req.flash('info') });
                            return;
                        }
                  User.register(req.form.username, req.form.password, function(err, user) {
                      if (err) {
                          req.flash('error', "An error occured during registration, please contact support");
                          logger.error(err);
                          res.render('login', { title: "Login / Sign up", user: req.user,
                              errormessages:req.flash('error'), infomessages:req.flash('info') });
                      } else {
                          req.login(user, function (error) {
                              if (error) {
                                  logger.error(error);
                                  req.flash('error', "An error occured during registration, please contact support");
                                  res.render('login', { title: "Login / Sign up", user: req.user,
                                      errormessages:req.flash('error'), infomessages:req.flash('info') });
                              } else {
                                  var openhab = new Openhab({
                                      account: user.account, uuid: req.form.openhabuuid,
                                      secret: req.form.openhabsecret
                                  });
                                  openhab.save(function (error) {
                                      if (error) {
                                          logger.error('Error: ' + error);
                                          req.flash('error', 'An error occured during registration, please contact support');
                                          res.redirect('/');
                                      } else {
                                          EmailVerification.send(req.user, function (error, verification) {
                                              if (error) {
                                                  logger.error('Error: ' + error);
                                              } else {
                                                  logger.info('Successfully sent verification email to ' + req.user.username);
                                              }
                                          });
                                          req.flash('info', 'Your account successfully registered. Welcome to the openHAB cloud!');
                                          res.redirect('/');
                                      }
                                  });
                              }
                          });
                      }
                  });
                }
              });
            } else {
                req.flash('error', "Registration error occured");
                logger.error(err);
                res.render('login', { title: "Login / Sign up", user: req.user,
                    errormessages:req.flash('error'), infomessages:req.flash('info') });
            }
        });

    }
}

exports.verifyget = function(req, res) {
    code = req.query['code'];
    EmailVerification.findOne({code: code, used: false}, function(error, verification) {
        if (!error && verification) {
            User.findOne({_id: verification.user}, function(error, user) {
                if (!error && user) {
                    verification.used = true;
                    verification.save();
                    user.verifiedEmail = true;
                    user.save();
                    req.flash('info', "E-Mail was successfully verified");
                    res.redirect('/');
                } else {
                    if (error) {
                        req.flash('error', "Verification error occured");
                        logger.error(error);
                        res.redirect('/');
                    } else {
                        req.flash('error', "Invalid verification code");
                        res.redirect('/');
                    }
                }
            });
        } else {
            if (error) {
                req.flash('error', "Verification error occured");
                logger.error(error);
                res.redirect('/');
            } else {
                req.flash('error', "Invalid verification code");
                res.redirect('/');
            }
        }
    });
}
