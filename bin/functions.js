var fs = require('fs'),
	path = require('path');

module.exports = {
	rmdir: function(dir) {
		try {
			var files = fs.readdirSync(dir);
			if (files.length > 0) {
				for (var i = 0; i < files.length; i++) {
					var filepath = path.join(dir, files[i]);
					try {
						var stat = fs.lstatSync(filepath);
						if (stat.isFile() || stat.isSymbolicLink())
						{
							fs.unlinkSync(filepath);
						}
						else {
							module.exports.rmdir(filepath);
						}
					}
					catch(ex) {
						continue;
					}
				}
			}
			fs.rmdirSync(dir);
		}
		catch(ex) {
			return;
		}
	}
}