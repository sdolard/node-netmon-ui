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
	console.log(util.format('connecting to %s:%d...', this.host, this.port));
};

NetmonUiApp.prototype.onSocketConnect = function(transport_type) {
	console.log(util.format('connected to %s:%d', this.host, this.port));
};

NetmonUiApp.prototype.onSocketDisconnect = function(data) {
	console.log(util.format('disconnected from %s:%d', this.host, this.port));
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
	this.cursor.bg.reset().write(new Date().toString()).write('\n');
	for(jobName in d) {
		if (d.hasOwnProperty(jobName)) {
			description = jobName;
			if (d[jobName].hasOwnProperty('description')) {
				description = d[jobName].description;
			}
			this.cursor.
			bg.reset().
			write(description).write(': \n');
			this.taskToScreen(d[jobName].task, 2);
		}
	}
};

NetmonUiApp.prototype.taskToScreen = function(tasks, padding) {
	padding = Math.max(padding, 2);
	var 
	taskName,
	task,
	action,
	config;
	
	for(taskName in tasks) {
		if (tasks.hasOwnProperty(taskName)) {
			task = tasks[taskName];
			config = task.config;
			
			switch(task.action) {
			case 'ping':
				this.pingToScreen(task, padding);
				break;
				
			case 'script':
				this.scriptToScreen(task, padding);
				break;
				
			default:
				this.screenPad(padding).
				write(task.action).
				write(' on ').
				write(config.host).
				write(task.err ? ' failed' : ' succeed').
				write('\n');
			}
		}
	}
};

NetmonUiApp.prototype.pingToScreen = function(task, padding) {
	padding = Math.max(padding, 2);
	if (! task.action === 'ping') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config;
	this.cursor.bg.reset();
	this.screenPad(padding).
	write(task.action).
	write(' on ').
	write(this.stringPad(config.host, 20)).
	write(' ');
	
	switch(task.state) {
	case 'progress':
		this.cursor.
		bg.grey().
		write(this.stringPad(task.msg, 17));
		break;
		
	case 'result':
		if (task.err) {
			this.cursor.
			bg.red().
			write(this.stringPad('failed', 17));
		} else {
			try {
				this.cursor.
			bg.green().
			write('mstime ').
			write(this.stringPad(+ task.response.mstime.toString(), 10));	
				
			} catch(e) {
				console.log('task.response:', task.response);
				throw e;
			}
		}
		break;
	default:
		this.cursor.
		write('unmanaged state ').
		write(task.state);
	}
	this.cursor.write('\n');
};

NetmonUiApp.prototype.scriptToScreen = function(task, padding) {
	padding = Math.max(padding, 2);
	if (! task.action === 'script') {
		throw new Error('Invalid action task');
	}
	
	var 
	config = task.config;
	
	this.cursor.bg.reset();
	this.screenPad(padding).
	write(task.action).
	write(' ').
	write(this.stringPad('(' + config.script + ')', 20)).
	write(' on ').
	write(this.stringPad(config.host, 20)).
	write(' ');
	
	switch(task.state) {
	case 'progress':
		this.cursor.bg.grey().write(this.stringPad(task.msg, 40));
		break;
		
	case 'result':			
		if (task.err) {
			this.cursor.bg.red().
			write(this.stringPad('failed: ' + task.err.code, 40));
		} else {
			this.cursor.
			write(this.stringPad('succeed (' + task.response.date + ')', 40));
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
	
	return this.cursor.
	write(Array.apply(null, [process.stdout.getWindowSize()[1]]).map(lf).join('')).
	eraseData(2).
	goto(1, 1);
};

NetmonUiApp.prototype.stringPad = function(message, padding) {
	var 
	tmp = [];
	tmp[padding -1] = '';
	return (tmp.join(' ') + message).slice(-padding);
};

NetmonUiApp.prototype.screenPad = function(padding) {
	return this.cursor.write(this.stringPad('', padding));
};


app = new NetmonUiApp(); 
