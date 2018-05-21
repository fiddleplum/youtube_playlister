'use strict';

import YouTube from './youtube.js'
import S3FS from '@fiddleplum/s3-fs'

let urlSearchParams = new URLSearchParams(document.location.search.substring(1));
/** @type {YouTube} */
let youtube = null;
/** @type {S3FS} */
let s3fs = null;
let playlists = {}
let currentPlaylist = []; // an array of 2-tuples (playlistName and songName)
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
		let playlistName = currentPlaylist[currentSongIndex][0]
		let songName = currentPlaylist[currentSongIndex][1]
		let songId = playlists[playlistName][songName];

		document.getElementById('currentPlaylist_' + currentSongIndex).className = 'currentSong';
		document.getElementById('currentSongTitle').innerHTML = songName + ' <a href="https://www.youtube.com/watch?v=' + songId + '" target="_blank" onclick="youtube.pause();">➦</a>';
		document.title = 'YP: ' + currentPlaylist[currentSongIndex][1];
		youtube.play(songId, () => {
			document.getElementById('currentPlaylist_' + currentSongIndex).className = '';
			currentSongIndex += 1;
			if (currentSongIndex >= currentPlaylist.length) {
				currentSongIndex = 0;
			}
			App.playCurrentSong();
		});
	}

	static playSong(index) {
		document.getElementById('currentPlaylist_' + currentSongIndex).className = '';
		currentSongIndex = index;
		App.playCurrentSong();
	}

	static playPlaylist(playlistName) {
		document.getElementById('currentPlaylistTitle').innerHTML = playlistName;
		currentPlaylist = [];
		Object.keys(playlists[playlistName]).forEach(function (songName, index) {
			currentPlaylist.push([playlistName, songName]);
		});
		App.shuffleCurrentPlaylist();
		let currentPlaylistDivContent = '<ol>';
		currentPlaylist.forEach(function (song, index) {
			currentPlaylistDivContent += '<li><a id="currentPlaylist_' + index + '" onclick="App.playSong(' + index + ');">' + song[1] + '</a></li>';
		});
		currentPlaylistDivContent += '</ol>';
		document.getElementById('playlist_content').innerHTML = currentPlaylistDivContent;
		currentSongIndex = 0;
		document.getElementById('newSong').style.display = 'block';
		App.playCurrentSong();
	}

	static async addSong() {
		let name = document.getElementById('newSongName').value;
		let id = document.getElementById('newSongId').value;
		let index = currentPlaylist.length;
		let playlistName = currentPlaylist[currentSongIndex][0]
		playlists[playlistName][name] = id;
		currentPlaylist.push([playlistName, name]);
		document.getElementById('playlist_content').firstChild.innerHTML += '<li><a id="currentPlaylist_' + index + '" onclick="App.playSong(' + index + ');">' + name + '</a></li>';
		App.showMessage('Saving...');
		await s3fs.save('playlists.json', JSON.stringify(playlists, null, '\t'));
		App.showMessage('Saved.');
	}

	static onKeyUp(e) {
		if (['newSongName', 'newSongId'].includes(document.activeElement.id)) {
			return;
		}
		if (e.shiftKey && e.which == 80) { // shift p
			App.playSong((currentSongIndex + currentPlaylist.length - 1) % currentPlaylist.length);
		}
		else if (e.shiftKey && e.which == 78) { // shift n
			App.playSong((currentSongIndex + 1) % currentPlaylist.length);
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
		playlistsDivContent += '<li><a onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a></li>';
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