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
	this._player.loadVideoById(videoId, 0, "hd720");
}

YouTube.stop = function() {
	this._player.stopVideo();
}

// Internal

function onYouTubeIframeAPIReady() {
	YouTube._player = new YT.Player('player', {
		height: '120',
		width: '240',
		videoId: '',
		events: {
			'onStateChange': onPlayerStateChange
		}
	});
}

function onPlayerStateChange(event) {
	if (event.data == YT.PlayerState.ENDED) {
		YouTube._donePlayingFunction();
	}
}

YouTube._player = null;
YouTube._donePlayingFunction = null;