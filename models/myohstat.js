var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var MyohstatSchema = new Schema({
    w: { type: Date, default: Date.now },   // Date/Time of the record
    uC: Number,                            // Users count
    oC: Number,                            // openHABs count
    ooC: Number,                           // openHABs online count
    iuC: Number,                           // Used invitations count
    iuuC: Number,                          // Unused invitations count
    udC: Number,                           // User devices count
    ioS: Number                            // Number of connected socket.io sockets
});

MyohstatSchema.index({w:1});

module.exports = mongoose.model('Myohstat', MyohstatSchema);
