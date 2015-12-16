var FFZ = window.FrankerFaceZ,
	constants = require('./constants'),
	utils = require('./utils'),

	MOD_BADGES = [
		['staff', 'staff', 'Staff'],
		['admin', 'admin', 'Admin'],
		['global_mod', 'global-moderator', 'Global Moderator'],
		['mod', 'moderator', 'Moderator']
	],

	badge_css = function(badge) {
		var out = ".badges .ffz-badge-" + badge.id + " { background-color: " + badge.color + '; background-image: url("' + badge.image + '"); ' + (badge.extra_css || "") + '}';
		if ( badge.transparent_image )
			out += ".badges .badge.alpha.ffz-badge-" + badge.id + ",.ffz-transparent-badges .badges .ffz-badge-" + badge.id + ' { background-image: url("' + badge.transparent_image + '"); }';
		return out;
	};


// --------------------
// Settings
// --------------------

FFZ.settings_info.show_badges = {
	type: "boolean",
	value: true,

	category: "Chat Appearance",
	name: "Additional Badges",
	help: "Show additional badges for bots, FrankerFaceZ donors, and other special users."
	};


FFZ.settings_info.legacy_badges = {
	type: "select",
	options: {
		0: "Default",
		1: "Moderator Only",
		2: "Mod + Turbo",
		3: "All Legacy Badges"
	},
	value: 0,

	category: "Chat Appearance",

	name: "Legacy Badges",
	help: "Use the old, pre-vector chat badges from Twitch in place of the new.",

	process_value: function(val) {
		if ( val === false )
			return 0;
		else if ( val === true )
			return 3;
		else if ( typeof val === "string" )
			return parseInt(val || "0");
		return val;
	},

	on_update: function(val) {
			this.toggle_style('badges-legacy', val === 3);
			this.toggle_style('badges-legacy-mod', val !== 0);
			this.toggle_style('badges-legacy-turbo', val > 1);
		}
	};


FFZ.settings_info.transparent_badges = {
	type: "select",
	options: {
		0: "Default",
		1: "Rounded",
		2: "Circular",
		3: "Circular (Color Only)",
		4: "Circular (Color Only, Small)",
		5: "Transparent"
	},

	value: 0,

	category: "Chat Appearance",
	no_bttv: true,

	name: "Badge Style",
	help: "Make badges appear rounded, completely circular, or transparent with no background at all.",

	process_value: function(val) {
		if ( val === false )
			return 0;
		else if ( val === true )
			return 5;
		else if ( typeof val === "string" )
			return parseInt(val || "0");
		return val;
	},

	on_update: function(val) {
			if ( this.has_bttv )
				return;

			this.toggle_style('badges-rounded', val === 1);
			this.toggle_style('badges-circular', val === 2 || val === 3 || val === 4);
			this.toggle_style('badges-blank', val === 3 || val === 4);
			this.toggle_style('badges-circular-small', val === 4);
			this.toggle_style('badges-transparent', val === 5);
			document.body.classList.toggle('ffz-transparent-badges', val === 5);
		}
	};


// --------------------
// Initialization
// --------------------

FFZ.prototype.setup_badges = function() {
	if ( ! this.has_bttv ) {
		var val = this.settings.transparent_badges;
		this.toggle_style('badges-rounded', val === 1);
		this.toggle_style('badges-circular', val === 2 || val === 3 || val === 4);
		this.toggle_style('badges-blank', val === 3 || val === 4);
		this.toggle_style('badges-circular-small', val === 4);
		this.toggle_style('badges-transparent', val === 5);
		document.body.classList.toggle('ffz-transparent-badges', val === 5);
	}

	this.toggle_style('badges-legacy', this.settings.legacy_badges === 3);
	this.toggle_style('badges-legacy-mod', this.settings.legacy_badges !== 0);
	this.toggle_style('badges-legacy-turbo', this.settings.legacy_badges > 1);

	this.log("Preparing badge system.");
	this.badges = {};

	this.log("Creating badge style element.");
	var s = this._badge_style = document.createElement('style');
	s.id = "ffz-badge-css";
	document.head.appendChild(s);

	this.log("Adding legacy donor badges.");
	this._legacy_add_donors();
}


// --------------------
// Reloading Badges
// --------------------

FFZ.ws_commands.reload_badges = function() {
	this._legacy_load_bots();
	this._legacy_load_donors();
}


FFZ.ws_commands.set_badge = function(data) {
	var user_id = data[0],
		slot = data[1],
		badge = data[2],

		user = this.users[user_id] = this.users[user_id] || {},
		badges = user.badges = user.badges || {};

	if ( badge === undefined || badge === null )
		delete badges[slot];
	else
		badges[slot] = badge;
}


// --------------------
// Badge Selection
// --------------------

