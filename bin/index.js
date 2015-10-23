#!/usr/bin/env node

var path = require('path'),
	url = require('url'),
	https = require('https'),
	fs = require('fs'),
	execSync = require('child_process').execSync;

var args = require('minimist')(process.argv.slice(2));

var config;
try {
	config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.c != null ? args.c : (args.config != null ? args.config : path.join((process.env.USERPROFILE || process.env.HOME), '.repomon')))));
}
catch(ex) {
	console.log('Error loading configuration file\n' + ex.toString());
	process.exit(1);
}

var cloneCompleted = {
	bitbucket: 0,
	github: 0
};

function fetchBitBucketRepo(authUsername, password, user, cloneMethod, callback, completeCalback, fetchUrl) {
	if(fetchUrl == null) {
		fetchUrl = 'https://bitbucket.org/api/2.0/repositories/' + user;
	}

	fetchUrl = url.parse(fetchUrl);
	fetchUrl.auth = authUsername + ':' + password;
	fetchUrl.method = 'GET';

	var req = https.request(fetchUrl, function(res) {
		var response = '';
		
		res.on('data', function(d) {
    		response += d.toString();
		});
		
		res.on('end', function(d) {
    		var data = JSON.parse(response);
			
			if(data.values && data.values.length > 0) {
				data.values.forEach(function(entry) {
					if(entry.scm === 'git') {
						if(entry.links && entry.links.clone && entry.links.clone.length > 0) {
							for(var i = 0; i < entry.links.clone.length; i++) {
								if(entry.links.clone[i].name === cloneMethod) {
									callback(entry.name, entry.links.clone[i].href);
								}
							}
						}
					}
				}, this);
			}
			
			if(data.next) {
				fetchBitBucketRepo(authUsername, password, user, cloneMethod, callback, completeCalback, data.next);
			}
			else {
				cloneCompleted.bitbucket++;
				if(config.bitbucket.repoLists.length === cloneCompleted.bitbucket) {
					completeCalback();
				}
			}
		});
		
		res.on('error', function() { 
			cloneCompleted.bitbucket++;
			if(config.bitbucket.repoLists.length === cloneCompleted.bitbucket) {
				completeCalback();
			}
		});
	});
	req.end();
}

function fetchGitHubRepo(authUsername, password, user, cloneMethod, callback, completeCalback, page) {
	if(!page) {
		page = 1;
	}
	
	var fetchUrl = url.parse('https://api.github.com/users/' + user + '/repos?page=' + page);
	fetchUrl.auth = authUsername + ':' + password;
	fetchUrl.method = 'GET';
	fetchUrl.headers = {
		'user-agent': authUsername
	};

	var req = https.request(fetchUrl, function(res) {
		var response = '';
		
		res.on('data', function(d) {
    		response += d.toString();
		});
		
		res.on('end', function(d) {
    		var data;
			try {
				data = JSON.parse(response);
			}
			catch(ex) { }
			
			if(data && data.length > 0) {
				data.forEach(function(entry) {
					callback(entry.name, entry[cloneMethod + '_url']);
				}, this);
				fetchGitHubRepo(authUsername, password, user, cloneMethod, callback, completeCalback, ++page);
			}
			else {
				cloneCompleted.github++;
				if(config.github.repoLists.length === cloneCompleted.github) {
					completeCalback();
				}
			}
		});
		
		res.on('error', function() { 
			cloneCompleted.github++;
			if(config.github.repoLists.length === cloneCompleted.github) {
				completeCalback();
			}
		});
	});
	req.end();
}

function cloneUrlCallback(name, clone) {
	var destPath = path.join(path.resolve(process.cwd(), config.git.repos), name);
	var exists = false;
	try {
		if(fs.statSync(destPath)) {
			exists = true;
		}
	}
	catch(ex) { }
	
	if(!exists) {
		console.log('Cloning remote: ' + clone);
		try {
			execSync(config.git.cmd + ' clone --recurse-submodules "' + clone + '" "' + destPath + '"', {
				stdio: [ undefined, undefined, undefined ]
			});
		}
		catch(ex) {
			console.error('Error cloning ' + clone + '\n' + ex.toString());
		}
	}
}

function cloneCompletionCallback() {
	if((!config.github.enabled || config.github.repoLists.length === cloneCompleted.github) &&
		(!config.bitbucket.enabled || config.bitbucket.repoLists.length === cloneCompleted.bitbucket)) {
		console.log('Running git inspection...');
		var reporterName = (args.r != null ? args.r : (args.reporter != null ? args.reporter : 'jsonFeed'));
		var reporter;
		try {
			reporter = require('./reporters/' + reporterName + '.js');
		}
		catch(ex) {
			console.log('Error opening ' + reporterName + ' reporter');
			process.exit(1);
		}
		var data = require('./inspector.js')(config);
		
		console.log('Generating ' + reporterName + ' report');
		reporter(data, args);
		
		console.log('Completed!\n');
	}
}

console.log('Cloning started...');

if(config.bitbucket.enabled) {
	config.bitbucket.repoLists.forEach(function(entry) {
		fetchBitBucketRepo(config.bitbucket.username, config.bitbucket.password, entry, config.bitbucket.method || "https", cloneUrlCallback, cloneCompletionCallback);
	}, this);
}

if(config.github.enabled) {
	config.github.repoLists.forEach(function(entry) {
		fetchGitHubRepo(config.github.username, config.github.password, entry, config.github.method || "clone", cloneUrlCallback, cloneCompletionCallback);
	}, this);
}

if(!config.github.enabled && !config.bitbucket.enabled) {
	cloneCompletionCallback();
}