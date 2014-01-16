
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');

var conf = require('config');

var app = express();


// all environments
app.set('port', process.env.PORT || conf.port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);

server = http.createServer(app);
server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

var socketIO = require('socket.io');
var io = socketIO.listen(server);

var mediafiles = [];
var mediaStatus = 'stop';
var currentTime = 0;

var userlist = [];

var soc_msgs = conf.soc_msgs;


// websocket関連処理
io.sockets.on('connection', function(socket) {

  var sessid = socket.id;

  console.log("connection");
  userlist.push({sessid:sessid, dispname:sessid});
  updateUserList();
  updatePlayList();

  // 再生中のファイルがあれば、接続してきたクライアントに開始時刻を送る
  if (mediaStatus=='playing'){
    updatePlayList();
    io.sockets.socket(sessid).emit(soc_msgs.playstart,currentTime);
  }

  // ユーザー名更新受信時の処理
  socket.on(soc_msgs.changename,function(newname){
    console.log(soc_msgs.changename);
    for (var i=0; i<userlist.length; i++){
      if (userlist[i].sessid == sessid){
        userlist[i].dispname = newname;
        break;
      }
    }
    updateUserList();
  });

  // 最新のプレイリストを送信
  function updatePlayList(){
    io.sockets.emit(soc_msgs.updateplaylist,mediafiles);
  }

  // 最新のユーザーリストを送信
  function updateUserList(){
    io.sockets.emit(soc_msgs.updateuserlist,userlist);
  }

  // クライアントが切断したときの処理
  socket.on('disconnect', function(data) {
    console.log("disconnect");
    var playing_user_flg = false;
    if (mediafiles.length != 0 && mediafiles[0].sessid==socket.id){
      playing_user_flg = true;
      mediaStatus = 'lock';
      io.sockets.emit(soc_msgs.playstop,{});
      currentTime = 0;
    }
    for (var i=mediafiles.length-1; i>=0; i--) {
      if(mediafiles[i].sessid==socket.id) {
        removeFile(mediafiles[i].filename);
        mediafiles.splice(i,1);
        break;
      };
    }
    for (var i=0; i<userlist.length; i++) {
      console.log(userlist);
      if(userlist[i].sessid==socket.id){
        console.log(userlist[i].sessid);
        userlist.splice(i,1);
        break;
      }
    }
    updateUserList();
    updatePlayList();
    
    // 5秒待ってからstatusをstopにする
    if (playing_user_flg) {
      changeStatusToStop();
    };
  });

  // 再生終了通知を受信
  socket.on(soc_msgs.playend, function(data){
    console.log(soc_msgs.playend);
    mediaStatus='lock';
    removeFile(mediafiles[0].filename);
    mediafiles.splice(0,1);
    updatePlayList();
    currentTime = 0;

    // 5秒待ってからstatusをstopにする
    changeStatusToStop();
  });

  // 指定したファイルを削除
  socket.on(soc_msgs.removefile, function(data){
    console.log(soc_msgs.removefile);
    var targetno = null;
    for (var i=0; i<mediafiles.length; i++){
      if (mediafiles[i].sessid == socket.id && mediafiles[i].filename == data.filename) {
        targetno = i
        break;
      }
    }
    if (targetno == 0) {
      mediaStatus = 'lock';
      io.sockets.emit(soc_msgs.playstop,{});
      currentTime = 0;
    }

    removeFile(mediafiles[targetno].filename);
    mediafiles.splice(targetno,1);
    updatePlayList();

    // 5秒待ってからstatusをstopにする
    if (targetno == 0){
      changeStatusToStop();
    }
  });
  
  // currenttimeリクエスト受信時
  socket.on(soc_msgs.getcurrenttime, function(data){
    console.log(soc_msgs.getcurrenttime);
    socket.emit(soc_msgs.retcurrenttime,currentTime);
  });


  // ファイルが送られてきた時の処理
  socket.on(soc_msgs.uploadfile, function(data,fn){
    mediafiles.push({sessid:socket.id,filename:data.name,status:"writing",filetype:data.filetype});
    updatePlayList();
    var fs = require('fs');
    var writeFile = data.file;
    var writePath = './public/mediadata/'+data.name;
    var writeStream = fs.createWriteStream(writePath);
    writeStream.on('drain',function() {})
      .on('error',function(exception) {
        console.log('exception:'+exception);
      })
      .on('close',function(){
        console.log('書き込み完了');
      })
      .on('pipe',function(src){});
    writeStream.write(writeFile,'binary');
    writeStream.end();
    for (var i in mediafiles){
      if (mediafiles[i].sessid == socket.id && mediafiles[i].filename==data.name){
        mediafiles[i].status = "writed";
      }
    } 
    fn('success');
  });

  // 再生中ファイルが無い場合、最初のファイルの再生を始める
  setInterval(function(){
    if (mediaStatus=='stop' && mediafiles.length!=0){
      if (mediafiles[0].status != 'writing'){
        mediaStatus = 'lock';
        currentTime = 0;
        updatePlayList();
        io.sockets.emit(soc_msgs.playstart,0);
        mediaStatus='playing';
      }
    }
  },5000);

 // 再生ファイルのcurrentTime受信
  socket.on(soc_msgs.sendcurrenttime, function(data){
    currentTime = data.value;
  });

});

// 5秒待ってからstatusをstopにする
function changeStatusToStop() {
  sleep(5000,function(){
    mediaStatus='stop';
  });
}

// sleep関数
function sleep(time,callback){
  setTimeout(callback,time);
}

// ファイル削除
function removeFile(filename){
  var fs = require('fs');
  fs.unlink('./public/mediadata/'+filename);
  console.log(filename+'を削除しました。');
}
