'use strict';

import YouTube from './youtube';
import './elem_playlist';
import './elem_tags';
import './elem_messages';
import S3FS from '@fiddleplum/s3-fs';

/**
 * @typedef Song
 * @property {string} id
 * @property {string} title
 * @property {Set<string>} tags
 */

class App {
	constructor() {
		/** @type {YouTube} */
		this._youtube = null;
		/** @type {S3FS} */
		this._s3fs = null;
		/** @type {Map<string, Song>} */
		this._songs = new Map();
		/** @type {Set<string>} */
		this._tags = new Set();
		this._currentTagName = '';
		/** @type {Song[]} */
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
			let songsText = await this._s3fs.load('songs.json', false);
			for (let songEntry of Object.entries(JSON.parse(songsText))) {
				let song = {
					'id': songEntry[0],
					'title': songEntry[1][0],
					'tags': new Set()
				};
				for (let i = 1; i < songEntry[1].length; i++) {
					let tag = songEntry[1][i];
					song.tags.add(tag);
					this._tags.add(tag);
				}
				this._songs.set(song.id, song);
			}
		}
		catch (error) {
			this.showMessage(error);
		}

		// Populate HTML
		this.showMessage('Populating Lists');
		document.getElementById('tags').tags = this._tags;

		this.showMessage('Loaded and ready.');
	}

	/**
	 * @param {Song[]} playlist
	 */
	static shufflePlaylist(playlist) {
		for (let i = playlist.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[playlist[i], playlist[j]] = [playlist[j], playlist[i]];
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
			this.showMessage('The tag is empty.');
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

	playTag(tag) {
		if (this._currentTagName !== '') {
			document.getElementById(this._currentTagName).className = '';
		}
		document.getElementById('currentTagTitle').innerHTML = tag;
		this._currentTagName = tag;
		this._currentPlaylist = [];
		for (let songEntry of this._songs) {
			if (songEntry[1].tags.has(tag)) {
				this._currentPlaylist.push(songEntry[1]);
			}
		}
		App.shufflePlaylist(this._currentPlaylist);
		document.getElementById('playlist').songs = this._currentPlaylist;
		this._currentSongIndex = 0;
		// document.getElementById(tag).className = 'highlighted';
		// document.getElementById('newSong').style.display = 'block';
		// this.playCurrentSong();
	}

	async addSong() {
		let songName = document.getElementById('newSongName').value;
		let songId = document.getElementById('newSongId').value;
		this._tags[this._currentTagName][songName] = songId;
		this._currentPlaylist.push([songName, songId]);
		document.getElementById('tag_content').firstChild.innerHTML += '<li><a id="' + songId + '" onclick="App.playSong(\'' + songId + '\');">' + songName + '</a><button class="delete" onclick="App.removeSong(\'' + songId + '\');">✖</button></li>';
		this.showMessage('Saving...');
		await this._s3fs.save('tags.json', JSON.stringify(this._tags, null, '\t'));
		this.showMessage('Saved.');
		document.getElementById('newSongName').value = '';
		document.getElementById('newSongId').value = '';
	}

	async removeSong(songId) {
		for (let i = 0; i < this._currentPlaylist.length; i++) {
			if (this._currentPlaylist[i][1] === songId) {
				let songName = this._currentPlaylist[i][0];
				if (!confirm('Are you sure you want to remove the song \'' + songName + '\' in the tag \'' + this._currentTagName + '\'?')) {
					return;
				}
				document.getElementById(songId).parentElement.parentElement.removeChild(document.getElementById(songId).parentElement);
				delete this._tags[this._currentTagName][songName];
				this.showMessage('Saving...');
				await this._s3fs.save('tags.json', JSON.stringify(this._tags, null, '\t'));
				this.showMessage('Saved.');
			}
		}
	}

	async addTag() {
		let tagName = document.getElementById('newTagName').value;
		this._tags[tagName] = {}
		document.getElementById('tags_content').firstChild.innerHTML += '<li><a id="' + tagName + '" onclick="App.playTag(\'' + tagName + '\');">' + tagName + '</a><button class="delete" onclick="App.removeTag(\'' + tagName + '\');">✖</button></li>';
		this.showMessage('Saving...');
		await this._s3fs.save('tags.json', JSON.stringify(this._tags, null, '\t'));
		this.showMessage('Saved.');
		document.getElementById('newTagName').value = '';
	}

	async removeTag(tagName) {
		if (!confirm('Are you sure you want to remove the tag \'' + tagName + '\'?')) {
			return;
		}
		delete this._tags[tagName];
		document.getElementById(tagName).parentElement.parentElement.removeChild(document.getElementById(tagName).parentElement);
		this.showMessage('Saving...');
		await s3fs.save('tags.json', JSON.stringify(this._tags, null, '\t'));
		this.showMessage('Saved.');
	}

	static onKeyUp(e) {
		if (['newSongName', 'newSongId', 'newTagName'].includes(document.activeElement.id)) {
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
		document.getElementById('messages').addMessage(message);
	}
}

document.addEventListener('DOMContentLoaded', async() => {
	let app = new App();
	window.app = app;
	app.initialize();

	// let tagsDivContent = '<ul>';
	// Object.keys(tags).forEach(function (tagName, index) {
	// 	tagsDivContent += '<li><a id="' + tagName + '" onclick="App.playTag(\'' + tagName + '\');">' + tagName + '</a><button class="delete" onclick="App.removeTag(\'' + tagName + '\');">✖</button></li>';
	// });
	// tagsDivContent += '</ul>';
	// document.getElementById('tags_content').innerHTML = tagsDivContent;
	// App.updateTime();
});

document.addEventListener('keyup', App.onKeyUp, false);
document.addEventListener('blur', function () {
	// document.focus();
});

window.App = App;