'use strict'

// emote selection class thing, to be used when editing a page or writing a comment.

const Emotes = {
	// List of emotes, with index markers
	list: {},
	// Same as previous, but lower case.
	normalized: {},
	// This data will be saved in a "registeredemotes" uservariable
	saved: {
		// Emotes defined by the user
		// name (required, string): name for the emote, used for alt text and :emote: syntax
		// tag (string): personal tag for grouping
		// favorite (boolean): is this emote favorited? displays in a separate list above others if so
		// priority (number): higher number = listed before others, meaning it'll have a higher index (the name, name~1 things)
		// type (required, string): currently one of "emote", "string", and "disable"
		// - "disable": take up the slot without a replacement. use case: type ":pensive:" without it turning into something if you do have other emotes with the name "pensive". no extra parameters.
		// - "string": when used, inserts a string. extra parameter string (string) specifies which string it is.
		// - "emote": when used, inserts an emote tag. extra parameters:
		// -- source (required, string): what source to use for emote. in most cases, this should be a blank string.
		// -- role (required, string): the role (size) of the emote. one of "icon", "emote", "medium", and "sticker"
		// -- id (required, string): id of the emote. this is what gets used alongside the source to find the url for the emote.
		registered: [],
		// String to check for on fetch
		magic: "Emotes",
		// Who knows, maybe it's necessary in the far flung future
		version: 1
	},
	// Emotes sourced from known locations (page values? images tagged with "emote"/"sticker"? or some other queried index)
	// key: where these were obtained from (such as "page/0")
	// not persistent yet? should it?
	known: {},
	// Emotes rendered by the markup renderer. keyed by tag representation, sorta
	// also not persistent right now.
	observed: {},
	fetched: false,
	generateList: function() {
		this.list = {}
		Array.from(this.saved.registered).sort((a, b)=>{
			if ((a.priority||0)<(b.priority||0)) return true
			else if (a.favorite < b.favorite) return true
			//else if (a.name > b.name) return true
			return false
		}).forEach(e=>this.add(e, true))
		Object.values(this.known).forEach(index=>index.forEach(e => this.add(e, false)))
		// go through the emotes backwards and remove any identical duplicates
		let keys = Object.keys(this.list)
		for (let i = keys.length - 1; i >= 0; i--) {
			let key = keys[i]
			let e = this.list[key]
			if (Object.values(this.list).findIndex(x => {
				if (x == e) return false
				if (x.type == e.type && x.type == "emote") {
					return x.name == e.name && x.source == e.source && x.role == e.role && x.id == e.id
				}
				return false
			}) != -1) {
				delete this.list[key]
				delete this.normalized[key.toLowerCase()]
			}
		}
	},
	add: function(emote, registered) {
		let key, i = 0
		do {
			key = `${emote.name}${i==0?"":"~"+i}`
			i++;
		} while (key.toLowerCase() in this.normalized)
		if (!key) return // ??? sure whatever failsafe
		let {favorite, priority, ...e} = emote
		e.group = registered ? (favorite ? "favorites" : "registered") : "known"
		this.list[key] = e
		this.normalized[key.toLowerCase()] = e
	},
	// Need this for code hooking
	original_emote_create: Markup.renderer.create.emote,
	observe: function(emote) {
		let id = emote.id.split("#")[0]
		let key = `${emote.source};${emote.role};${emote.name};${id}`
		this.observed[key] = {source: emote.source, role: emote.role, name: emote.name, id: id}
	},
	observeMany: function(emotes) {
		for (const emote of emotes) {
			this.observe(emote)
		}
	},
	recordIndex: function(emotes, name) {
		this.known[name] = JSON.parse(JSON.stringify(emotes))
	},
}
Markup.renderer.create.emote = function(emote, ...args) {
	Emotes.observe(emote)
	return Emotes.original_emote_create.apply(this, [emote, ...args])
}

