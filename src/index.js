'use strict';

import YouTube from './youtube.js'
import S3FS from '@fiddleplum/s3-fs'

let urlSearchParams = new URLSearchParams(document.location.search.substring(1));
/** @type {YouTube} */
let youtube = null;
/** @type {S3FS} */
let s3fs = null;
let playlists = {}
let currentPlaylistName = '';
let currentPlaylist = []; // an array of 2-tuples (songName and songId)
let currentSongIndex = 0;
let messageTimeout = null;

class App {
	static async loadS3() {
		let password = urlSearchParams.get('p');
		if (password === null) {
			App.showMessage('Please provide a password in the url query p value.');
			return;
		}
		let key_file = 'keys/' + password.replace(/\W/g, '') + '.txt';
		let response = await fetch(key_file);
		let text = await response.text();
		let [access_key, secret_key, region] = text.split('\n');
		s3fs = new S3FS(access_key.trim(), secret_key.trim(), region.trim(), 'data-hurley', 'YouTube Playlister');
	}

	static shuffleCurrentPlaylist() {
		for (let i = currentPlaylist.length; i; i--) {
			let j = Math.floor(Math.random() * i);
			[currentPlaylist[i - 1], currentPlaylist[j]] = [currentPlaylist[j], currentPlaylist[i - 1]];
		}
	}

	static formatTime(seconds) {
		let s = '';
		if (seconds >= 3600) {
			s += Math.floor(seconds / 3600) + ':';
			seconds -= Math.floor(seconds / 3600) * 3600;
		}
		s += Math.floor(seconds / 60).toString().padStart(s != '' ? 2 : 1, '0') + ':';
		seconds -= Math.floor(seconds / 60) * 60;
		s += Math.floor(seconds).toString().padStart(2, '0');
		return s;
	}

	static updateTime() {
		if (youtube.isPlayingOrPaused()) {
			document.getElementById('songTime').innerHTML = App.formatTime(youtube.getCurrentTime()) + ' / ' + App.formatTime(youtube.getTotalTime());
		}
		else {
			document.getElementById('songTime').innerHTML = '';
		}
		setTimeout(App.updateTime, 500);
	}

	static playCurrentSong() {
		if (currentPlaylist.length === 0) {
			App.showMessage('The playlist is empty.');
			youtube.stop();
			document.getElementById('currentSongTitle').innerHTML = '';
			return;
		}
		let songName = currentPlaylist[currentSongIndex][0];
		let songId = currentPlaylist[currentSongIndex][1];

		document.getElementById(songId).className = 'highlighted';
		document.getElementById('currentSongTitle').innerHTML = songName + ' <a href="https://www.youtube.com/watch?v=' + songId + '" target="_blank" onclick="youtube.pause();">➦</a>';
		document.title = 'YP: ' + songName;
		youtube.play(songId, () => {
			let oldSongId = currentPlaylist[currentSongIndex][1];
			document.getElementById(oldSongId).className = '';
			currentSongIndex += 1;
			if (currentSongIndex >= currentPlaylist.length) {
				currentSongIndex = 0;
			}
			App.playCurrentSong();
		});
	}

	static playSong(songId) {
		let oldSongId = currentPlaylist[currentSongIndex][1];
		document.getElementById(oldSongId).className = '';
		for (let i = 0; i < currentPlaylist.length; i++) {
			if (currentPlaylist[i][1] === songId) {
				currentSongIndex = i;
				App.playCurrentSong();
			}
		}
	}

	static playPlaylist(playlistName) {
		if (currentPlaylistName != '') {
			document.getElementById(currentPlaylistName).className = '';
		}
		document.getElementById('currentPlaylistTitle').innerHTML = playlistName;
		currentPlaylistName = playlistName;
		currentPlaylist = [];
		Object.keys(playlists[playlistName]).forEach(function (songName, index) {
			currentPlaylist.push([songName, playlists[playlistName][songName]]);
		});
		App.shuffleCurrentPlaylist();
		let currentPlaylistDivContent = '<ol>';
		currentPlaylist.forEach(function (entry, index) {
			let songName = entry[0];
			let songId = entry[1];
			currentPlaylistDivContent += '<li><a id="' + songId + '" onclick="App.playSong(\'' + songId + '\');">' + songName + '</a><button class="delete" onclick="App.removeSong(\'' + songId + '\');">✖</button></li>';
		});
		currentPlaylistDivContent += '</ol>';
		document.getElementById('playlist_content').innerHTML = currentPlaylistDivContent;
		currentSongIndex = 0;
		document.getElementById(playlistName).className = 'highlighted';
		document.getElementById('newSong').style.display = 'block';
		App.playCurrentSong();
	}

