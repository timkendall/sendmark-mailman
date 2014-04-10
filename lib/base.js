/**
 * Module dependencies.
 */

var mongoose = require('mongoose'),
	List = mongoose.model('List'),
	Link = mongoose.model('Link'),
	_ = require('lodash'),
	async = require('async');


/**
 * Mailman
 *
 * Our Node.js module to extract varius items from an email.
 * By Timothy Kendall
 *
 */

function Mailman (options) {
	var options = options || {};
	this._param = options.param || 'test';
	return this;
}

Mailman.prototype.extractLinks = function (user, mail, callback) {

	if (!user) return null //throw new Error('Mailman needs a user field.');
	if (!mail) return null //throw new Error('Mailman needs a subject field.');
	if (!mail.subject) return null;

	var Links = [],
		_creator = user._id,
		listNames = extractCategories(mail.subject + mail.text || ''),
		urls = extractURLS(mail.subject + mail.text || '');

	// Validate Presence of URLS
	if (!urls) {
		console.log('Email contained no links.');
		return null;
	}

	// Find/or create List Objects
	this.findOrCreateLists(listNames, _creator, generateLinkObjects);

	function generateLinkObjects (Lists) {
		 // Generate 'Link' objects
		urls.forEach(function (url, index, array) {

			console.log(Lists.length);

			var link = {}
			link.url = url;
			link._lists = Lists;
			link.tags = [];
			link._creator = _creator;

			// Note: Extract same categories and tags for each url
			// Todo: Distinguish unique data for each url
			link.tags = extractTags(mail.text || '');

			Links.push(new Link(link));

			// Finally return asynchronously our Links array
			if (urls.length === Links.length) callback(Links);
		});
	}

	function extractURLS (subject) {
		var pattern = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/ig;
		var _urls = subject.match(pattern) || [];

		// Validate
		if(_urls.length === 0) return null;

		return _urls;
	}

	function extractCategories (message) {
		var pattern = /(\S*@\[[^\]]+\])|(\S*@\S+)/gi,
			categories = message.match(pattern) || [];

		// Add "Uncategorized" if no listed categories
		if(categories.length === 0) {
			categories.push('Uncategorized');
			return categories;
		}

		// Remove "-" (until better RegExp)
		categories.forEach(function (category, index, array) {
			console.log(category)

			if(category.length !== 0) {
				array[index] = category.replace('@', '');
			}

		})

		return categories;
	}

	function extractTags (message) {
		var pattern = /(\S*#\[[^\]]+\])|(\S*#\S+)/gi;
		var tags = message.match(pattern) || [];

		/*
		 * PROBLEM: Creates array of empty strings
		 */

		// Remove "#" (until better RegEx)
		tags.forEach(function (tag, index, array) {
			console.log(tag);
			if(tag.length !== 0) {
				array[index] = tag.replace('#', '');
			}
		})

		return tags;
	}
}

Mailman.prototype.findOrCreateLists = function (listNames, creator, callback) {
	var Lists = [];

	listNames.forEach(function (listName) {
		List.findOne({ name: listName, _creator: creator }, function (err, list) {
			if(err) return console.log(err);

			// Create List If It Doesn't Exist
			if (!list) {
				list = new List({ name: listName, _creator: creator });
				list.save(function (err) {
					if (err) console.log('Error saving list. - ' + err);
				});
			}
			// Push the List _id to Lists
			console.log('Pushing list _id ' + list._id + ', ' + list.name);
			Lists.push(list._id);

			if(Lists.length === listNames.length) callback(Lists);
		});
		// Temporary, should use async or promises
	});
};

/**
 * Expose `Mailman`.
 */
module.exports = Mailman;