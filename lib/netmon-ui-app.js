/*
Copyright © 2012 by Sebastien Dolard (sdolard@gmail.com)
*/

var 
//node
util = require('util'),
fs = require('fs'),

// contrib
getopt = require('posix-getopt'), 
ansi = require('ansi'), 
io = require('socket.io-client'),

// gvar
app,

NetmonUiApp = function() {
	this.ui = 'tty';
	this.port = 8080;
	this.host = 'localhost';
	this.initSocketIoClient();
};


/**
* Display help
*/

NetmonUiApp.prototype.displayHelp = function() {
	console.log('netmon-ui [-u ui] [-h] ');
	console.log('netmon-ui: netmon uis');
	console.log('Options:');
	console.log('  u: ui. default tty');
	console.log('  p: port. Listen result to specified port. default [TODO]');
	console.log('  h: display this help');
};


NetmonUiApp.prototype.initSocketIoClient = function() {
	this.socket = io.connect(util.format('http://%s:%d', this.host, this.port));

	this.socket.on('connecting', this.onSocketConnecting.bind(this));
	this.socket.on('connect', this.onSocketConnect.bind(this));
	this.socket.on('disconnect', this.onSocketDisconnect.bind(this));
	this.socket.on('update', this.onSocketUpdate.bind(this));
};

NetmonUiApp.prototype.onSocketConnecting = function() {
	console.log(util.format('connecting to %s:%d...', this.host, this.port));
};

NetmonUiApp.prototype.onSocketConnect = function(transport_type) {
	console.log(util.format('connected to %s:%d', this.host, this.port));
};

NetmonUiApp.prototype.onSocketDisconnect = function(data) {
	console.log(util.format('disconnected from %s:%d', this.host, this.port));
};

NetmonUiApp.prototype.onSocketUpdate = function(data) {
	console.log(data);
};


// Log
NetmonUiApp.prototype._log = function() {
	if (this.quiet) {
		return;
	}
	console.log.apply(console, arguments);
};

// Error log
NetmonUiApp.prototype._error = function() {
	if (this.quiet) {
		return;
	}
	console.error.apply(console, arguments);
};

NetmonUiApp.prototype.getProcessArgs = function(){
	var 
	optParser, opt;
	
	// Command line options
	optParser = new getopt.BasicParser(':hp:u:', process.argv);
	while ((opt = optParser.getopt()) !== undefined && !opt.error) {
		switch(opt.option) {
		case 'u': 
			this.ui = opt.optarg;
			break;
			
		case 'h': // help
			this.displayHelp();
			process.exit();
			break;
			
		case 'p': // port
			this.port = parseInt(opt.optarg, 10);
			break;
			
			
		default:
			this._error('Invalid or incomplete option');
			this.displayHelp();
			process.exit(1);	
		}
	}
	
	
	// output file
	if (this.output_json_file_name) {
		this._log('Result will be written in: %s', this.output_json_file_name);
	}
	
	// socket.io
	/*if (this.port > 0) {
		this.initSocketIo(this.port);
	}*/
};



app = new NetmonUiApp(); 


/*
process.on('uncaughtException', function (err) {
console.log('Caught exception: ' + err);
process.exit(1);
});
*/