class EmoteSelect {
	constructor() {
		new.target.template(this)
		this.control_buttons = {__proto__:null}
		let btn = (emotestring, emote, filter, role)=>{
			let btn = document.createElement('button')
			btn.onclick = ev=>{ EmoteSelect.insert_emote({emotestring, emote, filter, role}, this.$root) }
			btn.dataset.emotestring = emotestring
			btn.tabIndex=-1
			let label = document.createElement("span")
			label.textContent = emotestring
			if (this.$show_names.checked) btn.classList.add("showLabel")
			let elem = Emotes.original_emote_create({...emote, role: role || emote.role}, filter)
			elem.title = emotestring
			elem.style.setProperty('--button-size', elem.style.getPropertyValue('--size') <= 2 ? 2 : 8)
			btn.append(elem, label)
			switch (emote.group) {
				case "favorites":
					this.$favorite_emotes.append(btn)
					break
				case "registered":
					this.$registered_emotes.append(btn)
					break
				case "known": default:
					this.$known_emotes.append(btn)
			}
			this.control_buttons[emotestring] = btn
		}
		
		if (!Emotes.fetched && Req.me) {
			Req.chain({
				values: {key: "registeredemotes"},
				requests: [
					{ type: "uservariable", fields: "*", query: "key = @key" }
				]
			}).do = (resp, err) => {
				if (err) {
					console.error("Failed to query uservariable!", err)
					print(err)
					return
				}
				if (resp.uservariable[0]) {
					try {
						let data = JSON.parse(resp.uservariable[0].value)
						if (data.magic == "Emotes" && Array.isArray(data.registered)) {
							Emotes.saved = data
							Emotes.generateList()
							if (!this.$root.hidden) {
								this.show()
							}
							print("DEBUG: Emote query success!")
						} else {
							print("DEBUG: For some reason, registeredemotes was valid JSON, but not what we wanted!")
						}
					}
					catch (e) {
						console.error("Failed to parse registered emotes JSON!", e)
						print(e)
					}
				} else {
					print("DEBUG: There aren't any registered emotes!")
				}
				return
			}
			Emotes.fetched = true
		}
		
		this.filters = [this.$filter_h, this.$filter_v, this.$filter_r, this.$filter_p]
		
		this.$show_names.onchange = () => (this.$show_names.checked ? this.$root.classList.remove("showLabel") : this.$root.classList.add("showLabel"))
		
		this.show = this.$role_override.onchange = this.$filter_h.onclick = this.$filter_v.onclick = this.$filter_r.onclick = this.$filter_p.onclick = () => {
			this.$root.hidden = false
			this.$favorite_emotes.textContent = ""
			this.$registered_emotes.textContent = ""
			this.$known_emotes.textContent = ""
			let filter = this.filters.reduce((acc, current)=>(acc += current.checked ? current.value : ""), "")
			Object.keys(Emotes.list).forEach(key=>{
				//print(`${key}: ${Emotes[key].length}`)
				let e = Emotes.list[key]
				if (e.type == "emote")
					btn(key, e, filter, this.$role_override.value)
			})
		}
		
		this.$root.hidden = true
		//this.show()
		this.$close.onclick = ev=>{ this.$root.hidden = true }
	}
	
	toggle_visibility() {
		if (this.$root.hidden)
			this.show()
		else
			this.$root.hidden = true
	}
	
	static parse_syntax(text) {
		// maybe it's a little messy, and maybe it doesn't account for all cases
		let emoteRegex = /(?<!\\)(?:\n|>\[.*?]|[\\](?!https?|sbs)[a-z]+(?![a-zA-Z0-9])\[.*?]|^[\`]{3}(?!.*?[\`])(?: *[-\w.+#$ ]+? *(?![^\n]))?\n?[^]*?(?:\n?```|$)|[\`][^\`\n]*([\`]{2}[^\`\n]*)*[\`]?|:(?<emote>[\w\-#~]+):|(?<end>$))/
		let last = -1, match, string = ""
		while (match = emoteRegex.exec(text)) {
			last = match.index
			string += text.substring(0,match.index)
			let emote = match.groups.emote
			if (emote) {
				let name, index, filter, role
				[name, filter, role] = emote.split("#");
				let choice = Emotes.normalized[name.toLowerCase()]
				string += EmoteSelect.to_tag(choice, filter, role) || `:${emote}:`
			} else {
				string += text.substring(match.index,match.index+match[0].length)
			}
			text = text.substring(match.index+match[0].length)
			if (match.groups.end != undefined)
				break
		}
		return string
	}
	
	static to_tag(choice, filter, role) {
		let string = ""
		if (choice && choice.type != "disable") {
			filter = (choice.filter || "") + (filter || "")
			switch (choice.type) {
				case "emote":
					string+=`\\e[${choice.source};${role || choice.role || "emote"};${choice.name};${choice.id}`
					if (filter)
						string+=`#${filter}]`
					else 
						string+="]"
					break
				case "string":
					string+=choice.string
					break
			}
		}
		return string
	}
	
	static insert_emote(data, target) {
		let ev2 = new CustomEvent('insert_emote', {
			bubbles: true, cancellable: true,
			detail: data,
		})
		target.dispatchEvent(ev2)
	}
}

EmoteSelect.template = HTML`
<div $=root class='emote-select'>
<button $=close>×</button>Emotes
<div style="display: flex; align-items: center; gap: 0.25rem">
	<label>
		Compact (Hide Names): <input type="checkbox" class='FILL' $=show_names checked>
	</label>
	|
	<label>Emote Size Override: <select style="vertical-align: middle" $=role_override>
		<option value="">No Override</option>
		<option value="icon">Icon (1x)</option>
		<option value="emote">Emote (2x)</option>
		<option value="medium">Medium (4x)</option>
		<option value="sticker">Sticker (8x)</option>
	</select></label>
	<label>
		Flip Horizontal: <input type="checkbox" class='FILL' value=h $=filter_h>
	</label>
	|
	<label>
		Flip Vertical: <input type="checkbox" class='FILL' value=v $=filter_v>
	</label>
	|
	<label>
		Rotate 90°: <input type="checkbox" class='FILL' value=r $=filter_r>
	</label>
	|
	<label>
		Pixel: <input type="checkbox" class='FILL' value=p $=filter_p>
	</label>
</div>
<div style="">
	<h2>Favorites</h2>
	<div class="emoteRow" $=favorite_emotes></div>
	<h2>Registered</h2>
	<div class="emoteRow" $=registered_emotes></div>
	<h2>Known</h2>
	<!--(Once registered, emotes can be typed via a shorthand :name: syntax. Emote names are case insensitive.)-->
	<div class="emoteRow" $=known_emotes></div>
	<!--<h2>Observed</h2>
	<div class="emoteRow" $=known_emotes></div>-->
</div>
</div>
`
