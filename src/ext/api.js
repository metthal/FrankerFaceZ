var FFZ = window.FrankerFaceZ,
	utils = require('../utils'),


	build_css = function(emote) {
		if ( ! emote.margins && ! emote.css )
			return "";

		return 'img[src="' + emote.urls[1] + '"]{' + (emote.margins ? 'margin:' + emote.margins + ';' : '') + (emote.css || "") + '}'
	};


// ---------------------
// API Constructor
// ---------------------

var API = FFZ.API = function(instance, name, icon) {
	this.ffz = instance || FFZ.get();

	// Check for a known API!
	if ( name ) {
		for(var id in this.ffz._known_apis) {
			if ( this.ffz._known_apis[id] === name ) {
				this.id = id;
				break;
			}
		}
	}

	if ( ! this.id ) {
		var i = 0;
		while( ! this.id ) {
			if ( ! this.ffz._known_apis.hasOwnProperty(i) ) {
				this.id = i;
				break;
			}
			i++;
		}

		if ( name ) {
			this.ffz._known_apis[this.id] = name;
			localStorage.ffz_known_apis = JSON.stringify(this.ffz._known_apis);
		}
	}


	this.ffz._apis[this.id] = this;

	this.emote_sets = {};
	this.global_sets = [];
	this.default_sets = [];

	this.on_room_callbacks = [];

	this.name = name || ("Extension#" + this.id);
	this.icon = icon || null;

	this.ffz.log('Registered New Extension #' + this.id + ': ' + this.name);
};


FFZ.prototype.api = function(name, icon) {
	// Load the known APIs list.
	if ( ! this._known_apis ) {
		this._known_apis = {};
		if ( localStorage.hasOwnProperty('ffz_known_apis') )
			try {
				this._known_apis = JSON.parse(localStorage.ffz_known_apis);
			} catch(err) {
				this.log("Error loading Known APIs: " + err);
			}
	}

	return new API(this, name, icon);
}


API.prototype.log = function(msg, data, to_json, log_json) {
	this.ffz.log('Ext "' + this.name + '": ' + msg, data, to_json, log_json);
}


// ---------------------
// Set Loading
// ---------------------

API.prototype._load_set = function(real_id, set_id, data) {
	if ( ! data )
		return null;

	// Check for an existing set to copy the users.
	var users = [];
	if ( this.emote_sets[real_id] && this.emote_sets[real_id].users )
		users = this.emote_sets[real_id].users;

	var emote_set = {
			source: this.name,
			source_ext: this.id,
			source_id: set_id,
			users: users,
			count: 0,
			emoticons: {},
			_type: data._type || 0,
			css: data.css || null,
			description: data.description || null,
			icon: data.icon || this.icon || null,
			id: real_id,
			title: data.title || "Global Emoticons",
		};

	this.emote_sets[real_id] = emote_set;

	if ( this.ffz.emote_sets )
		this.ffz.emote_sets[real_id] = emote_set;

	var output_css = "",
		ems = data.emoticons,
		emoticons = emote_set.emoticons;

	for(var i=0; i < ems.length; i++) {
		var emote = ems[i],
			new_emote = {urls: {}},
			id = emote.id || (this.name + '-' + set_id + '-' + i);

		if ( ! emote.name )
			continue;

		new_emote.id = id;
		new_emote.set_id = real_id;
		new_emote.name = emote.name;

		new_emote.width = emote.width;
		new_emote.height = emote.height;

		new_emote.hidden = emote.hidden;
		new_emote.owner = emote.owner;

		new_emote.css = emote.css;
		new_emote.margins = emote.margins;

		new_emote.srcSet = emote.urls[1] + ' 1x';
		new_emote.urls[1] = emote.urls[1];

		if ( emote.urls[2] ) {
			new_emote.urls[2] = emote.urls[2];
			new_emote.srcSet += ', ' + emote.urls[2] + ' 2x';
		}
		if ( emote.urls[3] ) {
			new_emote.urls[3] = emote.urls[3];
			new_emote.srcSet += ', ' + emote.urls[3] + ' 3x';
		}
		if ( emote.urls[4] ) {
			new_emote.urls[4] = emote.urls[4];
			new_emote.srcSet += ', ' + emote.urls[4] + ' 4x';
		}

		if ( emote.regex )
			new_emote.regex = emote.regex;
		else if ( typeof emote.name !== "string" )
			new_emote.regex = emote.name;
		else if ( emote_set.require_spaces || emote.require_spaces )
			new_emote.regex = new RegExp("(^| )(" + utils.escape_regex(emote.name) + ")(?= |$)", "g");
		else
			new_emote.regex = new RegExp("(^|\\W|\\b)(" + utils.escape_regex(emote.name) + ")(?=\\W|$)", "g");

		output_css += build_css(new_emote);
		emote_set.count++;
		emoticons[id] = new_emote;
	}

	utils.update_css(this.ffz._emote_style, real_id, output_css + (emote_set.css || ""));

	if ( this.ffz._cindex )
		this.ffz._cindex.ffzFixTitle();

	try {
		this.ffz.update_ui_link();
	} catch(err) { }

	return emote_set;
}


// -------------------------
// Loading / Unloading Sets
// -------------------------

API.prototype.load_set = function(id, emote_set) {
	var exact_id = this.id + '-' + id;

	emote_set.title = emote_set.title || "Global Emoticons";
	emote_set._type = emote_set._type || 0;

	emote_set = this._load_set(exact_id, id, emote_set);
	this.log("Loaded Emoticon Set #" + id + ": " + emote_set.title + " (" + emote_set.count + " emotes)", emote_set);
	return emote_set;
}


