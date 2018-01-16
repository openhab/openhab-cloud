var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
     bcrypt = require('bcrypt'),
     Openhab = require('./openhab'),
     Email = mongoose.SchemaTypes.Email,
     UserAccount = require('./useraccount'),
     ObjectId = mongoose.SchemaTypes.ObjectId;

var MemoryBcryptCache = require('bcrypt-cache').MemoryBcryptCache;
var memCache = new MemoryBcryptCache({
    ttl: 60,
    pruneTimer: 60
});


var UserSchema = new Schema({
    username: {type: String, unique: true},
    firstName: {type: String},
    lastName: {type: String},
    salt: { type: String, required: true },
    hash: { type: String, required: true },
    created: {type: Date, default: Date.now },
    active: {type: Boolean, default: true, required: true},
    role: {type: String},
    account: {type: ObjectId, ref: 'UserAccount'},
    group: {type: String},
    verifiedEmail: {type: Boolean, default: false},
    registered: { type: Date, default: Date.now },
    last_online: { type: Date, default: Date.now }
});

/*userSchema.plugin(passportLocalMongoose);*/

UserSchema.method('checkPassword', function (password, callback) {
    memCache.compare(this.hash,password).then(function (result) {
      callback(null,result);
    });
});

UserSchema.virtual('password').get(function () {
    return this._password;
}).set(function (password) {
        this._password = password;
        var salt = this.salt = bcrypt.genSaltSync(10);
        this.hash = bcrypt.hashSync(password, salt);
    });

UserSchema.static('register', function(username, password, cb) {
    var newAccount = new UserAccount();
    var self = this;
    newAccount.registered = new Date;
    newAccount.modified = new Date;
    newAccount.save(function(error) {
        if (!error) {
            var user = new self();
            user.username = username.trim().toLowerCase();
            user.password = password;
            user.role = 'master';
            user.account = newAccount.id;
            user.save(function(error) {
                if (!error) {
                    cb(null, user);
                } else {
                    cb(error);
                }
            });
        } else {
            cb(error);
        }
    });
});

UserSchema.static('registerToAccount', function(username, password, account, role, cb) {
    var newUser = new this();
    newUser.username = username;
    newUser.password = password;
    newUser.role = role;
    newUser.account = account;
    newUser.save(function(error) {
        if (!error) {
            cb(null, newUser);
        } else {
            cb(error);
        }
    });
});

UserSchema.static('authenticate', function (username, password, callback) {
    // don't use cache() here, before a proper way to invalidate the cache when, e.g., the password is changed is
    // implemented. See also: https://github.com/Gottox/mongoose-cache/issues/17
    this.findOne({ username: username }).exec(function(err, user) {
        if (err)
            return callback(err, false, {message: 'Authentication error'});
        if (!user)
            return callback(null, false, {message: 'Unknown user or incorrect password'});
        user.checkPassword(password, function(err, passwordCorrect) {
            if (err)
                return callback(err, false, {message: 'Authentication error'});
            if (!passwordCorrect)
                return callback(null, false, {message: 'Unknown user or incorrect password'});
            if (!user.active)
                return callback(null, false, {message: 'User is not active'});
            return callback(null, user);
        });
    });
});

UserSchema.methods.openhab = function(callback) {
    Openhab.findOne({account: this.account}).exec(callback);
};

UserSchema.methods.findOpenhabs = function (callback) {
    Openhab.find({account: this.account}).exec(callback);
};

UserSchema.index({account:1, role:1});

module.exports = mongoose.model('User', UserSchema);
