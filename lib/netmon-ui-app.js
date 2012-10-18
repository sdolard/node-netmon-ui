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

PADDING = {
	base: 2,
	action: 6,
	host: 20,
	details: 60,
	msDuration: 10
},

NetmonUiApp = function() {
	this.ui = 'tty';
	this.port = 8080;
	this.host = 'localhost';
	this.cursor = ansi(process.stdout);
	
	this.getProcessArgs();
	
	this.initSocketIoClient();
};


NetmonUiApp.prototype.getProcessArgs = function(){
	var 
	optParser, opt;
	
	// Command line options
	optParser = new getopt.BasicParser(':ha:p:u:', process.argv);
	while ((opt = optParser.getopt()) !== undefined && !opt.error) {
		switch(opt.option) {
		case 'h': // help
			this.displayHelp();
			process.exit();
			break;
			
		case 'a': 
			this.host = opt.optarg;
			break;
			
		case 'p': // port
			this.port = parseInt(opt.optarg, 10);
			break;
			
		case 'u': 
			this.ui = opt.optarg;
			break;
			
			
		default:
			this._error('Invalid or incomplete option');
			this.displayHelp();
			process.exit(1);	
		}
	}
};


/**
* Display help
*/
NetmonUiApp.prototype.displayHelp = function() {
	console.log('netmon-ui [-u ui] [-a address] [-p port] [-h] ');
	console.log('netmon-ui: netmon uis');
	console.log('Options:');
	console.log('  u: ui. tty|debug. Default tty.');
	console.log('  a: address. default localhost');
	console.log('  p: port. Listen result to specified port. default [8080]');
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
	this.cursor.reset().
	write(util.format('connecting to %s:%d...', this.host, this.port));
};

NetmonUiApp.prototype.onSocketConnect = function(transport_type) {
	this.cursor.reset().
	write(util.format('connected to %s:%d', this.host, this.port));
};

NetmonUiApp.prototype.onSocketDisconnect = function(data) {
	this.screenClear().
	reset().
	write(util.format('disconnected from %s:%d', this.host, this.port));
};

NetmonUiApp.prototype.onSocketUpdate = function(data) {
	
	this.screenClear();
	this.cursor.bg.reset();
	switch(this.ui) {
	case 'debug':
		console.log(data); 
		break;
	case 'tty':
		this.toTtyUi(data);
		break;
		
	default:
		this.toTtyUi(data);
	}
};

NetmonUiApp.prototype.toTtyUi = function(data) {
	var 
	d = JSON.parse(data),
	jobName,
	description,
	task;
	this.cursor.bg.reset().write(d.script +  ': ' + new Date().toString()).write('\n');
	for(jobName in d.jobs) {
		if (d.jobs.hasOwnProperty(jobName)) {
			description = jobName;
			if (d.jobs[jobName].hasOwnProperty('description')) {
				description = d.jobs[jobName].description;
			}
			this.cursor.
			bg.reset().
			write(description).write(': \n');
			this.taskToScreen(d.jobs[jobName].task, PADDING.base);
		}
	}
};

NetmonUiApp.prototype.taskToScreen = function(tasks, padding) {
	padding = Math.max(padding, PADDING.base);
	var 
	taskName,
	task,
	action,
	config;
	
	for(taskName in tasks) {
		if (tasks.hasOwnProperty(taskName)) {
			task = tasks[taskName];
			config = task.config;
			
			this.cursor.reset();
			this.screenPad(padding).
			write(this.stringPad(task.action, PADDING.action)).
			write(' on ').
			write(this.stringPad(config.host, PADDING.host)).
			write(' ');
			
			switch(task.action) {
			case 'ping':
				this.pingToScreen(task, padding);
				break;
				
			case 'script':
				this.scriptToScreen(task, padding);
				break;
				
			case 'http':
				this.httpToScreen(task, padding);
				break;
				
			case 'tcp':
				this.tcpToScreen(task, padding);
				break;
				
			default:
				this.cursor.
				write(task.err ? 'failed' : 'succeed').
				write('\n');
			}
		}
	}
};

