
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
app.set('port', process.env.PORT || 3002);
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

var audiofiles = [];
var audioStatus = 'stop';
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
  if (audioStatus=='playing'){
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
    io.sockets.emit(soc_msgs.updateplaylist,audiofiles);
  }

  // 最新のユーザーリストを送信
  function updateUserList(){
    io.sockets.emit(soc_msgs.updateuserlist,userlist);
  }

  // クライアントが切断したときの処理
  socket.on('disconnect', function(data) {
    console.log("disconnect");
    var playing_user_flg = false;
    if (audiofiles.length != 0 && audiofiles[0].sessid==socket.id){
      playing_user_flg = true;
      audioStatus = 'lock';
      io.sockets.emit(soc_msgs.playstop,{});
      currentTime = 0;
    }
    for (var i=audiofiles.length-1; i>=0; i--) {
      if(audiofiles[i].sessid==socket.id) {
        removeFile(audiofiles[i].filename);
        audiofiles.splice(i,1);
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
    audioStatus='lock';
    removeFile(audiofiles[0].filename);
    audiofiles.splice(0,1);
    updatePlayList();
    currentTime = 0;

    // 5秒待ってからstatusをstopにする
    changeStatusToStop();
  });

  // 指定したファイルを削除
  socket.on(soc_msgs.removefile, function(data){
    console.log(soc_msgs.removefile);
    var targetno = null;
    for (var i=0; i<audiofiles.length; i++){
      if (audiofiles[i].sessid == socket.id && audiofiles[i].filename == data.filename) {
        targetno = i
        break;
      }
    }
    if (targetno == 0) {
      audioStatus = 'lock';
      io.sockets.emit(soc_msgs.playstop,{});
      currentTime = 0;
    }

    removeFile(audiofiles[targetno].filename);
    audiofiles.splice(targetno,1);
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
    audiofiles.push({sessid:socket.id,filename:data.name,status:"writing"});
    updatePlayList();
    var fs = require('fs');
    var writeFile = data.file;
    var writePath = './public/audiodata/'+data.name;
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
    for (var i in audiofiles){
      if (audiofiles[i].sessid == socket.id && audiofiles[i].filename==data.name){
        audiofiles[i].status = "writed";
      }
    } 
    fn('success');
  });

  // 再生中ファイルが無い場合、最初のファイルの再生を始める
  setInterval(function(){
    if (audioStatus=='stop' && audiofiles.length!=0){
      if (audiofiles[0].status != 'writing'){
        audioStatus = 'lock';
        currentTime = 0;
        updatePlayList();
        io.sockets.emit(soc_msgs.playstart,0);
        audioStatus='playing';
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
    audioStatus='stop';
  });
}

// sleep関数
function sleep(time,callback){
  setTimeout(callback,time);
}

// ファイル削除
function removeFile(filename){
  var fs = require('fs');
  fs.unlink('./public/audiodata/'+filename);
  console.log(filename+'を削除しました。');
}