	static async addSong() {
		let songName = document.getElementById('newSongName').value;
		let songId = document.getElementById('newSongId').value;
		let playlistName = currentPlaylist[0][0]
		playlists[currentPlaylistName][songName] = songId;
		currentPlaylist.push([songName, songId]);
		document.getElementById('playlist_content').firstChild.innerHTML += '<li><a id="' + songId + '" onclick="App.playSong(\'' + songId + '\');">' + songName + '</a><button class="delete" onclick="App.removeSong(\'' + songId + '\');">✖</button></li>';
		App.showMessage('Saving...');
		await s3fs.save('playlists.json', JSON.stringify(playlists, null, '\t'));
		App.showMessage('Saved.');
		document.getElementById('newSongName').value = '';
		document.getElementById('newSongId').value = '';
	}

	static async removeSong(songId) {
		for (let i = 0; i < currentPlaylist.length; i++) {
			if (currentPlaylist[i][1] === songId) {
				let songName = currentPlaylist[i][0];
				if (!confirm('Are you sure you want to remove the song \'' + songName + '\' in the playlist \'' + currentPlaylistName + '\'?')) {
					return;
				}
				document.getElementById(songId).parentElement.parentElement.removeChild(document.getElementById(songId).parentElement);
				delete playlists[currentPlaylistName][songName];
				App.showMessage('Saving...');
				await s3fs.save('playlists.json', JSON.stringify(playlists, null, '\t'));
				App.showMessage('Saved.');
			}
		}
	}

	static async addPlaylist() {
		let playlistName = document.getElementById('newPlaylistName').value;
		playlists[playlistName] = {}
		document.getElementById('playlists_content').firstChild.innerHTML += '<li><a id="' + playlistName + '" onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a><button class="delete" onclick="App.removePlaylist(\'' + playlistName + '\');">✖</button></li>';
		App.showMessage('Saving...');
		await s3fs.save('playlists.json', JSON.stringify(playlists, null, '\t'));
		App.showMessage('Saved.');
		document.getElementById('newPlaylistName').value = '';
	}

	static async removePlaylist(playlistName) {
		if (!confirm('Are you sure you want to remove the playlist \'' + playlistName + '\'?')) {
			return;
		}
		delete playlists[playlistName];
		document.getElementById(playlistName).parentElement.parentElement.removeChild(document.getElementById(playlistName).parentElement);
		App.showMessage('Saving...');
		await s3fs.save('playlists.json', JSON.stringify(playlists, null, '\t'));
		App.showMessage('Saved.');
	}

	static onKeyUp(e) {
		if (['newSongName', 'newSongId', 'newPlaylistName'].includes(document.activeElement.id)) {
			return;
		}
		if (e.shiftKey && e.which == 80) { // shift p
			App.playSong(currentPlaylist[(currentSongIndex + currentPlaylist.length - 1) % currentPlaylist.length][1]);
		}
		else if (e.shiftKey && e.which == 78) { // shift n
			App.playSong(currentPlaylist[(currentSongIndex + 1) % currentPlaylist.length][1]);
		}
		else if (e.which == 75 || e.which == 32) { // k or space
			if (youtube.isPaused()) {
				youtube.unpause();
			}
			else {
				youtube.pause();
			}
		}
		else if (e.which == 77) {
			if (youtube.isMuted()) {
				youtube.unmute();
			}
			else {
				youtube.mute();
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
			youtube.seekOffset(-10);
		}
		else if (e.which == 76 || e.which == 39) {
			youtube.seekOffset(10);
		}
	}

	static showMessage(message) {
		if (messageTimeout) {
			clearTimeout(messageTimeout);
		}
		document.getElementById('message').innerHTML = message;
		document.getElementById('message').style.display = 'block';
		messageTimeout = setTimeout(App.hideMessage, 5000);
	}

	static hideMessage() {
		document.getElementById('message').style.display = 'none';
		messageTimeout = null;
	}
}

document.addEventListener('DOMContentLoaded', async() => {
	App.showMessage('Loading...');
	await App.loadS3();
	if (s3fs === null) {
		App.showMessage('S3 not loaded.');
		return;
	}
	try {
		let playlistsText = await s3fs.load('playlists.json');
		playlists = JSON.parse(playlistsText);
	}
	catch (error) {
		App.showMessage(error);
	}

	youtube = new YouTube(App.showMessage);
	window.youtube = youtube;
	let playlistsDivContent = '<ul>';
	Object.keys(playlists).forEach(function (playlistName, index) {
		playlistsDivContent += '<li><a id="' + playlistName + '" onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a><button class="delete" onclick="App.removePlaylist(\'' + playlistName + '\');">✖</button></li>';
	});
	playlistsDivContent += '</ul>';
	document.getElementById('playlists_content').innerHTML = playlistsDivContent;
	App.showMessage('Loaded and ready.');
	App.updateTime();
});

document.addEventListener('keyup', App.onKeyUp, false);
document.addEventListener('blur', function () {
	document.focus();
});

window.App = App;