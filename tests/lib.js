var cheerio = require('cheerio');

exports.extractCsrfToken = function(res) {
    var $ = cheerio.load(res.text);
    return $('[name=_csrf]').val();
}