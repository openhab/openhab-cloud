var { DateTime } = require('luxon');

module.exports = function (date, timezone) {
    /**
     * Convert a Javascript Date into node-time wrapper with the appropriate timezone.
     * @param date     {Date}   Javascript Date object
     * @param timezone {String} Olson timezone for this date (e.g. 'America/New_York')
     * @return luxon object with the appropriate timezone
     */
    return  DateTime.fromJSDate(date).setZone(timezone || 'UTC') 
}
