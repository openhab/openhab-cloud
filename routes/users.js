var User = require('../models/user');
var Openhab = require('../models/openhab');
var UserDevice = require('../models/userdevice');
var logger = require('../logger');
var UserPassword = require('../userpassword');
var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;
var form = require('express-form'),
    field = form.field;


exports.usersget = function(req, res) {
    User.find({account:req.user.account}, function(error, users) {
        if (!error) {
            if (req.params.hasOwnProperty('id')) {
                var selectedUserId = req.params.id;
            } else {
                if (users.length > 0)
                    var selectedUserId = users[0]._id;
                else
                    var selectedUserId = "";
            }
            var selectedUserArrayId = 0;
            for (var i = 0; i < users.length; i++) {
                if (users[i]._id == selectedUserId) {
                    selectedUserArrayId = i;
                }
            }
            res.render('users', { users: users, usersAction: "list", selectedUserId: selectedUserId,
                selectedUserArrayId: selectedUserArrayId, title: "Users", user: req.user,
                errormessages:req.flash('error'), infomessages:req.flash('info') });
        }
    });
}

exports.usersaddget = function(req, res) {
    User.find({account:req.user.account}, function(error, users) {
        if (!error) {
            var selectedUserId = "";
            res.render('users', { users: users, usersAction: "add", selectedUserId: selectedUserId,
                title: "Users", user: req.user,
                errormessages:req.flash('error'), infomessages:req.flash('info') });
        }
    });
}

exports.usersaddpostvalidate = form(
    field("password", "Password").trim().required(),
    field("password1", "Verify password").trim().required(),
    field("username", "Username").trim().isEmail().required(),
    field("role", "User's role").trim().required().custom(function(value) {
        if (value != 'user' && value != 'master') {
            throw new Error("%s must be 'user' or 'master'.");
        }
    })
);

exports.usersaddpost = function(req, res) {
    if (!req.form.isValid) {
        res.redirect('/users/add');
    } else {
        if (req.form.password == req.form.password1) {
            if (!UserPassword.isComplexEnough(req.form.password)) {
                UserPassword.printPasswordNotComplexEnoughError(req);
                res.redirect('/users/add');
                return;
            }
            User.findOne({username: req.form.username}, function(error, checkUser) {
                if (!error) {
                    if (checkUser) {
                        req.flash('error', 'This username already exists');
                        res.redirect('/users/add');
                    } else {
                        User.registerToAccount(req.form.username, req.form.password, req.user.account, req.form.role, function(error, newUser) {
                            if (!error) {
                                req.flash('info', 'User was added successfully');
                                res.redirect('/users');
                            } else {
                                req.flash('error', 'There was an error adding user');
                                res.redirect('/users/add');
                            }
                        });
                    }
                } else {
                    req.flash('error', 'There was an error adding user');
                    res.redirect('/users/add');
                }
            });
        } else {
            req.flash('error', 'Passwords don\'t match');
            res.redirect('/users/add');
        }
    }

}

exports.usersdeleteget = function(req, res) {
    if (req.params.hasOwnProperty('id')) {
        var deleteUserId = req.params.id;
        if (deleteUserId == req.user.id) {
            req.flash('error', "You can't delete yourself");
            res.redirect('/users');
        } else {
            User.findOne({_id:mongoose.Types.ObjectId(deleteUserId), account: req.user.account}, function(error, deleteUser) {
                if (deleteUser != null && !error) {
                    logger.info(deleteUser.account + " " + req.user.account);
                    deleteUser.remove();
                    req.flash('info', "User deleted");
                    res.redirect('/users');
                } else {
                    req.flash('error', "There was an error processing your request");
                    res.redirect('/users');
                }
            });
        }
    } else {
        res.redirect('/users');
    }
}