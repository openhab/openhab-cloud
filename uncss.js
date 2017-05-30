var uncss = require('uncss');

var files   = ['http://localhost:3000'],
    options = {
        ignoreSheets : [/bootstrap/],
    };

uncss(files, options, function (error, output) {
    console.log(output);
});

/* Look Ma, no options! */
uncss(files, function (error, output) {
    console.log(output);
});
