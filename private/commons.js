
exports.init = function(){
  this.conf = require('config');
  this.soc_msgs = this.conf.soc_msgs;
  
//var common_funcs = function() {
    // 最新のプレイリストを送信
  this.updatePlayList = function(server_params,media_params){
    console.log("updatePlayList");
    media_params.playlist = [];
    for (var i in media_params.mediafiles){
      var file = media_params.mediafiles[i];
      if (file.status!="writing"){
        media_params.playlist.push(file);
      }
    }
    server_params.io.sockets.emit(this.soc_msgs.updateplaylist,media_params.playlist);
  };

  // 最新のユーザーリストを送信
  this.updateUserList = function(server_params,media_params){
    console.log("updateUserList");
    server_params.io.sockets.emit(this.soc_msgs.updateuserlist,media_params.userlist);
  };
  
  this.sleep = function(time,callback){
    setTimeout(callback,time);
  };
  
    
  //return this;
//}

  return this;
}
