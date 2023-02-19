var { DateTime } = require('luxon');

module.exports = function (date, timezone) {
    /**
     * Convert a Javascript Date into node-time wrapper with the appropriate timezone.
     * @param date     {Date}   Javascript Date object or ISO String
     * @param timezone {String} Olson timezone for this date (e.g. 'America/New_York')
     * @return luxon object with the appropriate timezone
     */
    if(typeof date === 'string'){
        return DateTime.fromISO(date).setZone(timezone || 'UTC') 
    } else {
        return DateTime.fromJSDate(date).setZone(timezone || 'UTC') 
    }
}
