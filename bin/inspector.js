var execSync = require('child_process').execSync,
	fs = require('fs'),
	path = require('path'),
	functions = require('./functions.js');

var defaultFileTypes = [ 'js', 'cs', 'cshtml', 'cc', 'c', 'cpp', 'cxx', 'java', 'html', 'css' ];

function parseNumStatLine(line, filetypeRegex, filefilter) {
	var columns = line.split('\t');

	if(columns && columns.length >= 3 && ((columns[0] || '').trim() !== '-' || (columns[1] || '').trim() !== '-') && columns[2] != null && filetypeRegex.test(columns[2]) && filefilter.test(columns[2])) {
		columns[0] = parseInt(columns[0]);
		columns[1] = parseInt(columns[1]);
		return columns;
	}
}

function inspectRepo(options) {
	if(!options.filetypes) {
		options.filetypes = defaultFileTypes;
	}
	
	if(!options.filefilter) {
		options.filefilter = '.*';
	}
	
	options.filefilter = new RegExp(options.filefilter, 'i');
	
	if(!options.authors) {
		options.authors = [ ];
	}
	
	if(options.authors.length === 0) {
		options.authors.push('');
	}
	
	var ret = {
		lines: {
			added: 0,
			deleted: 0,
			filetypes: {
				
			}
		},
		commitCount: 0,
		commits: [ ]
	};
	
	var filetypeRegex = new RegExp('\\.(' + options.filetypes.join('|') + ')$', 'i');
	
	process.chdir(options.gitDir); // Sucks to have to do this... NodeJS has buggy execSync functions when it comes to settings a child processes working directory
	
	if(options.pull) {
		try {
			execSync(options.cmd + ' fetch --all', {
				stdio: [ undefined, undefined, undefined ]
			});
		}
		catch(ex) {
			return;
		}
	}
	
	var authorFilter = '';
	options.authors.forEach(function(author) {
		if(author && author.length > 0) {
			authorFilter += '--author="' + author + '" ';
		}
	}, this);
	
	var currentCommit;
	if(options.lastBranch) {
		var currentBranch, checkoutBranch = options.branch;
		if(!checkoutBranch) { // No branch selected, use latest
			var latestTimestamp = 0;
	
			var localBranches = [ ];
			execSync(options.cmd + ' branch --list --no-color').toString().trim().split('\n').forEach(function(branchName) {
				branchName = branchName.trim();
				if(branchName[0] === '*') {
					branchName = branchName.slice(1).trim();
					currentBranch = branchName;
				}
				localBranches.push(branchName);
			});
		
			var branchesOutput = execSync(options.cmd + ' branch --list -r --no-color');
			branchesOutput.toString().trim().split('\n').forEach(function(branchName) {
				branchName = branchName.trim();
				
				if(branchName.length === 0) {
					return;
				}
				
				if(branchName.indexOf(' -> ') === -1) {
					branchName = branchName.substr(branchName.indexOf('/') + 1);
					
					if(localBranches.indexOf(branchName) === -1) { // Checkout branch if it doesn't exist locally
						execSync(options.cmd + ' checkout -f ' + branchName, {
							stdio: [ undefined, undefined, undefined ]
						});
						currentBranch = branchName;
					}
	
					var timestamp = parseInt(execSync(options.cmd + ' log ' + branchName + ' -1 --pretty=tformat:"%at"'));
					
					if(timestamp > latestTimestamp) {
						checkoutBranch = branchName;
						latestTimestamp = timestamp;
					}
				}
			}, this);
		}
		
		if(!checkoutBranch) { // No valid branches
			return;
		}
		
		if(currentBranch !== checkoutBranch) {
			execSync(options.cmd + ' checkout -f ' + checkoutBranch, {
				stdio: [ undefined, undefined, undefined ]
			});
		}
		
		var commitsOutput = execSync(options.cmd + ' log ' + authorFilter + '--pretty=format:"%at:%an <%ae>" --numstat').toString().trim().split('\n');
		var len = commitsOutput.length;
		for(var i = 0; i < len; i++) {		
			var line = commitsOutput[i].trim();
			if(line) {
				if(currentCommit) {
					var columns = parseNumStatLine(line, filetypeRegex, options.filefilter);
					if(columns) {
						var filetype = path.extname(columns[2]);
						var filetypeCount = ret.lines.filetypes[filetype];
						if(!filetypeCount) {
							filetypeCount = ret.lines.filetypes[filetype] = {
								added: 0,
								deleted: 0
							};
						}
						filetypeCount.added += columns[0];
						filetypeCount.deleted += columns[1];
						currentCommit.lines.added += columns[0];
						currentCommit.lines.deleted += columns[1];
					}
				}
				else {
					var sepIndex = line.indexOf(':');
					if(sepIndex !== -1) {
						var timestamp = parseInt(line.substr(0, sepIndex));
						ret.commitCount++;
						currentCommit = {
							author: line.substr(sepIndex + 1),
							timestamp: timestamp,
							lines: {
								added: 0,
								deleted: 0
							}
						};
						if(options.filterTimestamp == null || timestamp >= options.filterTimestamp) {
							ret.commits.push(currentCommit);
						}
					}
				}
			}
			
			if((!line || i + 1 >= len) && currentCommit) {
				ret.lines.added += currentCommit.lines.added;
				ret.lines.deleted += currentCommit.lines.deleted;
				currentCommit = null;
			}
		}
	}
	else {
		var branches = [ ],
			c,
			branchList = execSync(options.cmd + ' branch --list -r --no-color').toString().trim().split('\n'),
			branchLen = branchList.length;
		for(c = 0; c < branchLen; c++) {
			var branchName = branchList[c].trim();	
			if(branchName.length === 0) {
				return;
			}
			
			if(branchName.indexOf(' -> ') === -1) {
				branches.push(branchName);
			}
		}
		
		var hashes = [ ];
		branchLen = branches.length;
		for(c = 0; c < branchLen; c++) {
			var lines = execSync(options.cmd + ' log ' + branches[c] + ' ' + authorFilter + '--pretty=format:"%H:%at:%an <%ae>" --numstat').toString().trim().split('\n'),
				lineLen = lines.length;
			for(var o = 0; o < lineLen; o++) {
				var currentLine = lines[o].trim();
				if(currentLine) {
					if(currentCommit) {
						var currentColumns = parseNumStatLine(currentLine, filetypeRegex, options.filefilter);
						if(currentColumns) {
							var filetypeExtension = path.extname(currentColumns[2]);
							var filetypeExtensionCount = ret.lines.filetypes[filetypeExtension];
							if(!filetypeExtensionCount) {
								filetypeExtensionCount = ret.lines.filetypes[filetypeExtension] = {
									added: 0,
									deleted: 0
								};
							}
							filetypeExtensionCount.added += currentColumns[0];
							filetypeExtensionCount.deleted += currentColumns[1];
							currentCommit.lines.added += currentColumns[0];
							currentCommit.lines.deleted += currentColumns[1];
						}
					}
					else {
						var pos = currentLine.indexOf(':');
						if(pos === -1) {
							continue;
						}
						var currentHash = currentLine.slice(0, pos);
						
						if(hashes.indexOf(currentHash) !== -1) {
							continue;
						}
						
						hashes.push(currentHash);
						
						var lastPos = pos + 1;
						pos = currentLine.indexOf(':', lastPos);
						
						if(pos === -1) {
							continue;
						}

						ret.commitCount++;
						currentCommit = {
							author: currentLine.slice(pos + 1),
							timestamp: currentLine.slice(lastPos, pos),
							lines: {
								added: 0,
								deleted: 0
							}
						};
						if(options.filterTimestamp == null || currentCommit.timestamp >= options.filterTimestamp) {
							ret.commits.push(currentCommit);
						}
					}
				}

				if((!currentLine || o + 1 >= lineLen) && currentCommit) {
					ret.lines.added += currentCommit.lines.added;
					ret.lines.deleted += currentCommit.lines.deleted;
					currentCommit = null;
				}
			}
		}
	}
	
	return ret;
}

