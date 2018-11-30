(function($) {

	var meetingDate;

	var bucketName     = 'pvpa-source';
	var bucketRegion   = 'us-east-1';
	var IdentityPoolId = 'us-east-1:11648a7e-219e-47a9-ad86-89dfc8e5f816';

	AWS.config.update({
		region: bucketRegion,
		credentials: new AWS.CognitoIdentityCredentials({
			IdentityPoolId: IdentityPoolId
		})
	});

	var s3             = new AWS.S3({
		apiVersion: '2006-03-01',
		params: {Bucket: bucketName}
	});

	function createAlbum(albumKey) {
		s3.headObject({Key: albumKey}, function(err, data) {
			if (!err) {
				return console.info('Album already exists. Skipping creation.');
			}
			if (err.code !== 'NotFound') {
				throw err;
			}
			s3.putObject({Key: albumKey}, function(err, data) {
				if (err) {
					throw err;
				}
				console.info('Successfully created album.');
			});
		});
		return albumKey;
	}
	
	function addPhoto(albumKey, file, index) {
		var fileName      = file.name;
		var matches        = fileName.match(/\.(jpeg|jpg|png)$/i);
		if (matches == undefined) {
			throw {message: 'Only JPEG and PNG files are allowed.'};
		}
		var suffix = matches[1];
		var photoKey      = albumKey + 'photo' + index;
		var mimeType = 'image/' + (suffix == 'png' ? 'png' : 'jpeg');
		s3.upload({
			Key: photoKey,
			Body: file,
			ContentType: mimeType,
			ACL: 'public-read'
		}, function(err, data) {
			if (err) {
				throw err;
				return false;
			} else {
				console.info('Successfully uploaded photo to ' + photoKey);
			}
		});
		return true;
	}
	
	$('#upload').click(function(event) {
		event.preventDefault();
		try {
			var fullName     = $('#name').val().trim();
			if (fullName      == '') throw {message: 'The name cannot be empty.'};
			if (fullName.indexOf('/') !== -1) {
				throw {message: 'The name cannot contain slashes.'};
			}
		
			var meetingYear   = meetingDate.format('YYYY');
			var meetingMonth  = meetingDate.format('M');			
			var albumKey      = 'pics/original/' + meetingYear + '/' + meetingMonth + '/' + fullName.replace(/\s/g, "_") + '/';

			createAlbum(albumKey);
			for (var i        = 1; i <= 4; i++) {
				var file         = document.getElementById('photo' + i).files[0];
				if (file !== undefined) addPhoto(albumKey, file, i);
			}
		}
		catch(err) {
			alert('There was an error uploading your photos. Please contact the web site admin. This is the error message:\n\n' + err.message);
		}
	});
	
	function lastThursdayOfMonth(date) {
		var lastThursdayOfMonthDate   = date.clone().endOf("month").startOf("isoweek").add(3, "days").hour(19);
		if (lastThursdayOfMonthDate.month() !== date.month()) lastThursdayOfMonthDate.subtract(7, "days");
		return lastThursdayOfMonthDate;
	}
	
	function nextMeetingDate() {
		var now            = moment();
		var resultDate = lastThursdayOfMonth(now);
		if (resultDate.isBefore(now)) resultDate = lastThursdayOfMonth(now.add(1, 'month'));
		return resultDate;			
	}
	
	function init() {
		meetingDate       = nextMeetingDate();
		$('#meeting-month').text(meetingDate.format('MMMM'));
	}
	
	init();
	
})(jQuery);