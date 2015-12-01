var execSync = require('child_process').execSync,
	fs = require('fs'),
	path = require('path'),
	functions = require('./functions.js');

var defaultFileTypes = [ 'js', 'cs', 'cshtml', 'cc', 'c', 'cpp', 'cxx', 'java', 'html', 'css' ];

function parseNumStatLine(line, filetypeRegex, filefilter) {
	var columns = line.split('\t');
		
	if(columns && columns.length >= 3 && (columns[0] || '').trim() !== '-' || (columns[1] || '').trim() !== '-' && columns[2] != null && columns[2].match(filetypeRegex) && columns[2].match(filefilter)) {
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
			deleted: 0
		},
		commitCount: 0,
		commits: [ ]
	};
	
	var filetypeRegex = new RegExp('\.(' + options.filetypes.join('|') + ')$', 'i');
	
	process.chdir(options.gitDir); // Sucks to have to do this... NodeJS has buggy execSync functions when it comes to settings a child processes working directory
	
	if(options.pull) {
		try {
			execSync(options.cmd + ' pull --all', {
				stdio: [ undefined, undefined, undefined ]
			});
		}
		catch(ex) {
			return;
		}
	}
	
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
	
	var authorFilter = '';
	options.authors.forEach(function(author) {
		if(author && author.length > 0) {
			authorFilter += '--author="' + author + '" ';
		}
	}, this);
	
	var numStatOutput = execSync(options.cmd + ' log ' + authorFilter + '--pretty=tformat: --numstat').toString().trim();
	numStatOutput.split('\n').forEach(function(line) {
		var columns = parseNumStatLine(line, filetypeRegex, options.filefilter);
		if(columns) {
			ret.lines.added += columns[0];
			ret.lines.deleted += columns[1];
		}
	});
	
	var commitCount = parseInt(execSync(options.cmd + ' rev-list HEAD ' + authorFilter + '--count').toString().trim());
	if(!isNaN(commitCount)) {
		ret.commitCount = commitCount;
	}
	
	var commitsOutput = execSync(options.cmd + ' log ' + authorFilter + '--pretty=format:"%at:%an <%ae>" --numstat').toString().trim().split('\n');
	var len = commitsOutput.length,
		currentCommit;
	for(var i = 0; i < len; i++) {		
		var line = commitsOutput[i];
		
		line = line.trim();
		if(line.length === 0) {
			currentCommit = null;
			continue;
		}
		
		if(!currentCommit) {
			var sepIndex = line.indexOf(':');
			if(sepIndex !== -1) {
				var timestamp = parseInt(line.substr(0, sepIndex));
				
				if(options.filterTimestamp == null || timestamp >= options.filterTimestamp) {
					currentCommit = {
						author: line.substr(sepIndex + 1),
						timestamp: timestamp,
						lines: {
							added: 0,
							deleted: 0
						}
					};
					ret.commits.push(currentCommit);
				}
			}
		}
		else {
			var columns = parseNumStatLine(line, filetypeRegex, options.filefilter);
			if(columns) {
				currentCommit.lines.added += columns[0];
				currentCommit.lines.deleted += columns[1];
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
						pull: (!args['disable-pull'] || forcePull) && pulledrepos.indexOf(filepath) === -1
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