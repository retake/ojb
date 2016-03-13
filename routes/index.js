
/*
 * GET home page.
 */

exports.index = function(req, res){
  var conf = require('config');
  res.render('index', { title: 'jukebox' ,conf: conf});
};