NetmonUiApp.prototype.pingToScreen = function(task, padding) {
	padding = Math.max(padding, PADDING.base);
	if (task.action !== 'ping') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config;
	
	switch(task.state) {
	case 'progress':
		this.cursor.bg.grey().
		write(this.stringPad(task.message.msg, PADDING.details));
		this.cursor.bg.brightBlue().
		write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
		break;
		
	case 'result':
		if (task.err) {
			this.cursor.bg.red().
			write(this.stringPad('failed', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.err.msDuration + 'ms' , PADDING.msDuration, true));
		} else {
			try {
				this.cursor.bg.green().
				write(this.stringPad('mstime: '+ task.response.mstime.toString(), PADDING.details));	
				
			} catch(e) {
				console.log('task.response: ', task.response);
				throw e;
			}
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.response.msDuration + 'ms' , PADDING.msDuration, true));
		}
		break;
	default:
		this.cursor.bg.red().
		write('unmanaged state: ').
		write(task.state);
	}
	this.cursor.write('\n');
};

NetmonUiApp.prototype.scriptToScreen = function(task, padding) {
	padding = Math.max(padding, 2);
	if (task.action !== 'script') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config;
	
	switch(task.state) {
	case 'progress':
		this.cursor.bg.grey().
		write(this.stringPad(config.script + ': ' + task.message.msg, PADDING.details));
		this.cursor.bg.brightBlue().
		write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
		break;
		
	case 'result':			
		if (task.err) {
			this.cursor.bg.red().
			write(this.stringPad(config.script + ', failed, ' + task.err.code, PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.err.msDuration + 'ms' , PADDING.msDuration, true));
		} else {
			this.cursor.bg.green().
			write(this.stringPad(config.script + ', succeed, ' + task.response.date, PADDING.details));
			
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.response.msDuration + 'ms' , PADDING.msDuration, true));
		}
		break;
		
	default: 
		this.cursor.
		write('unmanaged state ').
		write(task.state);
	}
	this.cursor.write('\n');
};


NetmonUiApp.prototype.httpToScreen = function(task, padding) {
	padding = Math.max(padding, 2);
	if (task.action !== 'http') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config,
	ssl = config.ssl ? 'ssl, ' : '';
	
	switch(task.state) {
	case 'progress':
		this.cursor.bg.grey().
		write(this.stringPad(ssl + config.path + ', ' + task.message.msg, PADDING.details));
 
		this.cursor.bg.brightBlue().
		write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
		break;
		
	case 'result':			
		if (task.err) {
			this.cursor.bg.red().
			write(this.stringPad(ssl + config.path + ', failed, ' + task.err.code, PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.err.msDuration + 'ms' , PADDING.msDuration, true));
		} else {
			this.cursor.bg.green().
			write(this.stringPad(ssl + config.path + ', ' + task.response.statusCode + ': '  + task.response.statusMessage, PADDING.details));
			
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.response.msDuration + 'ms' , PADDING.msDuration, true));
		}
		break;
		
	default: 
		this.cursor.
		write('unmanaged state ').
		write(task.state);
	}
	this.cursor.write('\n');
};

NetmonUiApp.prototype.tcpToScreen = function(task, padding) {
	padding = Math.max(padding, 2);
	if (task.action !== 'tcp') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config;
	
	switch(task.state) {
	case 'progress':
		this.cursor.bg.grey().
		write(this.stringPad(task.message.msg, PADDING.details));
		this.cursor.bg.brightBlue().
		write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
		break;
		
	case 'result':			
		if (task.err) {
			this.cursor.bg.red().
			write(this.stringPad('failed, ' + task.err.code, PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.err.msDuration + 'ms' , PADDING.msDuration, true));
		} else {
			this.cursor.bg.green().
			write(this.stringPad('succeed' , PADDING.details));
			
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.response.msDuration + 'ms' , PADDING.msDuration, true));
		}
		break;
		
	default: 
		this.cursor.
		write('unmanaged state ').
		write(task.state);
	}
	this.cursor.write('\n');
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


NetmonUiApp.prototype.screenClear = function() {
	function lf() { return '\n'; }
	var Tmp = Array; // jslint hack
	
	return this.cursor.reset().
	write(Array.apply(null, new Tmp(process.stdout.getWindowSize()[1])).map(lf).join('')).
	eraseData(2).
	goto(1, 1);
};

NetmonUiApp.prototype.stringPad = function(message, padding, alignRight) {
	function space(){ return ' ';}
	
	var Tmp = Array; // jslint hack
	if (alignRight){ 
		return (Array.apply(null, new Tmp(padding)).map(space).join('') + message).slice(-padding);	
	}
	return (message + Array.apply(null, new Tmp(padding)).map(space).join('')).slice(0, padding);
};

NetmonUiApp.prototype.screenPad = function(padding) {
	return this.cursor.write(this.stringPad('', padding));
};


app = new NetmonUiApp(); 