API.prototype.unload_set = function(id) {
	var exact_id = this.id + '-' + id,
		emote_set = this.emote_sets[exact_id];

	if ( ! emote_set )
		return;

	// First, let's unregister it as a global.
	this.unregister_global_set(id);


	// Now, remove the set data.
	utils.update_css(this.ffz._emote_style, exact_id, null);

	this.emote_sets[exact_id] = undefined;
	if ( this.ffz.emote_sets )
		this.ffz.emote_sets[exact_id] = undefined;


	// Remove from all its Rooms
	if ( emote_set.users ) {
		for(var i=0; i < emote_set.users.length; i++) {
			var room_id = emote_set.users[i],
				room = this.ffz.rooms && this.ffz.rooms[room_id];

			if ( ! room )
				continue;

			var ind = room.ext_sets.indexOf(exact_id);
			if ( ind !== -1 )
				room.ext_sets.splice(ind,1);
		}

		emote_set.users = [];
	}


	return emote_set;
}


API.prototype.get_set = function(id) {
	var exact_id = this.id + '-' + id;
	return this.emote_sets[exact_id];
}


// ---------------------
// Global Emote Sets
// ---------------------

API.prototype.register_global_set = function(id, emote_set) {
	var exact_id = this.id + '-' + id;

	if ( emote_set ) {
		// If a set was provided, load it.
		emote_set = this.load_set(id, emote_set);
	} else
		emote_set = this.emote_sets[exact_id];

	if ( ! emote_set )
		throw new Error("Invalid set ID");


	// Make sure the set is still available with FFZ.
	if ( ! this.ffz.emote_sets[exact_id] )
		this.ffz.emote_sets[exact_id] = emote_set;


	// It's a valid set if we get here, so make it global.
	if ( this.global_sets.indexOf(exact_id) === -1 )
		this.global_sets.push(exact_id);

	if ( this.default_sets.indexOf(exact_id) === -1 )
		this.default_sets.push(exact_id);

	if ( this.ffz.global_sets && this.ffz.global_sets.indexOf(exact_id) === -1 )
		this.ffz.global_sets.push(exact_id);

	if ( this.ffz.default_sets && this.ffz.default_sets.indexOf(exact_id) === -1 )
		this.ffz.default_sets.push(exact_id);
};


API.prototype.unregister_global_set = function(id) {
	var exact_id = this.id + '-' + id,
		emote_set = this.emote_sets[exact_id];

	if ( ! emote_set )
		return;

	// Remove the set from global sets.
	var ind = this.global_sets.indexOf(exact_id);
	if ( ind !== -1 )
		this.global_sets.splice(ind,1);

	ind = this.default_sets.indexOf(exact_id);
	if ( ind !== -1 )
		this.default_sets.splice(ind,1);

	ind = this.ffz.global_sets ? this.ffz.global_sets.indexOf(exact_id) : -1;
	if ( ind !== -1 )
		this.ffz.global_sets.splice(ind,1);

	ind = this.ffz.default_sets ? this.ffz.default_sets.indexOf(exact_id) : -1;
	if ( ind !== -1 )
		this.ffz.default_sets.splice(ind,1);
};


// -----------------------
// Per-Channel Emote Sets
// -----------------------

API.prototype.register_room_set = function(room_id, id, emote_set) {
	var exact_id = this.id + '-' + id,
		room = this.ffz.rooms && this.ffz.rooms[room_id];

	if ( ! room )
		throw new Error("Room not loaded");

	if ( emote_set ) {
		// If a set was provided, load it.
		emote_set.title = emote_set.title || "Channel: " + (room.display_name || room_id);
		emote_set._type = emote_set._type || 1;

		emote_set = this.load_set(id, emote_set);
	} else
		emote_set = this.emote_sets[exact_id];

	if ( ! emote_set )
		throw new Error("Invalid set ID");

	// Make sure the set is still available with FFZ.
	if ( ! this.ffz.emote_sets[exact_id] )
		this.ffz.emote_sets[exact_id] = emote_set;

	// Register it on the room.
	room.ext_sets.push(exact_id);
	emote_set.users.push(room_id);
}


API.prototype.unregister_room_set = function(room_id, id) {
	var exact_id = this.id + '-' + id,
		emote_set = this.emote_sets[exact_id],
		room = this.ffz.rooms && this.ffz.rooms[room_id];

	if ( ! emote_set || ! room )
		return;

	var ind = room.ext_sets.indexOf(exact_id);
	if ( ind !== -1 )
		room.ext_sets.splice(ind,1);

	ind = emote_set.users.indexOf(room_id);
	if ( ind !== -1 )
		emote_set.users.splice(ind,1);
}


// -----------------------
// Channel Callbacks
// -----------------------

API.prototype._room_callbacks = function(room_id, room, specific_func) {
	var callback = this.register_room_set.bind(this, room_id);

	if ( specific_func ) {
		try {
			specific_func(room_id, callback);
		} catch(err) {
			this.log("Error in On-Room Callback: " + err);
		}

	} else {
		for(var i=0; i < this.on_room_callbacks.length; i++) {
			var cb = this.on_room_callbacks[i];
			try {
				cb(room_id, callback);
			} catch(err) {
				this.log("Error in On-Room Callback: " + err);
			}
		}
	}
}


API.prototype.register_on_room_callback = function(callback, dont_iterate) {
	this.on_room_callbacks.push(callback);

	// Call this for all current rooms.
	if ( ! dont_iterate && this.ffz.rooms ) {
		for(var room_id in this.ffz.rooms)
			this._room_callbacks(room_id, this.ffz.rooms[room_id], callback);
	}
}


API.prototype.unregister_on_room_callback = function(callback) {
	var ind = this.on_room_callbacks.indexOf(callback);
	if ( ind !== -1 )
		this.on_room_callbacks.splice(ind, 1);
}