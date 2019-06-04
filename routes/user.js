
/*
 * GET users listing.
 */

exports.list = function(req, res){
  res.send("respond with a resource");
};

exports.useridget = function (req, res) {
  res.send(req.user.id);
};
