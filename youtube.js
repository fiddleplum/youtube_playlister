YouTube = {}

YouTube.init = function(id) {
	var tag = document.createElement('script');
	tag.src = "https://www.youtube.com/iframe_api";
	var firstScriptTag = document.getElementsByTagName('script')[0];
	firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
	var done = false;
}

YouTube.play = function(videoId, donePlayingFunction) {
	this._donePlayingFunction = donePlayingFunction;
	this._player.setVolume(100);
	this._player.loadVideoById(videoId, 0, "hd720");
	this._playing = false;
}

YouTube.togglePause = function() {
	if(this._player.getPlayerState() == 2) {
		this._player.playVideo();
	}
	else {
		this._player.pauseVideo();
	}
}

YouTube.seekOffset = function(offset) {
	this._player.seekTo(this._player.getCurrentTime() + offset, true);
}

YouTube.stop = function() {
	this._player.stopVideo();
}

YouTube.toggleMute = function() {
	if(this._player.isMuted()) {
		this._player.unMute();
	}
	else {
		this._player.mute();
	}
}

// Internal

function onYouTubeIframeAPIReady() {
	YouTube._player = new YT.Player('player', {
		playerVars: {
			rel: 0,
			showinfo: 0,
			fs: 0,
			disablekb: 1,
			controls: 0,
			autoplay: 0
		},
		events: {
			'onStateChange': onPlayerStateChange
		}
	});
	YouTube._player.addEventListener('onfocus', function () { document.body.focus(); });
}

function onPlayerStateChange(event) {
	if (event.data == YT.PlayerState.BUFFERING) {
		YouTube._playing = true;
	}
	if(event.data == -1 && YouTube._playing) { // invalid video, so pause everything to get the right one.
		document.getElementById('message').innerHTML = "ERROR: " + YouTube._player.getVideoUrl() + " is invalid";
	}
	if (event.data == YT.PlayerState.ENDED) {
		YouTube._playing = false;
		YouTube._donePlayingFunction();
	}
}

YouTube._playing = false;
YouTube._player = null;
YouTube._donePlayingFunction = null;