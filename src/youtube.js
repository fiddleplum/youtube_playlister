class YouTube {
	constructor() {
		this._playing = false;
		this._player = null;
		this._donePlayingFunction = null;

		let tag = document.createElement('script');
		tag.src = "https://www.youtube.com/iframe_api";
		let firstScriptTag = document.getElementsByTagName('script')[0];
		firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

		window.onYouTubeIframeAPIReady = this._onYouTubeIframeAPIReady.bind(this);
	}

	play(videoId, donePlayingFunction) {
		this._donePlayingFunction = donePlayingFunction;
		this._player.setVolume(100);
		this._player.loadVideoById(videoId, 0, "hd720");
		this._playing = false;
	}

	togglePause() {
		if (this._player.getPlayerState() == 2) {
			this._player.playVideo();
		}
		else {
			this._player.pauseVideo();
		}
	}

	seekOffset(offset) {
		this._player.seekTo(this._player.getCurrentTime() + offset, true);
	}

	stop() {
		this._player.stopVideo();
	}

	toggleMute() {
		if (this._player.isMuted()) {
			this._player.unMute();
		}
		else {
			this._player.mute();
		}
	}

	_onYouTubeIframeAPIReady() {
		this._player = new YT.Player('player', {
			playerVars: {
				rel: 0,
				showinfo: 0,
				fs: 0,
				disablekb: 1,
				controls: 0,
				autoplay: 0
			},
			events: {
				'onStateChange': this._onPlayerStateChange.bind(this)
			}
		});
		this._player.addEventListener('onfocus', () => {
			document.body.focus();
		});
	}
	
	_onPlayerStateChange(event) {
		if (event.data == YT.PlayerState.BUFFERING) {
			this._playing = true;
		}
		if (event.data == -1 && this._playing) { // invalid video, so pause everything to get the right one.
			document.getElementById('message').innerHTML = "ERROR: " + this._player.getVideoUrl() + " is invalid";
		}
		if (event.data == YT.PlayerState.ENDED) {
			this._playing = false;
			this._donePlayingFunction();
		}
	}
}

export default YouTube;