/**
 * @typedef Song
 * @property {string} title
 * @property {string[]} tags
 */

class ElemPlaylist extends HTMLElement {
	constructor() {
		super();
		this._root = null;
	}

	connectedCallback() {
		this.innerHTML = `
			<style>
				elem-playlist #root {
					padding: 1em;
				}
				elem-playlist #root div {
					cursor: pointer;
				}
			</style>
			<div id="root"></div>`;
		this._root = this.querySelector('#root');
	}

	/**
	 * @param {Song[]} songs
	 */
	set songs(songs) {
		this._root.innerHTML = '';
		console.log(songs);
		for (let song of songs) {
			let div = document.createElement('div');
			div.innerText = song.title;
			div.addEventListener('click', () => {
				window.app.playSong(song);
			});
			this._root.appendChild(div);
		}
	}
}

window.customElements.define('elem-playlist', ElemPlaylist);

export default ElemPlaylist;
