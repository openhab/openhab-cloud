
/*
 * GET users listing.
 */

exports.list = function(req, res){
  res.send("respond with a resource");
};

exports.useridget = function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ userId: req.user.id }));
};