module.exports = function(config, args, pulledrepos) {
	var currentDir = process.cwd();
	var repoDir = path.resolve(currentDir, config.git.repos);
	
	var ret = [ ];
	try {
		fs.readdirSync(repoDir).forEach(function(file) {
			var filepath = path.join(repoDir, file);
			try {
				var allowScan = false;
				try {
					allowScan = fs.statSync(filepath).isDirectory()
				}
				catch(ex) { }
				
				if(allowScan) {
					var forcePull = args['force-pull'] === file || Array.isArray(args['force-pull']) && args['force-pull'].indexOf(file) !== -1;
					console.log(' -> ' + file + (args['disable-pull'] && forcePull ? ' (forced pull)' : ''));
					var inspectData = inspectRepo({
						cmd: config.git.cmd,
						gitDir: filepath,
						authors: config.git.authors,
						filetypes: config.git.defaultFiletypes || config.git.filetypes[file],
						filefilter: config.git.filter[file],
						filterTimestamp: Math.floor((Date.now() / 1000) - (config.git.lookback || 604800)),
						branch: config.git.branch[file],
						pull: (!args['disable-pull'] || forcePull) && pulledrepos.indexOf(filepath) === -1,
						lastBranch: args['last-branch']
					});
					
					if(inspectData) {
						inspectData.name = file;
						ret.push(inspectData);
					}
					else { // If nothing is returned, delete the directory to prevent things like this again
						process.chdir(currentDir); // Back to the original directory
						functions.rmdir(filepath);
					}
				}
			}
			catch(ex) {
				console.error('Error while working on ' + filepath + '\n' + ex.toString());
			}
		}, this);
	}
	catch(ex) {
		console.error('Error while trying to read local repos\n' + ex.toString());
	}
	
	process.chdir(currentDir);
	
	return ret;
};