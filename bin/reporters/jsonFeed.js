var fs = require('fs'),
	path = require('path');

module.exports = function(config, data, args) {
	var ret = {
		global: {
			commits: 0,
			lines: {
				total: {
					added: 0,
					deleted: 0
				},
				filetypes: {
				}
			},
			files: {
				total: 0,
				filetypes: {
				}
			}
		},
		authors: {
		},
		feed: []
	};

	var filterTimestamp = Math.floor((Date.now() / 1000) - (config.git.lookback || 604800)),
		feedObjects = [];

	for(var i = 0; i < data.length; i++) {
		var repoEntry = data[i];

		ret.global.commits += repoEntry.commitCount;
		ret.global.lines.total.added += repoEntry.lines.added;
		ret.global.lines.total.deleted += repoEntry.lines.deleted;
		ret.global.files.total += repoEntry.files.total;

		var o;

		for(o in repoEntry.lines.filetypes) {
			if(!ret.global.lines.filetypes[o]) {
				ret.global.lines.filetypes[o] = {
					added: 0,
					deleted: 0
				};
			}
			ret.global.lines.filetypes[o].added += repoEntry.lines.filetypes[o].added;
			ret.global.lines.filetypes[o].deleted += repoEntry.lines.filetypes[o].deleted;
		}

		for(o in repoEntry.files.filetypes) {
			if(!ret.global.files.filetypes[o]) {
				ret.global.files.filetypes[o] = 0;
			}
			ret.global.files.filetypes[o] += repoEntry.files.filetypes[o];
		}

		for(o = 0; o < repoEntry.commits.length; o++) {
			var commitEntry = repoEntry.commits[o];

			var authorEntry = ret.authors[commitEntry.author];

			if(!authorEntry) {
				authorEntry = ret.authors[commitEntry.author] = {
					commits: 0,
					lastCommit: {
						timestamp: 0,
						project: ''
					},
					lines: {
						total: {
							added: 0,
							deleted: 0
						},
						filetypes: {
						}
					},
					projects: {
					}
				};
			}

			authorEntry.commits++;
			authorEntry.lines.total.added += commitEntry.lines.total.added;
			authorEntry.lines.total.deleted += commitEntry.lines.total.deleted;

			if(commitEntry.timestamp > authorEntry.lastCommit.timestamp) {
				authorEntry.lastCommit.timestamp = commitEntry.timestamp;
				authorEntry.lastCommit.project = repoEntry.name;
			}

			var n;

			for(n in commitEntry.lines.filetypes) {
				if(!authorEntry.lines.filetypes[n]) {
					authorEntry.lines.filetypes[n] = {
						added: 0,
						deleted: 0
					};
				}
				authorEntry.lines.filetypes[n].added += commitEntry.lines.filetypes[n].added;
				authorEntry.lines.filetypes[n].deleted += commitEntry.lines.filetypes[n].deleted;
			}

			var projectsEntry = authorEntry.projects[repoEntry.name];
			if(!projectsEntry) {
				projectsEntry = authorEntry.projects[repoEntry.name] = {
					commits: 0,
					lastCommit: 0,
					lines: {
						total: {
							added: 0,
							deleted: 0
						},
						filetypes: {
						}
					}
				};
			}

			projectsEntry.commits++;
			projectsEntry.lines.total.added += commitEntry.lines.total.added;
			projectsEntry.lines.total.deleted += commitEntry.lines.total.deleted;

			if(commitEntry.timestamp > projectsEntry.lastCommit) {
				projectsEntry.lastCommit = commitEntry.timestamp;
			}

			for(n in commitEntry.lines.filetypes) {
				if(!projectsEntry.lines.filetypes[n]) {
					projectsEntry.lines.filetypes[n] = {
						added: 0,
						deleted: 0
					};
				}
				projectsEntry.lines.filetypes[n].added += commitEntry.lines.filetypes[n].added;
				projectsEntry.lines.filetypes[n].deleted += commitEntry.lines.filetypes[n].deleted;
			}

			if(commitEntry.timestamp >= filterTimestamp) {
				feedObjects.push({
					name: repoEntry.name,
					author: commitEntry.author,
					timestamp: commitEntry.timestamp,
					lines: {
						added: commitEntry.lines.total.added,
						deleted: commitEntry.lines.total.deleted
					}
				});
			}
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
		var currentObject = feedObjects[i];
		if(!previousEntry || previousEntry.name !== currentObject.name
			|| previousEntry.author !== currentObject.author) {
			previousEntry = {
				name: currentObject.name,
				author: currentObject.author,
				timestamp: currentObject.timestamp, // Because of how this bit is structured, this will be the latest commited date
				count: 1,
				lines: {
					added: currentObject.lines.added,
					deleted: currentObject.lines.deleted
				}
			};
			ret.feed.push(previousEntry);
		}
		else {
			previousEntry.count++;
			previousEntry.lines.added += currentObject.lines.added;
			previousEntry.lines.deleted += currentObject.lines.deleted;
		}
	}

	return JSON.stringify(ret);
};