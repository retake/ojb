var Commons = require('./private/commons.js');
var Media = require('./private/medias.js');

var server_params = init();
start_web_socket();

function init(common_params) {
  this.express = require('express');
  this.routes = require('./routes');
  this.user = require('./routes/user');
  this.http = require('http');
  this.path = require('path');
  this.app = this.express();

  // all environments
  this.app.set('port', process.env.PORT || common_params.conf.port);
  this.app.set('ip', process.env.IP || common_params.conf.host);
  this.app.set('views', this.path.join(__dirname, 'views'));
  this.app.set('view engine', 'ejs');
  this.app.use(this.express.favicon());
  this.app.use(this.express.logger('dev'));
  this.app.use(this.express.json());
  this.app.use(this.express.urlencoded());
  this.app.use(this.express.methodOverride());
  this.app.use(this.app.router);
  this.app.use(this.express.static(this.path.join(__dirname, 'public')));

  // development only
  if ('development' == this.app.get('env')) {
    this.app.use(this.express.errorHandler());
  }
  this.app.get('/', this.routes.index);
  this.app.get('/users', this.user.list);
  this.server = this.http.createServer(this.app);
  this.server.listen(this.app.get('port'), this.app.get('ip'), function(arg_app){
    console.log("Express server listening on port " + arg_app.get('ip') + ':' + arg_app.get('port'));
  }(this.app));
  this.socketIO = require('socket.io');
  this.io = this.socketIO.listen(this.server);

  return this;
}

function start_web_socket() {
  var common = new Commons.init();
  var media = new Media.init(common);
  
  // 5秒感覚で再生状態を確認し、未再生であれば再生（setIntervalのスコープ問題でコントローラに入れられないためここに設置）
  setInterval(function(){
    if (media.media_status=='stop' && media.mediafiles.length!=0){
      if (media.mediafiles[0].status != "writing"){
        media.media_status = 'lock';
        media.current_time = 0;
        common.updatePlayList(server_params,media);
        server_params.io.sockets.emit(common.soc_msgs.playstart,0);
        media.media_status='playing';
      }
    }
  },5000);

  
  server_params.io.sockets.on('connection', function(client_socket) {
    
    var user_session_id = client_socket.id;
    proc_for_start_session();

    // クライアントが切断時
    client_socket.on('disconnect', function(data) {
      console.log("disconnect");
      var playing_user_flg = false;
      if (media.mediafiles.length != 0 && media.playlist[0].sessid==client_socket.id){
        playing_user_flg = true;
        media.media_status = 'lock';
        server_params.io.sockets.emit(common.soc_msgs.playstop,{});
        media.current_time = 0;
      }
      for (var i=media.mediafiles.length-1; i>=0; i--) {
        if(media.mediafiles[i].sessid==client_socket.id) {
          media.removeFile(media.mediafiles[i].filename);
          media.mediafiles.splice(i,1);
          continue;
        };
      }
      for (var i=0; i<media.userlist.length; i++) {
        console.log(media.userlist);
        if(media.userlist[i].sessid==client_socket.id){
          console.log(media.userlist[i].sessid);
          media.userlist.splice(i,1);
          break;
        }
      }
      common.updateUserList(server_params,media);
      common.updatePlayList(server_params,media);
      
      // 5秒待ってからstatusをstopにする
      if (playing_user_flg) {
        media.changeMedia_statusToStop();
      }
    });
    // ユーザー名更新受信時
    client_socket.on(common.soc_msgs.changename,function(newname){
      console.log(common.soc_msgs.changename);
      for (var i=0; i<media.userlist.length; i++){
        if (media.userlist[i].sessid == user_session_id){
          media.userlist[i].dispname = newname;
          break;
        }
      }
      common.updateUserList(server_params,media);
    });
    // 再生終了通知を受信時
    client_socket.on(common.soc_msgs.playend, function(data){
      console.log(common.soc_msgs.playend);
      media.media_status='lock';
      media.removeFile(media.mediafiles[0].filename);
      media.mediafiles.splice(0,1);
      common.updatePlayList(server_params,media);
      media.current_time = 0;
  
      // 5秒待ってからstatusをstopにする
      media.changeMedia_statusToStop();
    });
    // 再生ファイルのcurrent_time受信
    client_socket.on(common.soc_msgs.sendcurrent_time, function(data){
      media.current_time = data.value;
    });
    // 再生ファイルのcurrent_timeリクエスト受信時
    client_socket.on(common.soc_msgs.getcurrent_time, function(data){
      console.log(common.soc_msgs.getcurrent_time);
      client_socket.emit(common.soc_msgs.retcurrent_time,media.current_time);
    });
    // ファイル送信処理受信時
    client_socket.on(common.soc_msgs.uploadfile, function(data,fn){
      if (!media.upload_file_status.writestart) {
        media.mediafiles.push({sessid:client_socket.id,filename:data.filename,status:"writing",filetype:data.filetype});
        media.upload_file_status.start('./public/mediadata/'+data.filename);
        media.upload_file_status.write(data.data);
      } else {
        media.upload_file_status.write(data.data);
      }
      if (data.end_flg){ 
        for (var i in media.mediafiles){
          if (media.mediafiles[i].sessid == client_socket.id && media.mediafiles[i].filename==data.filename){
            media.mediafiles[i].status = "writed";
          }
        } 
        common.updatePlayList(server_params,media);
        media.upload_file_status.reset();
        fn('success');
      } else {
        fn('uploading');
      }          
    });
    // ファイル削除処理受信時
    client_socket.on(common.soc_msgs.removefile, function(data){
      console.log(common.soc_msgs.removefile);
      var targetno = null;
      for (var i=0; i<media.mediafiles.length; i++){
        if (media.mediafiles[i].sessid == client_socket.id && media.mediafiles[i].filename == data.filename) {
          targetno = i;
          break;
        }
      }
      if (targetno == 0) {
        media.media_status = 'lock';
        server_params.io.sockets.emit(common.soc_msgs.playstop,{});
        media.current_time = 0;
      }
  
      media.removeFile(media.mediafiles[targetno].filename);
      media.mediafiles.splice(targetno,1);
      common.updatePlayList(server_params,media);
  
      // 5秒待ってからstatusをstopにする
      if (targetno == 0){
        media.changeMedia_statusToStop();
      }
    });


    function proc_for_start_session(){
      console.log("connection");
      media.userlist.push({sessid:server_params.user_session_id, dispname:server_params.user_session_id});
      common.updateUserList(server_params,media);
      common.updatePlayList(server_params,media);
      media.send_current_time_of_playing_media(client_socket);
    }
  });
}


/*
var mytools = new (function(){
  // タイマー作成
  this.timer = function(interval, fn){
    this.interval = interval;
    this.fn = fn;
    this.tm = null;
    this.start = function() {
      if (!this.tm) {
        this.tm = setInterval(fn,this.interval);
      }
      return this;
    };
    this.stop = function() {
      clearInterval(this.tm);
      this.tm = null;
      return this;
    };
    return this;
  }
  return this
});
*/
