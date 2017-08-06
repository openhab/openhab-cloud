
/*
 * GET home page.
 */
exports.index = function(req, res){
  errormessages = req.flash('error');
  infomessages = req.flash('info');
  res.render('index', {title: "Home", user: req.user, errormessages: errormessages,
    infomessages: infomessages});
};

exports.docs = function(req, res) {
    errormessages = req.flash('error');
    infomessages = req.flash('info');
    res.render('docs/documentation', {title: "Docs", user: req.user, errormessages: errormessages,
        infomessages: infomessages});
};

exports.docsnotifications = function(req, res) {
    errormessages = req.flash('error');
    infomessages = req.flash('info');
    res.render('docs/notifications', {title: "Docs - Notifications", user: req.user, errormessages: errormessages,
        infomessages: infomessages});
};

exports.docspersistence = function(req, res) {
    errormessages = req.flash('error');
    infomessages = req.flash('info');
    res.render('docs/persistence', {title: "Docs - Persistence", user: req.user, errormessages: errormessages,
        infomessages: infomessages});
};

exports.docsifttt = function(req, res) {
    errormessages = req.flash('error');
    infomessages = req.flash('info');
    res.render('docs/ifttt', {title: "Docs - IFTTT", user: req.user, errormessages: errormessages,
        infomessages: infomessages});
};

exports.getv2 = function(req, res) {
    res.send('Yes, I am!');
};
