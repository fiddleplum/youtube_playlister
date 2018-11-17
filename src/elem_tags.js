class ElemTags extends HTMLElement {
	constructor() {
		super();
		this._root = null;
	}

	connectedCallback() {
		this.innerHTML = `
			<style>
				elem-tags #root {
					padding: 1em;
				}
				elem-tags #root div {
					cursor: pointer;
				}
			</style>
			<div id="root"></div>`;
		this._root = this.querySelector('#root');
	}

	/**
	 * @param {Set<string>} tags
	 */
	set tags(tags) {
		this._root.innerHTML = '';
		for (let tag of tags) {
			let div = document.createElement('div');
			div.innerText = tag;
			div.addEventListener('click', () => {
				window.app.playTag(tag);
			});
			this._root.appendChild(div);
		}
	}
}

window.customElements.define('elem-tags', ElemTags);

export default ElemTags;
