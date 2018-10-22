'use strict';

import YouTube from './youtube';
import './elem_tag_list';
import S3FS from '@fiddleplum/s3-fs';

class App {
	constructor() {
		/** @type {YouTube} */
		this._youtube = null;
		/** @type {S3FS} */
		this._s3fs = null;
		this._songs = new Map();
		this._tags = new Set();
		this._currentPlaylistName = '';
		this._currentPlaylist = []; // an array of 2-tuples (songName and songId)
		this._currentSongIndex = 0;
		this._messageTimeout = null;
	}

	async initialize() {
		this.showMessage('Loading Application...');
		let urlParams = new URLSearchParams(document.location.search.substring(1));

		// Load YouTube
		this.showMessage('Loading YouTube...');
		this._youtube = new YouTube(this.showMessage.bind(this));

		// Load S3
		this.showMessage('Loading S3...');
		let password = urlParams.get('p');
		if (password === null) {
			this.showMessage('Please provide a password in the url query p value.');
			return;
		}
		let keyFile = 'keys/' + password.replace(/\W/g, '') + '.txt';
		let response = await fetch(keyFile);
		let text = await response.text();
		let [accessKey, secretKey, region] = text.split('\n');
		this._s3fs = new S3FS(accessKey.trim(), secretKey.trim(), region.trim(), 'data-hurley', 'YouTube Playlister');
		if (this._s3fs === null) {
			this.showMessage('S3 not loaded.');
			return;
		}

		// Load JSON
		this.showMessage('Loading JSON...');
		try {
			let songsText = await this._s3fs.load('songs.json');
			for (let entry of Object.entries(JSON.parse(songsText))) {
				this._songs.set(entry[0], entry[1]);
			}
			for (let entry of this._songs) {
				for (let i = 1; i < entry[1].length; i++) {
					this._tags.add(entry[1][i]);
				}
			}
		}
		catch (error) {
			this.showMessage(error);
		}

		// Populate HTML
		document.getElementById('tag_list').tags = this._tags;

		this.showMessage('Loaded and ready.');
	}

	shuffleCurrentPlaylist() {
		for (let i = this._currentPlaylist.length; i; i--) {
			let j = Math.floor(Math.random() * i);
			[this._currentPlaylist[i - 1], this._currentPlaylist[j]] = [this._currentPlaylist[j], this._currentPlaylist[i - 1]];
		}
	}

	static formatTime(seconds) {
		let s = '';
		if (seconds >= 3600) {
			s += Math.floor(seconds / 3600) + ':';
			seconds -= Math.floor(seconds / 3600) * 3600;
		}
		s += Math.floor(seconds / 60).toString().padStart(s !== '' ? 2 : 1, '0') + ':';
		seconds -= Math.floor(seconds / 60) * 60;
		s += Math.floor(seconds).toString().padStart(2, '0');
		return s;
	}

	updateTime() {
		if (this._youtube.isPlayingOrPaused()) {
			document.getElementById('songTime').innerHTML = App.formatTime(this._youtube.getCurrentTime()) + ' / ' + App.formatTime(this._youtube.getTotalTime());
		}
		else {
			document.getElementById('songTime').innerHTML = '';
		}
		setTimeout(this.updateTime, 500);
	}

	playCurrentSong() {
		if (this._currentPlaylist.length === 0) {
			this.showMessage('The playlist is empty.');
			this._youtube.stop();
			document.getElementById('currentSongTitle').innerHTML = '';
			return;
		}
		let songName = this._currentPlaylist[this._currentSongIndex][0];
		let songId = this._currentPlaylist[this._currentSongIndex][1];

		document.getElementById(songId).className = 'highlighted';
		document.getElementById('currentSongTitle').innerHTML = songName + ' <a href="https://www.youtube.com/watch?v=' + songId + '" target="_blank" onclick="youtube.pause();">➦</a>';
		document.title = 'YP: ' + songName;
		this._youtube.play(songId, () => {
			let oldSongId = this._currentPlaylist[this._currentSongIndex][1];
			document.getElementById(oldSongId).className = '';
			this._currentSongIndex += 1;
			if (this._currentSongIndex >= this._currentPlaylist.length) {
				this._currentSongIndex = 0;
			}
			this.playCurrentSong();
		});
	}

	playSong(songId) {
		let oldSongId = this._currentPlaylist[this._currentSongIndex][1];
		document.getElementById(oldSongId).className = '';
		for (let i = 0; i < this._currentPlaylist.length; i++) {
			if (this._currentPlaylist[i][1] === songId) {
				this._currentSongIndex = i;
				this.playCurrentSong();
			}
		}
	}

	playPlaylist(playlistName) {
		if (this._currentPlaylistName !== '') {
			document.getElementById(this._currentPlaylistName).className = '';
		}
		document.getElementById('currentPlaylistTitle').innerHTML = playlistName;
		this._currentPlaylistName = playlistName;
		this._currentPlaylist = [];
		Object.keys(this._playlists[playlistName]).forEach(function (songName, index) {
			this._currentPlaylist.push([songName, this._playlists[playlistName][songName]]);
		});
		this.shuffleCurrentPlaylist();
		let currentPlaylistDivContent = '<ol>';
		this._currentPlaylist.forEach(function (entry, index) {
			let songName = entry[0];
			let songId = entry[1];
			currentPlaylistDivContent += '<li><a id="' + songId + '" onclick="App.playSong(\'' + songId + '\');">' + songName + '</a><button class="delete" onclick="App.removeSong(\'' + songId + '\');">✖</button></li>';
		});
		currentPlaylistDivContent += '</ol>';
		document.getElementById('playlist_content').innerHTML = currentPlaylistDivContent;
		this._currentSongIndex = 0;
		document.getElementById(playlistName).className = 'highlighted';
		document.getElementById('newSong').style.display = 'block';
		this.playCurrentSong();
	}

