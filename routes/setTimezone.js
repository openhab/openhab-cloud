module.exports = function (req, res) {
    req.session.timezone = req.query['tz'];
    res.send(200, 'Timezone set');
};