FFZ.prototype.get_badges = function(user, room_id, badges, msg) {
	var data = this.users[user];
	if ( ! data || ! data.badges || ! this.settings.show_badges )
		return badges;

	for(var slot in data.badges) {
		if ( ! data.badges.hasOwnProperty(slot) )
			continue;

		var badge = data.badges[slot],
			full_badge = this.badges[badge.id] || {},
			old_badge = badges[slot];

		if ( full_badge.visible !== undefined ) {
			var visible = full_badge.visible;
			if ( typeof visible === "function" )
				visible = visible.bind(this)(room_id, user, msg, badges);

			if ( ! visible )
				continue;
		}

		if ( old_badge ) {
			var replaces = badge.hasOwnProperty('replaces') ? badge.replaces : full_badge.replaces;
			if ( ! replaces )
				continue;

			old_badge.image = badge.image || full_badge.image;
			old_badge.klass += ' ffz-badge-replacement';
			old_badge.title += ', ' + (badge.title || full_badge.title);
			continue;
		}

		badges[slot] = {
			klass: 'ffz-badge-' + badge.id,
			title: badge.title || full_badge.title,
			image: badge.image,
			color: badge.color,
			extra_css: badge.extra_css
		};
	}

	return badges;
}


FFZ.prototype.get_line_badges = function(msg) {
	var badges = {};

	if ( msg.room && msg.from === msg.room )
		badges[0] = {klass: 'broadcaster', title: 'Broadcaster'};
	else if ( msg.labels )
		for(var i=0, l = MOD_BADGES.length; i < l; i++) {
			var mb = MOD_BADGES[i];
			if ( msg.labels.indexOf(mb[0]) !== -1 ) {
				badges[0] = {klass: mb[1], title: mb[2]}
				break;
			}
		}

	if ( msg.labels && msg.labels.indexOf('subscriber') !== -1 )
		badges[10] = {klass: 'subscriber', title: 'Subscriber'}
	if ( msg.labels && msg.labels.indexOf('turbo') !== -1 )
		badges[15] = {klass: 'turbo', title: 'Turbo'};

	// FFZ Badges
	return this.get_badges(msg.from, msg.room, badges, msg);
}


FFZ.prototype.get_other_badges = function(user_id, room_id, user_type, has_sub, has_turbo) {
	var badges = {};

	if ( room_id && user_id === room_id )
		badges[0] = {klass: 'broadcaster', title: 'Broadcaster'};
	else
		for(var i=0, l = MOD_BADGES.length; i < l; i++) {
			var mb = MOD_BADGES[i];
			if ( user_type === mb[0] ) {
				badges[0] = {klass: mb[1], title: mb[2]};
				break;
			}
		}

	if ( has_sub )
		badges[10] = {klass: 'subscriber', title: 'Subscriber'}
	if ( has_turbo )
		badges[15] = {klass: 'turbo', title: 'Turbo'}

	return this.get_badges(user_id, room_id, badges, null);
}


// --------------------
// Render Badge
// --------------------

FFZ.prototype.render_badges = function(badges) {
	var out = [];
	for(var key in badges) {
		var badge = badges[key],
			css = badge.image ? 'background-image:url("' + utils.quote_attr(badge.image) + '");' : '';

		if ( badge.color )
			css += 'background-color:' + badge.color + ';'

		if ( badge.extra_css )
			css += badge.extra_css;

		out.push('<div class="badge float-left tooltip ' + utils.quote_attr(badge.klass) + '"' + (css ? ' style="' + utils.quote_attr(css) + '"' : '') + ' title="' + utils.quote_attr(badge.title) + '"></div>');
	}

	return out.join("");
}


// --------------------
// Extension Support
// --------------------

FFZ.prototype.bttv_badges = function(data) {
	if ( ! this.settings.show_badges )
		return;

	var user_id = data.sender,
		user = this.users[user_id],
		badges_out = [],
		insert_at = -1,
		alpha = BetterTTV.settings.get('alphaTags');

	if ( ! user || ! user.badges )
		return;

	if ( ! data.badges )
		data.badges = [];

	// Determine where in the list to insert these badges.
	for(var i=0; i < data.badges.length; i++) {
		var badge = data.badges[i];
		if ( badge.type == "subscriber" || badge.type == "turbo" ) {
			insert_at = i;
			break;
		}
	}

	for (var slot in user.badges) {
		if ( ! user.badges.hasOwnProperty(slot) )
			continue;

		var badge = user.badges[slot],
			full_badge = this.badges[badge.id] || {},
			desc = badge.title || full_badge.title,
			style = "";

		if ( full_badge.visible !== undefined ) {
			var visible = full_badge.visible;
			if ( typeof visible == "function" )
				visible = visible.bind(this)(null, user_id);

			if ( ! visible )
				continue;
		}

		if ( full_badge.replaces ) {
			var replaced = false;
			for(var i=0; i < data.badges.length; i++) {
				var b = data.badges[i];
				if ( b.type === full_badge.replaces_type ) {
					b.type = "ffz-badge-replacement " + b.type;
					b.description += ", " + (badge.title || full_badge.title) +
						'" style="background-image: url(' + utils.quote_attr('"' + (badge.image || full_badge.image) + '"') + ')';
					replaced = true;
					break;
				}
			}

			if ( replaced )
				continue;
		}

		if ( alpha && badge.transparent_image )
			style += 'background-image: url("' + badge.transparent_image + '");';
		else if ( badge.image )
			style += 'background-image: url("' + badge.image + '");';

		if ( badge.color && ! alpha )
			style += 'background-color: ' + badge.color + '; ';

		if ( badge.extra_css )
			style += badge.extra_css;

		if ( style )
			desc += '" style="' + utils.quote_attr(style);

		badges_out.push([(insert_at == -1 ? 1 : -1) * slot, {type: "ffz-badge-" + badge.id + (alpha ? " alpha" : ""), name: "", description: desc}]);
	}

	badges_out.sort(function(a,b){return a[0] - b[0]});

	if ( insert_at == -1 ) {
		while(badges_out.length)
			data.badges.push(badges_out.shift()[1]);
	} else {
		while(badges_out.length)
			data.badges.insertAt(insert_at, badges_out.shift()[1]);
	}
}


