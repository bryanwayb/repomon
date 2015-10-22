var execSync = require('child_process').execSync,
	fs = require('fs'),
	path = require('path');

var defaultFileTypes = [ 'js', 'cs', 'cshtml', 'cc', 'c', 'cpp', 'cxx', 'java', 'html', 'css' ];

function inspectRepo(cmd, gitDir, authors, filetypes, filefilter, filterTimestamp) {
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
	
	cmd = cmd + ' "--git-dir=' + path.join(gitDir, '.git') + '" "--work-tree=' + gitDir + '"';
	execSync(cmd + ' reset --hard');
	execSync(cmd + ' clean -fd');
	execSync(cmd + ' pull --all');
	execSync(cmd + ' reset --hard HEAD');
	
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
			console.log(timestamp);
			ret.commits.push({
				author: line.substr(sepIndex + 1),
				date: timestamp
			});
		}
	});
	
	return ret;
}

module.exports = function(config, callback) {
	var repoDir = path.resolve(process.cwd(), config.git.repos);
	
	var ret = [ ];
	try {
		fs.readdirSync(repoDir).forEach(function(file) {
			var filepath = path.join(repoDir, file);
			try {
				console.log(' -> ' + file);
				ret.push(inspectRepo(config.git.cmd, filepath, config.git.authors, config.git.filetypes[file], config.git.filter[file], Date.now() - ((config.git.lookback || 604800) * 1000)));
			}
			catch(ex) {
				console.error('Error while working on ' + filepath + '\n' + ex.toString());
			}
		}, this);
	}
	catch(ex) {
		console.error('Error while trying to read local repos\n' + ex.toString());
	}
	
	return ret;
};