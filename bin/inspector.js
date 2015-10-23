var execSync = require('child_process').execSync,
	fs = require('fs'),
	path = require('path');

var defaultFileTypes = [ 'js', 'cs', 'cshtml', 'cc', 'c', 'cpp', 'cxx', 'java', 'html', 'css' ];

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
		execSync(options.cmd + ' pull --all');
	}
	
	if(!options.branch) { // No branch selected, use latest
		var latestTimestamp = 0;
	
		var branchesOutput = execSync(options.cmd + ' branch --list -r --no-color');
		branchesOutput.toString().trim().split('\n').forEach(function(branchName) {
			branchName = branchName.trim();
			if(branchName.indexOf(' -> ') === -1) {
				branchName = branchName.substr(branchName.indexOf('/') + 1);
				
				execSync(options.cmd + ' checkout -f ' + branchName, {
					stdio: [ undefined, undefined, undefined ]
				});
				var timestamp = parseInt(execSync(options.cmd + ' log -1 --pretty=tformat:"%at"'));
				
				if(timestamp > latestTimestamp) {
					options.branch = branchName;
					latestTimestamp = timestamp;
				}
			}
		}, this);
	}
	
	execSync(options.cmd + ' checkout -f ' + options.branch, {
		stdio: [ undefined, undefined, undefined ]
	});
	
	var authorFilter = '';
	options.authors.forEach(function(author) {
		if(author && author.length > 0) {
			authorFilter += '--author="' + author + '" ';
		}
	}, this);
	
	var numStatOutput = execSync(options.cmd + ' log ' + authorFilter + '--pretty=tformat: --numstat').toString().trim();
	numStatOutput.split('\n').forEach(function(line) {
		var columns = line.split('\t');
		
		if(columns && columns.length >= 3 && (columns[0] || '').trim() !== '-' || (columns[1] || '').trim() !== '-' && columns[2] != null && columns[2].match(filetypeRegex) && columns[2].match(options.filefilter)) {
			ret.lines.added += parseInt(columns[0]);
			ret.lines.deleted += parseInt(columns[1]);
		}
	});
	
	var commitCount = parseInt(execSync(options.cmd + ' rev-list HEAD ' + authorFilter + '--count').toString().trim());
	if(!isNaN(commitCount)) {
		ret.commitCount = commitCount;
	}
	
	var commitsOutput = execSync(options.cmd + ' log ' + authorFilter + '--pretty=tformat:"%at:%an <%ae>"').toString().trim();
	commitsOutput.split('\n').forEach(function(line) {
		var sepIndex = line.indexOf(':');
		var timestamp = parseInt(line.substr(0, sepIndex));
		
		if(options.filterTimestamp == null || timestamp >= options.filterTimestamp) {
			ret.commits.push({
				author: line.substr(sepIndex + 1),
				timestamp: timestamp
			});
		}
	});
	
	return ret;
}

module.exports = function(config, args) {
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
						filetypes: config.git.filetypes[file],
						filefilter: config.git.filter[file],
						filterTimestamp: Math.floor((Date.now() / 1000) - (config.git.lookback || 604800)),
						branch: config.git.branch[file],
						pull: !args['disable-pull'] || forcePull
					});
					
					inspectData.name = file;
					
					ret.push(inspectData);
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