// --------------------
// Legacy Support
// --------------------

FFZ.bttv_known_bots = ["nightbot","moobot","sourbot","xanbot","manabot","mtgbot","ackbot","baconrobot","tardisbot","deejbot","valuebot","stahpbot"];


FFZ.prototype._legacy_add_donors = function() {
	// Developer Badge
	this.badges[0] = {id: 0, title: "FFZ Developer", color: "#FAAF19", image: "//cdn.frankerfacez.com/script/devicon.png", transparent_image: "//cdn.frankerfacez.com/script/devtransicon.png"};
	utils.update_css(this._badge_style, 0, badge_css(this.badges[0]));

	// Donor Badge
	this.badges[1] = {id: 1, title: "FFZ Donor", color: "#755000", image: "//cdn.frankerfacez.com/script/devicon.png"};
	utils.update_css(this._badge_style, 1, badge_css(this.badges[1]));

	// Bot Badge
	this.badges[2] = {id: 2, title: "Bot", color: "#595959", image: "//cdn.frankerfacez.com/script/boticon.png",
		replaces: true, replaces_type: "moderator",
		visible: function(r,user) { return !(this.has_bttv && FFZ.bttv_known_bots.indexOf(user)!==-1); }};

	utils.update_css(this._badge_style, 2, badge_css(this.badges[2]));

	// Load BTTV Bots
	for(var i=0; i < FFZ.bttv_known_bots.length; i++) {
		var name = FFZ.bttv_known_bots[i],
			user = this.users[name] = this.users[name] || {},
			badges = user.badges = user.badges || {};

		if ( ! badges[0] )
			badges[0] = {id:2};
	}

	// Special Badges
	this.users.sirstendec = {badges: {1: {id:0}}, sets: [4330]};
	this.users.zenwan = {badges: {0: {id:2, image: "//cdn.frankerfacez.com/script/momiglee_badge.png", title: "WAN"}}};

	this._legacy_load_bots();
	this._legacy_load_donors();
}

FFZ.prototype._legacy_load_bots = function(callback, tries) {
	jQuery.ajax(constants.SERVER + "script/bots.txt", {context: this})
		.done(function(data) {
			this._legacy_parse_badges(callback, data, 0, 2, "Bot (By: {})");

		}).fail(function(data) {
			if ( data.status == 404 )
				return typeof callback === "function" && callback(false, 0);

			tries = (tries || 0) + 1;
			if ( tries < 10 )
				this._legacy_load_bots(callback, tries);
		});
}

FFZ.prototype._legacy_load_donors = function(callback, tries) {
	jQuery.ajax(constants.SERVER + "script/donors.txt", {context: this})
		.done(function(data) {
			this._legacy_parse_badges(callback, data, 1, 1);

		}).fail(function(data) {
			if ( data.status == 404 )
				return typeof callback === "function" && callback(false, 0);

			tries = (tries || 0) + 1;
			if ( tries < 10 )
				return this._legacy_load_donors(callback, tries);
		});
}


FFZ.prototype._legacy_parse_badges = function(callback, data, slot, badge_id, title_template) {
	var title = this.badges[badge_id].title,
		count = 0,
		ds = null;

	title_template = title_template || '{}';

	if ( data != null ) {
		var lines = data.trim().split(/[ \t\n\r]+/);
		for(var i=0; i < lines.length; i++) {
			if ( ! /^\w/.test(lines[i]) )
				continue;

			var line_data = lines[i].split(";"),
				user_id = line_data[0],
				user = this.users[user_id] = this.users[user_id] || {},
				badges = user.badges = user.badges || {},
				sets = user.sets = user.sets || [];

			if ( ds !== null && sets.indexOf(ds) === -1 )
				sets.push(ds);

			if ( badges[slot] )
				continue;

			badges[slot] = {id: badge_id};
			if ( line_data.length > 1 )
				badges[slot].title = title_template.replace('{}', line_data[1]);
			count += 1;
		}
	}

	this.log('Added "' + title + '" badge to ' + utils.number_commas(count) + " users.");
	if ( callback )
		callback(true, count);

	return count;
}