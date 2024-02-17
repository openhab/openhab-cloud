module.exports = function (req, res) {
    req.session.timezone = req.query['tz'];
    res.status(200).send('Timezone set');
};
