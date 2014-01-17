  // タイマー作成
function timer(interval, fn){
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



