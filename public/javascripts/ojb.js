
// 即時関数内で実行
var ojb = new (function(){

  //初期化
  this.init = function(confs){
    
    this.confs = confs;
    this.uploading_flg = false;
    this.upload_que = [];
    this.slice_uploading_flg = false;
    this.slice_size = 409600;
    this.slices = [];
    this.sessid = null; 
    this.playlist = [];
    this.userlist = [];
    this.playing_file_info = "";
    this.audio_mime_types = confs.audio_mime_types;
    this.video_mime_types = confs.video_mime_types;
    this.mime_types = this.audio_mime_types.concat(this.video_mime_types);
    this.fullscreen_mode = false;
    this.socket = null;
    this.address = this.confs.address;
 
    // mediaの初期化
    this.media = document.createElement('video');
    this.media.style.display = "none";
    this.media.id = 'media';
    this.media.preload = 'metadata';
    document.getElementById('mainarea').appendChild(this.media);
    this.media.addEventListener("ended", function(e){
      ojb.media.style.display = "none";
      ojb.reset_video();
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
    this.media.addEventListener("dblclick", function(e){
      ojb.fullscreen_mode = !ojb.fullscreen_mode;
      ojb.resize_video();
    }, false);  
    document.getElementById("mainarea").addEventListener("mousewheel", function(e){
      e.preventDefault();
      if (e.wheelDelta > 0){
        ojb.vup_func();
      } else {
        ojb.vdown_func();
      }
    }, false);

    this.def_media_style = window.getComputedStyle(ojb.media,null);
    this.def_media_margin = this.def_media_style.getPropertyValue('margin');

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
      ojb.sessid = ojb.socket.sessid;
      document.getElementById("name").value = ojb.sessid;
   
      //buttonの初期化
      document.getElementById('disconnect_btn').style.display = "";
      document.getElementById('reconnect_btn').style.display = "none";
    });
  
   // 再生停止通知受信時の処理
    ojb.socket.on(ojb.confs.soc_msgs.playstop, function(data) {
      ojb.mediastop();
    });
  
    // 再生開始時の処理
    this.socket.on(ojb.confs.soc_msgs.playstart, function(startTime) {
      ojb.media.src = './mediadata/'+playlist[0].filename;
      ojb.media.currentTime = startTime;
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
      console.log("updateuserlist");
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
    ojb.reset_video();
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
    delete this.media;
    document.getElementById('disconnect_btn').style.display = "none";
    document.getElementById('reconnect_btn').style.display = "";
  }
  
  // 再接続時の処理
  this.reConnect = function(){
   document.getElementById('disconnect_btn').style.display = "";
   document.getElementById('reconnect_btn').style.display = "none";
   // 再接続は、１度作ったsocketから行う。何故かは不明。
   ojb.socket.socket.connect(this.address);
  };


  // パラメータを元にエレメントを作成 
  var createElementWithParams = function(params){
    var elm = document.createElement(params.node);
    if (undefined != params.id){elm.id = params.id;}
    if (undefined != params.className){elm.className = params.className;}
    if (undefined != params.innerHTML){elm.innerHTML = params.innerHTML;}
    if (undefined != params.type){elm.type = params.type;}
    if (undefined != params.value){elm.value = params.value;}
    if (undefined != params.disabled){elm.disabled = params.disabled;}
    if (undefined != params.colspan){elm.colSpan = params.colspan;}
    return elm;
  }

  // ユーザーリストテーブル最新化
  this.createUserListTable = function(){
    var userlist_elm = document.getElementById('userlist');
    if (userlist.length>0) {
      var table_elm = createElementWithParams({node:'table'});
      table_elm.appendChild(createElementWithParams({node:'caption',innerHTML:'接続ユーザリスト'}));
      var tr_th_elm = createElementWithParams({node:'tr'});
      tr_th_elm.appendChild(createElementWithParams({node:'th',className:'no',innerHTML:'no'}));
      tr_th_elm.appendChild(createElementWithParams({node:'th',className:'id',innerHTML:'ID'}));
      table_elm.appendChild(tr_th_elm);
      for (var i=0; i<userlist.length; i++){
        var trclass = "";
        var username = userlist[i].dispname;
        if (ojb.sessid == userlist[i].sessid) {
          trclass = "mydata";
        } else {
          trclass = "otherdata";
        }
        
        var tr_elm = createElementWithParams({node:'tr',className:trclass});
        tr_elm.appendChild(createElementWithParams({node:'td',className:'no',innerHTML:i+1}));
        tr_elm.appendChild(createElementWithParams({node:'td',className:'id',innerHTML:username}));
        table_elm.appendChild(tr_elm);
      } 
    }
    for (var i=userlist_elm.childNodes.length-1; i>=0; i--){
      userlist_elm.removeChild(userlist_elm.childNodes[i]);
    }
    userlist_elm.appendChild(table_elm);
  }

   // プレイリストテーブル最新化
  this.createPlayListTable = function(){
    var playlist_elm = document.getElementById("playlist");
    var filename = null;
    var color = null;
    var btn_sts = "";
    var playinfo_elm = document.getElementById('playinginfo');

    var table_elm = createElementWithParams({node:'table'});
    table_elm.appendChild(createElementWithParams({node:'caption',innerHTML:'プレイリスト'}));
    var tr_th_elm = createElementWithParams({node:'tr'});
    tr_th_elm.appendChild(createElementWithParams({node:'th',className:'no',innerHTML:'no'}));
    tr_th_elm.appendChild(createElementWithParams({node:'th',className:'id',innerHTML:'username'}));
    tr_th_elm.appendChild(createElementWithParams({node:'th',className:'filename',innerHTML:'filename'}));
    tr_th_elm.appendChild(createElementWithParams({node:'th',className:'remove',innerHTML:'remove'}));
    table_elm.appendChild(tr_th_elm);
    if (playlist.length>0) {
      document.getElementById('playinfo-container').style.display = '';
      for (var i=0; i<playlist.length; i++){
        var trclass = "";
        filename = playlist[i].filename;
        if (ojb.sessid == playlist[i].sessid) {
          trclass = "mydata";
          btn_sts = false;
        } else {
          trclass = "otherdata";
          btn_sts = true;
        }
        if (i==0){
          playinfo_elm.innerHTML = '再生中: <b>' + filename + '</b>';
        }
        var tr_elm = createElementWithParams({node:'tr',className:trclass});
        tr_elm.appendChild(createElementWithParams({node:'td',className:'no',innerHTML:i+1}));
        tr_elm.appendChild(createElementWithParams({node:'td',className:'id',innerHTML:ojb.getDispName(playlist[i].sessid)}));
        tr_elm.appendChild(createElementWithParams({node:'td',className:'file',innerHTML:filename}));
        var remove_elm = createElementWithParams({node:'td',className:'remove'});
        remove_elm.appendChild(createElementWithParams({node:'input',id:'playno'+i,type:'button',value:'削除',disabled:btn_sts}));
        tr_elm.appendChild(remove_elm);
        table_elm.appendChild(tr_elm);
      } 
    } else {
      var tr_elm = createElementWithParams({node:'tr',className:'nofiletr'});
      tr_elm.appendChild(createElementWithParams({node:'td',colspan:'4',innerHTML:"nofile"}));;
      table_elm.appendChild(tr_elm);
      document.getElementById('playinfo-container').style.display = 'none';
    }

    for (var i=playlist_elm.childNodes.length-1; i>=0; i--){
      playlist_elm.removeChild(playlist_elm.childNodes[i]);
    }
    playlist_elm.appendChild(table_elm);

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

  this.vdown_func = (function(){
    var currentVolume = ojb.media.volume;
    targetVolume = currentVolume - 0.02;
    if (targetVolume < 0){
      targetVolume = 0;
    }
    ojb.media.volume = targetVolume;;
  });

  this.vup_func = (function(){
    var currentVolume = ojb.media.volume;
    targetVolume = currentVolume + 0.02;
    if (targetVolume > 1){
      targetVolume = 1;
    }
    ojb.media.volume = targetVolume;;
  });

  this.resize_video = (function(){
    var playlist = document.getElementById("playlist");
    if (!ojb.fullscreen_mode) {
      ojb.media.style.position = 'static';
      ojb.media.style.width = "800px";
      ojb.media.style.height = "auto";
      ojb.media.style.margin = ojb.def_media_margin;
      playlist.style.display = "";
    } else {
      var clientHeight = parseInt(document.documentElement.clientHeight,10);
      var clientWidth = parseInt(document.documentElement.clientWidth,10);
      var videoHeight = parseInt(ojb.media.offsetHeight,10);
      var videoWidth = parseInt(ojb.media.offsetWidth,10);
      var client_aspect = clientWidth/clientHeight;
      var video_aspect = parseInt(ojb.media.videoWidth,10)/parseInt(ojb.media.videoHeight,10);
      var margin = 10;
      var scroll_size = parseInt(window.innerWidth,10)-clientWidth;
      ojb.media.style.visibility = "hidden";
      ojb.media.style.position = 'fixed';
      ojb.media.style.top = '0px';
      ojb.media.style.margin = margin+'px';
      var left_position = '';
      if (video_aspect > client_aspect){
        ojb.media.style.width = clientWidth-(margin*2)-scroll_size+'px';
        ojb.media.style.height = "auto";
        left_position = '0px'
      } else {
        ojb.media.style.height = clientHeight-margin*2+'px';
        ojb.media.style.width = "auto";
        left_position = (clientWidth-(parseInt(ojb.media.offsetWidth,10)+margin*2))/2+'px';
      }
      ojb.media.style.left = left_position;
      ojb.media.style.visibility = "visible";
      playlist.style.display = "none";
    }
  });

  this.reset_video = function(){
    ojb.media.style.position = 'static';
    ojb.media.style.width = "800px";
    ojb.media.style.height = "auto";
    document.getElementById('playlist').style.display = "";
  }
 
  window.onresize = function(){
    ojb.resize_video();
  }

})();


