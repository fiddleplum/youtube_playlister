class ElemTagList extends HTMLElement {
	constructor() {
		super();

		const shadowRoot = this.attachShadow({ mode: 'open' });

		this._ul = document.createElement('ul');

		shadowRoot.appendChild(this._ul);
	}

	set tags(tags) {
		for (let tag of tags) {
			const li = document.createElement('li');
			li.innerText = tag;
			this._ul.appendChild(li);
		}
	}
}

window.customElements.define('elem-tag-list', ElemTagList);

export default ElemTagList;
