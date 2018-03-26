'use strict';

import YouTube from './youtube.js'
import S3 from '@fiddleplum/s3-fs/s3.js'

let urlSearchParams = new URLSearchParams(document.location.search.substring(1));
/** @type {YouTube} */
let youtube = null;
/** @type {S3} */
let s3 = null;
let playlists = {}
let currentPlaylist = []; // an array of 2-tuples (playlistName and songName)
let currentSongIndex = 0;

class App {
	static async loadS3() {
		let password = urlSearchParams.get('p');
		if (password === null) {
			console.log('Please provide a password in the url query p value.');
			return;
		}
		let key_file = 'keys/' + password.replace(/\W/g, '') + '.txt';
		let response = await fetch(key_file);
		let text = await response.text();
		let [access_key, secret_key, region] = text.split('\n');
		s3 = new S3(access_key.trim(), secret_key.trim(), region.trim(), 'data-hurley', 'YouTube Playlister');
	}

	static shuffleCurrentPlaylist() {
		for (let i = currentPlaylist.length; i; i--) {
			let j = Math.floor(Math.random() * i);
			[currentPlaylist[i - 1], currentPlaylist[j]] = [currentPlaylist[j], currentPlaylist[i - 1]];
		}
	}

	static playCurrentSong() {
		let playlistName = currentPlaylist[currentSongIndex][0]
		let songName = currentPlaylist[currentSongIndex][1]
		let songId = playlists[playlistName][songName];
		document.getElementById('currentPlaylist_' + currentSongIndex).className = 'currentSong';
		document.getElementById('currentSong').innerHTML = '<a href="https://www.youtube.com/watch?v=' + songId + '" target="_blank" onclick="YouTube.togglePause();">' + songName + '</a>';
		document.title = currentPlaylist[currentSongIndex][1];
		youtube.play(songId, function () {
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
		document.getElementById('currentPlaylist').innerHTML = currentPlaylistDivContent;
		currentSongIndex = 0;
		App.playCurrentSong();
	}

	static onKeyUp(e) {
		if (e.shiftKey && e.which == 80) { // shift p
			App.playSong((currentSongIndex + currentPlaylist.length - 1) % currentPlaylist.length);
		}
		else if (e.shiftKey && e.which == 78) { // shift n
			App.playSong((currentSongIndex + 1) % currentPlaylist.length);
		}
		else if (e.which == 75 || e.which == 32) { // k or space
			YouTube.togglePause();
		}
		else if (e.which == 77) {
			YouTube.toggleMute();
		}
		else if (e.which == 70) {
			let iframe = document.getElementById('player');
			let requestFullScreen = iframe.requestFullScreen || iframe.mozRequestFullScreen || iframe.webkitRequestFullScreen;
			if (requestFullScreen) {
				requestFullScreen.bind(iframe)();
			}
		}
		else if (e.which == 74 || e.which == 37) {
			YouTube.seekOffset(-10);
		}
		else if (e.which == 76 || e.which == 39) {
			YouTube.seekOffset(10);
		}
	}
}

document.addEventListener('DOMContentLoaded', async() => {
	await App.loadS3();
	if (s3 === null) {
		console.log('S3 not loaded.');
		return;
	}
	try {
		let playlistsText = await s3.load('playlists.json');
		playlists = JSON.parse(playlistsText);
	}
	catch (error) {
		console.log(error);
	}

	youtube = new YouTube();
	let playlistsDivContent = '<ul>';
	Object.keys(playlists).forEach(function (playlistName, index) {
		playlistsDivContent += '<li><a onclick="App.playPlaylist(\'' + playlistName + '\');">' + playlistName + '</a></li>';
	});
	playlistsDivContent += '</ul>';
	document.getElementById('playlists').innerHTML = playlistsDivContent;
});

document.addEventListener('keyup', App.onKeyUp, false);
document.addEventListener('blur', function () {
	document.focus();
});

window.App = App;