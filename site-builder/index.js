var AWS = require("aws-sdk");
var s3 = new AWS.S3();
var cloudfront = new AWS.CloudFront();

var async = require('async');
var fs = require('fs');
var mime = require('mime');
var path = require('path');
var yaml = require('js-yaml');
var _ = require('lodash');

var walk = function(dir, done) {
	var results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = path.resolve(dir, file);
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory()) {
					walk(file, function(err, res) {
						results = results.concat(res);
						if (!--pending) done(null, results);
					});
				} else {
					results.push(file);
					if (!--pending) done(null, results);
				}
			});
		});
	});
};

function getAlbums(objects) {	
	return _.sortBy(_.values(_.reduce(objects, function(acc, object) {
		var matches = object.Key.match(/^.*\/(.*)\/(.*)\/([^\/]*)\/(photo[1-4])$/i);
		if (matches != null) {
			var [key, year, month, albumName, fileName, fileType] = matches;			
			var image = {key: key, year: year, month: month, albumName: albumName, fileName: fileName, fileType: fileType};
			if (acc[albumName] == undefined) {
				acc[albumName] = {};
				acc[albumName]["albumName"] =  albumName;
				acc[albumName]["year"] =  year;
				acc[albumName]["month"] =  month;
				acc[albumName]["images"] = [image];
			} else {
				acc[albumName]["images"].push(image);
			}
		}
		return acc;
	}, {})), ["albumName"]);
}

function uploadHomepageSite(albums) {
	var dir = 'homepage';
	walk(dir, function(err, files) {
		if (err) throw err;

		async.map(files, function(f, cb) {
			var body = fs.readFileSync(f);

			if (path.basename(f) == 'error.html') {
				body = body.toString().replace(/\{website\}/g, process.env.WEBSITE);
			} else if (path.basename(f) == 'index.html') {
				var picturesHTML = _.reduce(albums, function(picturesHTML, album) {
					var teaserImage = album["images"][0];
					return picturesHTML + "\t\t\t\t\t\t<article class=\"thumb\">\n" +
					"\t\t\t\t\t\t\t<a href=\"/" + album.year + "/" + album.month + "/" + album.albumName + "/index.html\" class=\"image\"><img src=\"/pics/resized/" + teaserImage.year + "/" + teaserImage.month + "/" + album.albumName + "/360x225/" + teaserImage.fileName + "\" alt=\"\" /></a>\n" +
					"\t\t\t\t\t\t\t<h2>" + album.albumName.replace(/_/g, ' ') + "</h2>\n" +
					"\t\t\t\t\t\t</article>\n";
				}, "")
				body = body.toString().replace(/\{title\}/g, process.env.WEBSITE_TITLE).replace(/\{pictures\}/g, picturesHTML);
			}

			var options = {
				Bucket: process.env.SITE_BUCKET,
				Key: path.relative(dir, f),
				Body: body,
				ContentType: mime.lookup(path.extname(f))
			};

			s3.putObject(options, cb);
		}, function(err, results) {
			if (err) console.log(err, err.stack);
		});
	});
}

function uploadAlbumSite(prev, album, next) {
	var dir = 'album';
	walk(dir, function(err, files) {
		if (err) throw err;

		async.map(files, function(f, cb) {
			var body = fs.readFileSync(f);

			if (path.basename(f) == 'index.html') {
				
				var images = _.orderBy(album['images'], 'fileName');
				var picturesHTML = _.reduce(images, function(picturesHTML, image) {
					return picturesHTML + "\t\t\t\t\t\t<article>\n" +
					"\t\t\t\t\t\t\t<a class=\"thumbnail\" href=\"/pics/resized/" + image.year + "/" + image.month + "/" + album.albumName + "/1200x750/" + image.fileName + "\" data-position=\"center\"><img src=\"/pics/resized/" + image.year + "/" + image.month + "/" + album.albumName + "/360x225/" + image.fileName + "\"  width=\"360\" height=\"225\"/></a>\n" +
					"\t\t\t\t\t\t</article>";
				}, "")
				var navigationHTML = '';
				if (prev != undefined) navigationHTML += '\t\t\t\t\t\t<p>Previous: <a href="/' + prev.year + '/' + prev.month + '/' + prev.albumName + '/index.html">' + prev.albumName + '</a></p>\n';
				if (next != undefined) navigationHTML += '\t\t\t\t\t\t<p>Next: <a href="/' + next.year + '/' + next.month + '/' + next.albumName + '/index.html">' + next.albumName + '</a></p>\n';
				body = body.toString()
				.replace(/\{title\}/g, album.albumName.replace(/_/g, ' '))
				.replace(/\{pictures\}/g, picturesHTML)
				.replace(/\{navigation\}/g, navigationHTML);
			}

			var options = {
				Bucket: process.env.SITE_BUCKET,
				Key: album.year + '/' + album.month + '/' + album.albumName + "/" + path.relative(dir, f),
				Body: body,
				ContentType: mime.lookup(path.extname(f))
			};

			s3.putObject(options, cb);
		}, function(err, results) {
			if (err) console.log(err, err.stack);
		});
	});
}

function invalidateCloudFront() {
	cloudfront.listDistributions(function(err, data) {
		// Handle error
		if (err) {
			console.log(err, err.stack);
			return;
		}

		// Get distribution ID from domain name
		var distributionID = data.Items.find(function (d) {
			return d.DomainName == process.env.CLOUDFRONT_DISTRIBUTION_DOMAIN;
		}).Id;

		// Create invalidation
		cloudfront.createInvalidation({
			DistributionId: distributionID,
			InvalidationBatch: {
				CallerReference: 'site-builder-' + Date.now(),
				Paths: {
					Quantity: 1,
					Items: [
						'/*'
					]
				}
			}
		}, function(err, data) {
			if (err) console.log(err, err.stack);
		});
	});
}

exports.handler = function(event, context) {
	var prefix = 'pics/original/2018/10/';
	
	// List all bucket objects
	var params = {
		Bucket: process.env.ORIGINAL_BUCKET,
		Prefix: prefix
	};
	s3.listObjectsV2(params, function(err, data) {
		//	console.log("data ", JSON.stringify(data));

		if (err) {
			console.log(err, err.stack);
			return;
		}
		
		var albums = getAlbums(data.Contents);
		//console.log("albums ", JSON.stringify(albums));
		
		uploadHomepageSite(albums);
		for (var i = 0; i < albums.length; i++) {
		    uploadAlbumSite(albums[i-1], albums[i], albums[i+1]);
		}	

	});
  
	// Invalidate CloudFront
	invalidateCloudFront();
  
};
