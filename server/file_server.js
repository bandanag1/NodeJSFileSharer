var http = require("http");
var url = require("url");
var multipart = require("multipart");
var sys = require("sys");
var fs = require("fs");
var port = 8422;
var uploadDir = "uploads";
var downloadDir = "./downloads/";
var uploadedFileName = null;

/*
 * create a nodejs server instance
 */
var server = http.createServer(function(req, res) {
	// Simple path-based request dispatcher
	switch (url.parse(req.url).pathname) {
		case '/':		
		    display_form(req, res);
		    break;
		case '/upload':
		    upload_file(req, res);
		    break;
		case '/uploads':			
		    listDirectory(res, req.url);
		    break;
		default:            
		    download(req, res);
		    break;
	}
});

// Server would listen on port 8422
server.listen(port);
console.log('File Server running at port:' + port + '/');

/*
 * Display upload form
 */
function display_form(req, res) {
	res.writeHead(200, {"Content-Type": "text/html"});
	res.write(
		'<form action="/upload" method="post" enctype="multipart/form-data">'+
		'<input type="file" name="upload-file"/>'+
		'<input type="submit" value="Upload"/>'+
		'</form>'
	    );
	res.end();
}

/*
 * Create multipart parser to parse given request
 */
function parse_multipart(req) {
	var parser = multipart.parser();
	
	// Make parser use parsed request headers
	parser.headers = req.headers;
	
	// Add listeners to request, transfering data to parser
	req.addListener("data", function(chunk) {
		parser.write(chunk);
	});
	req.addListener("end", function() {
		parser.close();
	});
	return parser;
}

/*
 * Handle file upload
 */
function upload_file(req, res) {
	// Request body is binary    
	req.setEncoding("binary");
	
	// Handle request as multipart
	var stream = parse_multipart(req);
	var fileName = null;
	var fileStream = null;

	// Set handler for a request part received
	stream.onPartBegin = function(part) {
		sys.debug("Started part, name = " + part.name + ", filename = " + part.filename);

		// Construct file name
		fileName = "./uploads/" + stream.part.filename;
			
		// Assign the file name to a global variable to access outside the function
		uploadedFileName = stream.part.filename;

		// Construct stream used to write to file
		fileStream = fs.createWriteStream(fileName);

		// Add error handler
		fileStream.addListener("error", function(err) {
		    sys.debug("Got error while writing to file '" + fileName + "': ", err);
		});

		// Add drain (all queued data written) handler to resume receiving request data
		fileStream.addListener("drain", function() {
		    req.resume();
		});
	};

	// Set handler for a request part body chunk received
	stream.onData = function(chunk) {
		// Pause receiving request data (until current chunk is written)
		req.pause();

		// Write chunk to file
		// Note that it is important to write in binary mode
		// Otherwise UTF-8 characters are interpreted
		sys.debug("Writing chunk");
		fileStream.write(chunk, "binary");
	};

	// Set handler for request completed
	stream.onEnd = function() {
        // As this is after request completed, all writes should have been queued by now
        // So following callback will be executed after all the data is written out
        fileStream.addListener("drain", function() {
		// Close file stream
		fileStream.end();
		// Handle request completion, as all chunks were already written
		upload_complete(req, res);
        });
    };
}

/*
 * Display list of files uploaded
 */
function upload_complete(req, res) {
	sys.debug("Request complete");	
	res.writeHead(200, {"Content-Type": "text/html"});
	// Listing the uploaded files
	res.write('<p>File Uploaded "<b>' + uploadedFileName + '"</b></p><br>');
	
	// Loading the file upload form for uploading more files
	res.write(
		'<form action="/upload" method="post" enctype="multipart/form-data">'+
		'<input type="file" name="upload-file"/>'+
		'<input type="submit" value="Upload"/>'+
		'</form>'
	);	
	res.end();
}

/*
 * Handles page not found error
 */
function show_404(req, res) {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("You are doing it wrong!");
    res.end();
}


/*
 * Download file from the list of uploaded files
 */
function download(req, res)
{  
	if(req.url === '/uploads') {
		//requesting the list
		listDirectory(res, req.url);
	}
	else {	
		file_addr = uploadDir + req.url;
		console.log('file_addr: ' + file_addr);	
		fs.stat(file_addr, function(err, fileStat) {
			if(err) {
				// Error downloading the file
				res.writeHead(404, {'Content-Type' : 'text/html'});
				res.write('<p style="color:red">Error: You cannot view the file for some reason!');
				res.write('\n Either file or folder does not exist. Also the file name must not contain whitespaces!');
				res.write('\n Please download the file to view it!!!</p>');
				res.end();
			}
			else {
				if(fileStat.isDirectory()) {
					listDirectory(res, req.url + '/');
				}
				else {				
					// File is there, downloading to local machine          
					var reqUrl = req.url;
					var file_name = reqUrl.substring(1, reqUrl.length);
					var name = file_name;
					if (name.match(RegExp(' +', 'g'))) {
						console.log("here");
						res.writeHead(404, {'Content-Type' : 'text/html'});
						res.write('<p style="color:red">Error: The file name must not contain whitespaces!</p>');
					}
					console.log('filename: ' + file_name);		  
					res.writeHead(200, {'Content-Length' : fileStat.size});
					fs.readFile(file_addr, function(err, data) {
						if(err) {
							res.writeHead(404, {'Content-Type' : 'text/html'});
							res.write('<p style="color:red">Error: You cannot download the file for some reason!</p>');
							res.end();
						}
						else {				
							res.write(data);					
							// Delete the file from the server after it is downloaded to local machine
							//fs.unlinkSync(file_addr);				
							res.end();
						};
					});		  
				}
			}
		});
	}
}

/*
 * Add HTML elements begin
 */
function htmlHead(res) {
  res.write('<html>\n');
  res.write('<head><title>File Trasfer is easy!</title></head>\n');
  res.write('<body>');        
}

/*
 * Add HTML elements wnd
 */
function htmlEnd(res) {
  res.write('</body>');
  res.write('</html>');
}

/*
 * Show list of files uploaded on the server
 */
function listDirectory(res, dir_addr) {  
	var path = '/';  
	
	// Reading the files uploaded in the uploads folder
	fs.readdir(uploadDir + path , function(err, files) {
		if(err) {
			res.writeHead(501, {'Content-Type' : 'text/html'});
			res.write('<p style="color:red">Error</p>');
			res.end();
		}
		else {	  
			// Showing the list of uploaded files if any
			res.writeHead(200, {'Content-Type' : 'text/html'});
			htmlHead(res);	  
			for (var i = files.length - 1; i >= 0; i--) {
				var file_name = files[i];		
				res.write('<p><a href="' + file_name + '">' + file_name + '</a></p>');
				res.write('\n');
			};
			htmlEnd(res);
			res.end();
		}
	});
}