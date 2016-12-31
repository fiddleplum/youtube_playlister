Downloader = {}

Downloader.setNoCache = function() {
	this._noCache = true;
}

// url - string
// onDownload - function (string url, string content)
// onFail - function (string url, int status)
Downloader.add = function(url, onDownload, onFail) {
	var download = new this._Download(url, onDownload, onFail, false);
	this._queue.push(download);
	this._update();
}

// url - string
// onLoad - function (string url)
// onFail - function (string url)
Downloader.addScript = function(url, onLoad, onFail) {
	var download = new this._Download(url, onLoad, onFail, true);
	this._queue.push(download);
	this._update();
}

// Internal

Downloader._Download = function(url, onDownload, onFail, script) {
	this.url = url;
	this.onDownload = onDownload;
	this.onFail = onFail;
	this.script = script;
},

Downloader._update = function() {
	if(this._active.length < this._maxActive && this._queue.length > 0) {
		var download = this._queue.shift();
		var request = new XMLHttpRequest();
		request.onreadystatechange = function() {
			if(request.readyState == 4) {
				if(request.status == 200 || request.status == 0) {
					if(download.script) {
						eval(request.responseText);
					}
					if(download.onDownload) {
						if(download.script)
							download.onDownload(download.url);
						else
							download.onDownload(download.url, request.responseText);
					}
				}
				else {
					if(download.onFail)
						download.onFail(download.url, request.status);
				}
				Downloader._update();
			}
		}
		request.open("GET", download.url + (this._noCache ? ('?' + new Date().getTime()) : ''), true);
		request.send();
	}
}

Downloader._active = [];
Downloader._queue = [];
Downloader._maxActive = 10;
Downloader._noCache = false;
