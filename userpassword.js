var User = require('./models/user');

/**
 * A helper class for setting the password of an arbitrary user.
 *
 * @param user The user where the password change attempts should happen
 * @constructor
 */
var UserPassword = function(user) {
    if (!(user instanceof User)) {
        throw new Error('UserPassword can only be instantiated with an User object, ' +
            user.constructor + ' given.');
    }
    this.user = user;
};

/**
 * Verifies the password complexity rules for the given plain text password and, if it
 * matches the requirements, sets the new password to the given user.
 *
 * The complexity rules includes:
 *  - at least 4 characters
 *  - has at least two characters of the following categories: uppercase letters, lowercase letters, numbers, special characters
 *
 * @param {string} password
 * @param fn Optional function to pass to the save function of User
 * @return {boolean} True, if saving the password was initiated, false otherwise. False is garantueed to mean, that the
 *  password does not meet the complexity requirements.
 */
UserPassword.prototype.setPassword = function(password, fn) {
    if (!UserPassword.isComplexEnough(password)) {
        return false;
    }

    this.user.password = password;
    if (typeof fn !== 'function') {
        fn = undefined;
    }
    this.user.save(fn);

    return true;
};

/**
 * Helper function for checking the complexity of a password.
 *
 * @param password
 * @returns {boolean}
 */
UserPassword.isComplexEnough = function(password) {
    var matches = 0;

    if (password.length < 4) {
        return false;
    }

    if (password.indexOf(':') !== -1) {
        return false;
    }

    // match against all lowercase letters
    if (password.match(/^(?=.*[a-z]).+$/)) {
        matches++;
    }

    // match against all uppercase letters
    if (password.match(/^(?=.*[A-Z]).+$/)) {
        matches++;
    }

    // match against all numbers
    if (password.match(/^(?=.*\d).+$/)) {
        matches++;
    }

    // match against a reasonable set of special characters
    if (password.match(/^(?=.*[-+_!@#$%^&*.,?]).+$/)) {
        matches++;
    }

    return matches > 1;
};

/**
 * Prints a message to the given request, that the entered password was not complex enough, while giving the complexity
 * rules for passwords.
 *
 * @param req
 */
UserPassword.printPasswordNotComplexEnoughError = function(req) {
    var message = [];
    message.push('The password does not meet the password complexity requirements. Please try again.');
    message.push('Your password must be at least 4 characters long and need to contain at least 2 different characters from the following groups:');
    message.push(' * Lowercase letters (a, b, c, ...)');
    message.push(' * Uppercase letters (A, B, C, ...)');
    message.push(' * Numbers (1, 2, 3, ...)');
    message.push(' * Special characters out of: -+_!@#$%^&*.,?');
    message.push(' * must not contain a colon (":")');

    req.flash('error', message);
};

module.exports = UserPassword;
