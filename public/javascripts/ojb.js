
// 即時関数内で実行
var ojb = new (function(){

  //初期化
  this.init = function(confs){
    this.confs = confs;
    this.uploading_flg = false;
    this.upload_que = [];
    this.slice_uploading_flg = false;
    //this.slice_size = 1024000;
    this.slice_size = 409600;
    this.slices = [];
    this.sessid = null; 
    this.playlist = [];
    this.userlist = [];
    this.playing_file_info = "";
    this.audio_mime_types = confs.audio_mime_types;
    this.video_mime_types = confs.video_mime_types;
    this.mime_types = this.audio_mime_types.concat(this.video_mime_types);
    this.socket = null;
    this.address = this.confs.address;

     // mediaの初期化
    this.media = document.getElementById("media");
    this.media.style.display = "none";
    this.media.preload = 'metadata';
    this.media.addEventListener("ended", function(e){
      ojb.media.style.display = "none";
      if (playlist[0].sessid == ojb.sessid && playing_file_info=='player'){
        ojb.sendCurrentTimeTimer.stop();
        ojb.socket.emit(ojb.confs.soc_msgs.playend, playlist[0]);
      }
    },false);
    this.media.addEventListener("loadedmetadata", function(e){
      if (playlist[0].sessid == ojb.sessid){
        playing_file_info = 'player';
        ojb.sendCurrentTimeTimer.start();
        ojb.mediastart();
      } else {
        playing_file_info = 'listener';
        ojb.socket.emit(ojb.confs.soc_msgs.getcurrenttime,{});
      }
      console.log(playing_file_info);
    }, false);
  
    // mediaコントロール
    this.vdown = document.getElementById('vdown');
    this.vup = document.getElementById('vup');
  
    vdown.addEventListener('click',function(e){
      var currentVolume = ojb.media.volume;
      targetVolume = currentVolume - 0.05;
      if (targetVolume < 0){
        targetVolume = 0;
      }
      ojb.media.volume = targetVolume;;
    },false);
  
    vup.addEventListener('click',function(e){
      var currentVolume = ojb.media.volume;
      targetVolume = currentVolume + 0.05;
      if (targetVolume > 1){
        targetVolume = 1;
      }
      ojb.media.volume = targetVolume;;
    },false);

     // documentのイベント作成
    this.body_elm  = document.getElementsByTagName('body')[0];
    this.body_elm.addEventListener("dragover",this.handleDragOver,false);
    this.body_elm.addEventListener("drop", this.handleFileSelect,false);

    document.getElementById("newname").addEventListener("keypress",this.changeNameFromEnter,false);
    document.getElementById("changename").addEventListener("click",this.changeName,false);
    document.getElementById("disconnect_btn").addEventListener("click",this.disConnect,false);
    document.getElementById("reconnect_btn").addEventListener("click",this.reConnect,false);

     // 送信用sliceque確認タイマー作成
    this.sliceUploadTimer = mytools.timer(500,function(){
      if (ojb.slices.length !=0 && ojb.uploading_flg){
        var reader = new FileReader();
        var seqno = ojb.slices[0].seqno;
        var filename = ojb.slices[0].filename;
        var end_flg = ojb.slices[0].end_flg;
        var file_type = ojb.slices[0].file_type;
        var slice_cnt = ojb.slices[0].slice_cnt;
        reader.onload = function(readed) {
          var data = readed.target.result;
          ojb.SendFile({
            data:data,
            seqno:seqno,
            filename:filename,
            end_flg:end_flg,
            filetype:file_type,
            slice_cnt:slice_cnt
          });
          ojb.slices.shift();
          if (ojb.slices.length == 0 ){
            ojb.upload_que.shift();
            ojb.uploading_flg = false;
          }
        }
        reader.readAsBinaryString(ojb.slices[0].data);
      }
    });
   
    // 一秒置きに 再生中ファイルの時間を送信
    this.sendCurrentTimeTimer = new mytools.timer(1000,function(){
      if (playlist.length != 0 && playlist[0].sessid == ojb.sessid && ojb.media != undefined){
        ojb.socket.emit(ojb.confs.soc_msgs.sendcurrenttime, {value:ojb.media.currentTime});
      }
    });

    // 送信中ファイルque確認タイマー作成
    this.queTimer = new mytools.timer(3000,function(){
      if( ojb.upload_que.length != 0 && !ojb.uploading_flg && !ojb.slice_uploading_flg){
        ojb.uploading_flg = true;
        ojb.queTimer.stop();
   
        var file = ojb.upload_que[0].file;
        var filename = ojb.upload_que[0].filename;
  
        // 正しいファイルタイプである場合は処理を行う
        if ( ojb.checkFileType(file.type) ){
          ojb.changeUploadStatusView(filename,"uploading",0);
          var filesize = file.size;
          var slice_cnt = ~~(filesize/ojb.slice_size)+1;
          for ( var i=0; i<slice_cnt; i++) {
            var end_flg = false;
            if (i==slice_cnt-1){
              end_flg = true;
            }
            ojb.slices.push({
              seqno:i,
               data:file.slice(i*ojb.slice_size,(i+1)*ojb.slice_size),
               filename:filename,
               end_flg:end_flg,
               file_type:file.type,
               slice_cnt:slice_cnt
            });
          }
          ojb.sliceUploadTimer.start();
        } else {
          ojb.changeUploadStatusView(filename,"denied",0);
          ojb.upload_que.shift();
          ojb.uploading_flg = false;
          ojb.queTimer.start();
        }
      } else if (ojb.upload_que.length == 0) {
        ojb.queTimer.stop();
      }
    });
  }

  // websocket開始
  this.start = function(){

    // websocket接続開始
    this.socket = io.connect(this.address);
  
     // 接続開始完了時の処理
    this.socket.on(ojb.confs.soc_msgs.conn, function(msg) {
      console.log(ojb.confs.soc_msgs.conn);
      ojb.sessid = ojb.socket.socket.transport.sessid;
      document.getElementById("name").value = ojb.sessid;
   
      //buttonの初期化
      document.getElementById('disconnect_btn').style.display = "";
      document.getElementById('reconnect_btn').style.display = "none";
    });
  
   // 再生停止通知受信時の処理
    ojb.socket.on(ojb.confs.soc_msgs.playstop, function(data) {
      console.log(ojb.confs.soc_msgs.playstop);
      ojb.mediastop();
    });
  
    // 再生開始時の処理
    this.socket.on(ojb.confs.soc_msgs.playstart, function(startTime) {
      console.log(ojb.confs.soc_msgs.playstart);
      ojb.media.src = './mediadata/'+playlist[0].filename;
      ojb.mediastart();
    });
  
    // 最新再生時刻受信時
    this.socket.on(ojb.confs.soc_msgs.retcurrenttime, function(data) {
      console.log(ojb.confs.soc_msgs.retcurrenttime);
      ojb.media.currentTime = data;
      ojb.mediastart();
    });
  
    // プレイリスト更新通知受信時の処理
    this.socket.on(ojb.confs.soc_msgs.updateplaylist, function(data) {
      console.log(ojb.confs.soc_msgs.updateplaylist);
      playlist = data;
      ojb.createPlayListTable();
      ojb.createUserListTable();
    });
  
    // ユーザーリスト受信時の処理
    this.socket.on(ojb.confs.soc_msgs.updateuserlist,function(newuserlist){
      userlist = newuserlist;
      var yourname = ojb.getDispName(ojb.sessid);
      document.getElementById('name').innerHTML = 'よくぞまいった <font color=\'red\'><b>'+yourname+'</b></font> よ！';
      ojb.createPlayListTable();
      ojb.createUserListTable();
    });
  
    // 画面更新時の処理
    window.onbeforeunload = function(){
      ojb.disConnect();
    }
  }




  // メディア再生処理
  this.mediastart = function(){
    var filetype = playlist[0].filetype;
    var mediastyle = "";
    for ( var mimetype in ojb.audio_mime_types){
      if ( filetype == ojb.audio_mime_types[mimetype] ) {
        mediastyle = "none";
        break;
      }
    }
   ojb.media.style.display = mediastyle;
    ojb.media.play();
  }
  
  // メディア停止処理
  this.mediastop = function(){
    ojb.media.style.display = "none";
    ojb.media.pause();
  }
  
  
  // 切断時の処理
  this.disConnect = function(){
    var yourname = ojb.getDispName(ojb.sessid);
    document.getElementById('name').innerHTML = '<font color=\'red\'><b>'+yourname+'</b></font> は死んでしまった！';
    if(ojb.media!=undefined && ojb.media.ended==false){
      ojb.mediastop();
    }
    ojb.socket.disconnect({sessid:ojb.sessid});
    document.getElementById('disconnect_btn').style.display = "none";
    document.getElementById('reconnect_btn').style.display = "";
  }
  
  // 再接続時の処理
  this.reConnect = function(){
   document.getElementById('disconnect_btn').style.display = "";
   document.getElementById('reconnect_btn').style.display = "none";
   // 再接続は、１度作ったsocketから行う。何故かは不明。
   ojb.socket.socket.connect(this.address);
  }

     // ユーザーリストテーブル最新化
  this.createUserListTable = function(){
    var userlist_elm = document.getElementById('userlist');
    var userlist_str = "";
    if (userlist.length>0) {
      userlist_str = '<table>';
      userlist_str = userlist_str.concat('<caption>接続ユーザリスト<caption>');
      userlist_str = userlist_str.concat('<tr>');
      userlist_str = userlist_str.concat('<th class=\'no\'>no</th>');
      userlist_str = userlist_str.concat('<th class=\'id\'>ID/name</th>');
      userlist_str = userlist_str.concat('</tr>');
      for (var i=0; i<userlist.length; i++){
        var trclass = "";
        var username = userlist[i].dispname;
        if (ojb.sessid == userlist[i].sessid) {
          trclass = "mydata";
        } else {
          trclass = "otherdata";
        }
        userlist_str = userlist_str.concat('<tr class="'+trclass+'">');
        userlist_str = userlist_str.concat('<td class=\'no\'>'+(i+1)+'</td>');
        userlist_str = userlist_str.concat('<td class=\'id\'>'+username+'</td>');
        userlist_str = userlist_str.concat('</tr>');
      } 
      userlist_str = userlist_str.concat('</table>');
    }
    userlist_elm.innerHTML = userlist_str;
  }

   // プレイリストテーブル最新化
  this.createPlayListTable = function(){
    var playlist_elm = document.getElementById("playlist");
    var playlist_str = "";
    var filename = null;
    var color = null;
    var btn_sts = "";
    var playinfo_elm = document.getElementById('playinginfo');
    playinfo_elm.innerHTML = "";
    playlist_str = '<table>';
    playlist_str = playlist_str.concat('<caption>プレイリスト</caption>');
    playlist_str = playlist_str.concat('<tr>');
    playlist_str = playlist_str.concat('<th class=\'no\'>no</th>');
    playlist_str = playlist_str.concat('<th class=\'id\'>ID/name</th>');
    playlist_str = playlist_str.concat('<th class=\'filename\'>filename</th>');
    playlist_str = playlist_str.concat('<th class=\'remove\'>remove</th>');
    playlist_str = playlist_str.concat('</tr>');
    if (playlist.length>0) {
      document.getElementById('playinfo-container').style.display = '';
      for (var i=0; i<playlist.length; i++){
        var trclass = "";
        filename = playlist[i].filename;
        if (ojb.sessid == playlist[i].sessid) {
          trclass = "mydata";
          btn_sts = "";
        } else {
          trclass = "otherdata";
          btn_sts = "disabled";
        }
        if (i==0){
          playinfo_elm.innerHTML = '再生中: <b>' + filename + '</b>';
        }
        playlist_str = playlist_str.concat('<tr class='+trclass+'>');
        playlist_str = playlist_str.concat('<td class=\'no\'>'+(i+1)+'</td>');
        playlist_str = playlist_str.concat('<td class=\'id\'>'+ojb.getDispName(playlist[i].sessid)+'</td>');
        playlist_str = playlist_str.concat('<td class=\'file\'>'+filename+'</td>');
        playlist_str = playlist_str.concat('<td class=\'remove\'><input id="playno'+i+'" type=button value=\'削除\' '+btn_sts+'/></td>');
        playlist_str = playlist_str.concat('</tr>');
      } 
    } else {
      playlist_str = playlist_str.concat('<tr class="nofiletr">');
      playlist_str = playlist_str.concat('<td colspan="4">nofile</th>');
      playlist_str = playlist_str.concat('</tr>');
      document.getElementById('playinfo-container').style.display = 'none';
    }
    playlist_str = playlist_str.concat('</table>');
    playlist_elm.innerHTML = playlist_str;

    for (var i=0; i<playlist.length; i++){
      var remove_elm = document.getElementById('playno'+i);
      if (!remove_elm.disabled){
        remove_elm.addEventListener("click",function(e){ojb.removefile(e.target.id);},false);
      }
    }
  }

  this.getDispName = function(srcid){
    var dispname = "";
    for (var i=0; i<userlist.length; i++){
      if (srcid == userlist[i].sessid){
        dispname = userlist[i].dispname;
        break;
      }
    }
    return dispname;
  }

  // ファイル削除通知送信
  this.removefile = function(fileid){
    fileno = fileid.match(/\d+$/);
    ojb.socket.emit(ojb.confs.soc_msgs.removefile,{filename:playlist[fileno].filename});
  }

  // ファイル送信
  this.SendFile = function(file) {
    ojb.socket.emit(ojb.confs.soc_msgs.uploadfile,file,function(data){
      if (data=="success"){
        ojb.changeUploadStatusView(file.filename,"upload_complete",0);
        ojb.sliceUploadTimer.stop();
        ojb.queTimer.start();
      } else {
        var sendStatus = 100 - (~~((ojb.slices.length / file.slice_cnt)*100));
        ojb.changeUploadStatusView(file.filename,"uploading",sendStatus);
      }
    });
  }

  // ファイルDrop時の制御
  this.handleFileSelect = function(e) {
    var file = null;
    var reader = new FileReader();
    var filename = null;

    e.stopPropagation();
    e.preventDefault();
    
    // 各ファイルをupload用のqueに登録
    files = e.dataTransfer.files;
    for(var i=0; i<files.length; i++){
      ojb.upload_que.push({file:files[i],filename:files[i].name});
    }
    ojb.queTimer.start();
  }

  this.checkFileType = function(filetype){
    for (var i=0; i<ojb.mime_types.length; i++){
      if (ojb.mime_types[i] == filetype){
        return true;
      }
    }
    return false;
  }

  // dropzoneの上をdragした場合の制御
  this.handleDragOver = function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'test';
  }

  // 表示名変更送信
  this.changeName = function() {
    var newname = document.getElementById('newname').value
    ojb.socket.emit(ojb.confs.soc_msgs.changename,newname);
  }

  // ファイル送信状況の表示
  this.changeUploadStatusView = function(filename, st_flg, status) {
    var upload_status_view = document.getElementById('upload_status_view');
    view_str = "";
    if (st_flg=="uploading"){
      view_str = ' 『' + filename + '』 を設定中！ (' + status +'%)';
    } else if (st_flg=='upload_complete'){
      view_str = ' 『' + filename + '』 設定終了！ (100%)';
    }
    upload_status_view.style.fontSize = '16';
    upload_status_view.style.fontWeight = "bolder";
    upload_status_view.style.margin = '10px';
    upload_status_view.innerHTML = view_str;

    if (st_flg=='denied'){
      document.getElementById('upload_fails').innerHTML = '『' + filename +'』は対応していない形式です';
    }
  }

  // 名前変更のenterkeyでの処理
  this.changeNameFromEnter = function(e) {
    if (e.keycode==13) {
      changeName();
    }
  }


})();