	async addSong() {
		let songName = document.getElementById('newSongName').value;
		let songId = document.getElementById('newSongId').value;
		this._playlists[this._currentPlaylistName][songName] = songId;
		this._currentPlaylist.push([songName, songId]);
		document.getElementById('playlist_content').firstChild.innerHTML += '<li><a id="' + songId + '" onclick="App.playSong(\'' + songId + '\');">' + songName + '</a><button class="delete" onclick="App.removeSong(\'' + songId + '\');">✖</button></li>';
		this.showMessage('Saving...');
		await this._s3fs.save('playlists.json', JSON.stringify(this._playlists, null, '\t'));
		this.showMessage('Saved.');
		document.getElementById('newSongName').value = '';
		document.getElementById('newSongId').value = '';
	}

	async removeSong(songId) {
		for (let i = 0; i < this._currentPlaylist.length; i++) {
			if (this._currentPlaylist[i][1] === songId) {
				let songName = this._currentPlaylist[i][0];
				if (!confirm('Are you sure you want to remove the song \'' + songName + '\' in the playlist \'' + this._currentPlaylistName + '\'?')) {
					return;
				}
				document.getElementById(songId).parentElement.parentElement.removeChild(document.getElementById(songId).parentElement);
				delete this._playlists[this._currentPlaylistName][songName];
				this.showMessage('Saving...');
				await this._s3fs.save('playlists.json', JSON.stringify(this._playlists, null, '\t'));
				this.showMessage('Saved.');
			}
		}
	}

	async addPlaylist() {
		let playlistName = document.getElementById('newPlaylistName').value;
		this._playlists[playlistName] = {}
		document.getElementById('playlists_content').firstChild.innerHTML += '<li><a id="' + playlistName + '" onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a><button class="delete" onclick="App.removePlaylist(\'' + playlistName + '\');">✖</button></li>';
		this.showMessage('Saving...');
		await this._s3fs.save('playlists.json', JSON.stringify(this._playlists, null, '\t'));
		this.showMessage('Saved.');
		document.getElementById('newPlaylistName').value = '';
	}

	async removePlaylist(playlistName) {
		if (!confirm('Are you sure you want to remove the playlist \'' + playlistName + '\'?')) {
			return;
		}
		delete this._playlists[playlistName];
		document.getElementById(playlistName).parentElement.parentElement.removeChild(document.getElementById(playlistName).parentElement);
		this.showMessage('Saving...');
		await s3fs.save('playlists.json', JSON.stringify(this._playlists, null, '\t'));
		this.showMessage('Saved.');
	}

	static onKeyUp(e) {
		if (['newSongName', 'newSongId', 'newPlaylistName'].includes(document.activeElement.id)) {
			return;
		}
		if (e.shiftKey && e.which == 80) { // shift p
			App.playSong(this._currentPlaylist[(this._currentSongIndex + this._currentPlaylist.length - 1) % this._currentPlaylist.length][1]);
		}
		else if (e.shiftKey && e.which == 78) { // shift n
			App.playSong(this._currentPlaylist[(this._currentSongIndex + 1) % this._currentPlaylist.length][1]);
		}
		else if (e.which == 75 || e.which == 32) { // k or space
			if (this._youtube.isPaused()) {
				this._youtube.unpause();
			}
			else {
				this._youtube.pause();
			}
		}
		else if (e.which == 77) {
			if (this._youtube.isMuted()) {
				this._youtube.unmute();
			}
			else {
				this._youtube.mute();
			}
		}
		else if (e.which == 70) {
			let iframe = document.getElementById('player');
			let requestFullScreen = iframe.requestFullScreen || iframe.mozRequestFullScreen || iframe.webkitRequestFullScreen;
			if (requestFullScreen) {
				requestFullScreen.bind(iframe)();
			}
		}
		else if (e.which == 74 || e.which == 37) {
			this._youtube.seekOffset(-10);
		}
		else if (e.which == 76 || e.which == 39) {
			this._youtube.seekOffset(10);
		}
	}

	showMessage(message) {
		console.log(message);
		if (this._messageTimeout) {
			clearTimeout(this._messageTimeout);
		}
		document.getElementById('message').innerHTML = message;
		document.getElementById('message').style.display = 'block';
		this._messageTimeout = setTimeout(App.hideMessage, 5000);
	}

	hideMessage() {
		document.getElementById('message').style.display = 'none';
		this._messageTimeout = null;
	}
}

document.addEventListener('DOMContentLoaded', async() => {
	let app = new App();
	window.app = app;
	app.initialize();

	// let playlistsDivContent = '<ul>';
	// Object.keys(playlists).forEach(function (playlistName, index) {
	// 	playlistsDivContent += '<li><a id="' + playlistName + '" onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a><button class="delete" onclick="App.removePlaylist(\'' + playlistName + '\');">✖</button></li>';
	// });
	// playlistsDivContent += '</ul>';
	// document.getElementById('playlists_content').innerHTML = playlistsDivContent;
	// App.updateTime();
});

document.addEventListener('keyup', App.onKeyUp, false);
document.addEventListener('blur', function () {
	document.focus();
});

window.App = App;