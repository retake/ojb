
exports.init = function(common){
    
  this.mediafiles = [];
  this.playlist = [];
  this.media_status = 'stop';
  this.current_time = 0;
  this.userlist = [];

  this.changeMedia_statusToStop = function() {
    common.sleep(5000,function(){
      this.media_status='stop';
    });
  };
  this.removeFile = function (filename){
    var fs = require('fs');
    fs.unlink('./public/mediadata/'+filename);
    console.log(filename+'を削除しました。');
  };
  this.send_current_time_of_playing_media =  function(socket){
    if (this.media_status=='playing'){
      common.updatePlayList();
      socket.emit(common.soc_msgs.playstart,this.current_time);
    }
  };
  // 個別ファイルの状態
  this.upload_file_status = new (function(){
    this.writestart = false;
    this.fs = null;
    this.path = "";

    this.start = function(path) {
      this.writestart = true;
      this.fs = require('fs');
      this.path = path;
      this.fs.writeFileSync(this.path,"",'binary');
    };
    this.write = function(data) {
      this.fs.appendFileSync(this.path,data,'binary');
    };
    this.reset = function() {
      this.writestart = false;
      this.fs = undefined;
      this.path = "";
      return this;
    };
    return this;
  });
  return this;
}
