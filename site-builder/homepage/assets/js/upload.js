(function($) {

	var now            = moment();
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
				return alert('There was an error creating your album: ' + err.message);
			}
			s3.putObject({Key: albumKey}, function(err, data) {
				if (err) {
					return alert('There was an error creating your album: ' + err.message);
				}
				console.info('Successfully created album.');
			});
		});
		return albumKey;
	}
	
	function addPhoto(albumKey, file, index) {
		var fileName      = file.name;
		var suffix        = fileName.match(/\.(jpg|jpeg|png)$/i)[1];
		if (suffix == undefined) return alert('Only JPEG and PNG files are allowed.');
		var photoKey      = albumKey + 'photo' + index;
		var mimeType = 'image/' + (suffix == 'png' ? 'png' : 'jpeg');
		s3.upload({
			Key: photoKey,
			Body: file,
			ContentType: mimeType,
			ACL: 'public-read'
		}, function(err, data) {
			if (err) {
				return alert('There was an error uploading your photo: ', err.message);
			}
			console.log('Successfully uploaded photo to ' + photoKey);
		});
	}
	
	$('#upload').click(function(event) {
		event.preventDefault();
		var fullName     = $('#name').val().trim();
		if (fullName      == '') { return alert('The name cannot be empty.') }
		if (fullName.indexOf('/') !== -1) {
			return alert('The name cannot contain slashes.');
		}
		
		var meetingYear   = meetingDate.format('YYYY');
		var meetingMonth  = meetingDate.format('M');			
		var albumKey      = 'pics/original/' + meetingYear + '/' + meetingMonth + '/' + fullName.replace(/\s/g, "_") + '/';

		createAlbum(albumKey);
		
		for (var i        = 1; i <= 4; i++) {
			var file         = document.getElementById('photo' + i).files[0];
			if (file !== undefined) addPhoto(albumKey, file, i);
		}
		
	});
	
	function nextMeetingDate(now) {
		var meetingDate   = now.clone();
		var month         = now.month();
		meetingDate.endOf("month").startOf("isoweek").add(3, "days").hour(19);
		if (meetingDate.month() !== month) meetingDate.subtract(7, "days");
		return meetingDate;
	}
	
	function init() {
		meetingDate       = nextMeetingDate(now);
		$('#meeting-month').text(meetingDate.format('MMMM'));
	}
	
	init();
	
})(jQuery);