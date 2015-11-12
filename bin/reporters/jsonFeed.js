var fs = require('fs'),
	path = require('path');

module.exports = function(data, args) {
	var jsonFeed = {
		lines: {
			added: 0,
			deleted: 0
		},
		commits: 0,
		feed: [ ]
	};
	
	var feedObjects = [ ];
	
	var i;
	for(i = data.length - 1; i >= 0; i--) {
		var current = data[i];
		
		jsonFeed.lines.added += current.lines.added;
		jsonFeed.lines.deleted += current.lines.deleted;
		jsonFeed.commits += current.commitCount;
		
		for(var o = current.commits.length - 1; o >= 0; o--) {
			var currentCommit = current.commits[o];
			currentCommit.name = data[i].name;
			feedObjects.push(currentCommit);
		}
	}
	
	if(args.asc) {
		feedObjects.sort(function(a, b) {
			return b.timestamp - a.timestamp;
		});
	}
	else {
		feedObjects.sort(function(a, b) {
			return a.timestamp - b.timestamp;
		});
	}

	var previousEntry;
	for(i = feedObjects.length - 1; i >= 0 ; i--) {
		var current = feedObjects[i];
		if(!previousEntry || previousEntry.name !== current.name
			|| previousEntry.author !== current.author) {
			previousEntry = {
				name: current.name,
				author: current.author,
				timestamp: current.timestamp, // Because of how this bit is structured, this will be the latest commited date
				count: 1,
				lines: {
					added: current.lines.added,
					deleted: current.lines.deleted
				}
			};
			jsonFeed.feed.push(previousEntry);
		}
		else {
			previousEntry.count++;
			previousEntry.lines.added += current.lines.added;
			previousEntry.lines.deleted += current.lines.deleted;
		}
	}
	
	return JSON.stringify(jsonFeed);
};