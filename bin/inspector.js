var execSync = require('child_process').execSync,
	fs = require('fs'),
	path = require('path');

var defaultFileTypes = [ 'js', 'cs', 'cshtml', 'cc', 'c', 'cpp', 'cxx', 'java', 'html', 'css' ];

function inspectRepo(cmd, gitDir, authors, filetypes, filefilter, filterTimestamp, branch) {
	if(!filetypes) {
		filetypes = defaultFileTypes;
	}
	
	if(!filefilter) {
		filefilter = '.*';
	}
	
	filefilter = new RegExp(filefilter, 'i');
	
	if(!authors) {
		authors = [ ];
	}
	
	if(authors.length === 0) {
		authors.push('');
	}
	
	var ret = {
		lines: {
			added: 0,
			deleted: 0
		},
		commitCount: 0,
		commits: [ ]
	};
	
	var filetypeRegex = new RegExp('\.(' + filetypes.join('|') + ')$', 'i');
	
	process.chdir(gitDir); // Sucks to have to do this... NodeJS has buggy execSync functions when it comes to settings a child processes working directory
	
	execSync(cmd + ' fetch --all');
	
	if(!branch) { // No branch selected, use latest
		var latestTimestamp = 0;
	
		var branchesOutput = execSync(cmd + ' branch --list -r --no-color');
		branchesOutput.toString().trim().split('\n').forEach(function(branchName) {
			branchName = branchName.trim();
			if(branchName.indexOf(' -> ') === -1) {
				branchName = branchName.substr(branchName.indexOf('/') + 1);
				
				execSync(cmd + ' checkout -f ' + branchName, {
					stdio: [ undefined, undefined, undefined ]
				});
				var timestamp = parseInt(execSync(cmd + ' log -1 --pretty=tformat:"%at"'));
				
				if(timestamp > latestTimestamp) {
					branch = branchName;
					latestTimestamp = timestamp;
				}
			}
		}, this);
	}
	
	execSync(cmd + ' checkout -f ' + branch, {
		stdio: [ undefined, undefined, undefined ]
	});
	execSync(cmd + ' submodule sync --recursive');
	execSync(cmd + ' submodule update --recursive');
	
	var authorFilter = '';
	authors.forEach(function(author) {
		if(author && author.length > 0) {
			authorFilter += '--author="' + author + '" ';
		}
	}, this);
	
	var numStatOutput = execSync(cmd + ' log ' + authorFilter + '--pretty=tformat: --numstat').toString().trim();
	numStatOutput.split('\n').forEach(function(line) {
		var columns = line.split('\t');
		
		if(columns && columns.length >= 3 && (columns[0] || '').trim() !== '-' || (columns[1] || '').trim() !== '-' && columns[2] != null && columns[2].match(filetypeRegex) && columns[2].match(filefilter)) {
			ret.lines.added += parseInt(columns[0]);
			ret.lines.deleted += parseInt(columns[1]);
		}
	});
	
	var commitCount = parseInt(execSync(cmd + ' rev-list HEAD ' + authorFilter + '--count').toString().trim());
	if(!isNaN(commitCount)) {
		ret.commitCount = commitCount;
	}
	
	var commitsOutput = execSync(cmd + ' log ' + authorFilter + '--pretty=tformat:"%at:%an <%ae>"').toString().trim();
	commitsOutput.split('\n').forEach(function(line) {
		var sepIndex = line.indexOf(':');
		var timestamp = parseInt(line.substr(0, sepIndex));
		
		if(filterTimestamp == null || timestamp >= filterTimestamp) {
			ret.commits.push({
				author: line.substr(sepIndex + 1),
				timestamp: timestamp
			});
		}
	});
	
	return ret;
}

module.exports = function(config, callback) {
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
					console.log(' -> ' + file);
					var inspectData = inspectRepo(config.git.cmd, filepath, config.git.authors, config.git.filetypes[file], config.git.filter[file], Math.floor((Date.now() / 1000) - (config.git.lookback || 604800)), config.git.branch[file]);
					
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