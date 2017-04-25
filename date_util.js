var moment = require('moment'),
    tz = require('timezone/loaded'),
    time = require('time');

module.exports = function (date, timezone) {
    var strftime_format = '%F %T %z', // used to convert a date into a normalized strftime format with timezone
        moment_format = 'YYYY-MM-DD HH:mm:ss zz'; // moment.js LDML format for parsing date strings

    /**
     * Convert a Javascript Date into node-time wrapper with the appropriate timezone.
     * @param date     {Date}   Javascript Date object
     * @param timezone {String} Olson timezone for this date (e.g. 'America/New_York')
     * @return node-time object with the appropriate timezone
     */
    var to_local = function (date, timezone) {
        var tz_date;

        if (timezone === 'undefined') {
            timezone = 'UTC';
        }
        tz_date = new time.Date(date);
        tz_date.setTimezone(timezone); // localize the date into the specified timezone
        return local_datetime = tz(tz_date, strftime_format, timezone); // localized format w timezone offset
    }

    /**
     * Convert a Javascript Date into a Moment.js moment obj with the appropriate timezone.
     * Using the returned moment, you can call for example 'moment.calendar()' to get a
     * human readable relative time such as 'last Friday at 3:52 PM'.
     * @param date     {Date}   Javascript Date object
     * @param timezone {String} Olson timezone for this date (e.g. 'America/New_York')
     * @return moment with the appropriate timezone
     */
    var to_moment = function (date, timezone) {
        var local_datetime = to_local(date, timezone);
        return moment(local_datetime, moment_format);
    }

    return to_moment(date, timezone);
}
