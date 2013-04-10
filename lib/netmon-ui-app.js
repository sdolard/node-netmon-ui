/*
Copyright © 2012 by Sebastien Dolard (sdolard@gmail.com)
*/

var
//node
util = require('util'),
fs = require('fs'),
crashreporter = require('crashreporter'),
path = require('path'),

// contrib

ansi = require('ansi'),
io = require('socket.io-client'),

NetmonUiApp = (function() {

	var PADDING = {
		base: 2,
		action: 7,
		host: 20,
		details: 60,
		msDuration: 10
	};

	function NetmonUiApp() {
		this.ui = 'tty';
		this.port = 8080;
		this.host = 'localhost';
		this.cursor = ansi(process.stdout);
		this.program = require('commander');
		this.recoMsgInterval = -1;

		this._sigintCount = 0;

		this.getProcessArgs();

		this.initProcessSignals();

		this.initSocketIoClient();
	}


	NetmonUiApp.prototype.getProcessArgs = function(){
		function isUiValid(val) {
			var uis = ['tty','debug'];
			return uis.indexOf(val) !== -1;
		}

		this.program
			.version(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'))).version)
			.option('-a, --address <address>', 'address to listen. Default to localhost')
			.option('-p, --port <n>', 'port to listen. Default to 8080', parseInt)
			.option('-u, --ui <tty|debug>', 'user interface. Default to tty')
			.option('-d, --debug');

		this.program.parse(process.argv);
		this.host = this.program.address || 'localhost';
		this.port = parseInt(this.program.port || 8080, 10);
		this.ui = this.program.ui || 'tty';
		if (!isUiValid(this.ui)) {
			this.helpExit('Invalid ui');
		}
		this.debug = this.program.debug;
	};

	NetmonUiApp.prototype.initSocketIoClient = function() {
		console.log('Connecting to %s:%d...',  this.host, this.port);
		this.socket = io.connect(util.format('http://%s:%d', this.host, this.port));

		this.socket.on('connecting', this.onSocketConnecting.bind(this));
		this.socket.on('connect_failed', this.onSocketConnectionFailed.bind(this));
		this.socket.on('error', this.onSocketError.bind(this));
		this.socket.on('connect', this.onSocketConnect.bind(this));
		this.socket.on('disconnect', this.onSocketDisconnect.bind(this));
		this.socket.on('update', this.onSocketUpdate.bind(this));
		this.socket.on('reconnect', this.onSocketReconnect.bind(this));
		this.socket.on('reconnect_failed', this.onSocketReconnectFailed.bind(this));
		this.socket.on('reconnecting', this.onSocketReconnecting.bind(this));
	};

	NetmonUiApp.prototype.onSocketConnecting = function(transportName) {
		this.cursor.reset().
		write(util.format('connecting (%s) to %s:%d...\n', transportName, this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketConnectionFailed = function() {
		this.cursor.reset().
		write(util.format('connection to %s:%d failed\n', this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketConnect = function() {
		this.cursor.reset().
		write(util.format('connected to %s:%d\n', this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketDisconnect = function(reason) {
		this.cursor.
		reset().
		write(util.format('disconnected from %s:%d\n', this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketError = function(err) {
		this.cursor.
		reset().
		write(util.format('Host %s:%d is not reachable\n', this.host, this.port));
		if (this.debug) {
			this.cursor.
			reset().
			write(err).write('\n');
		}
	};

	NetmonUiApp.prototype.onSocketReconnect = function(transportName, reconnAttempts) {
		this.clearRecoMsgInterval();
		this.cursor.
		reset().
		write(util.format('reconnect (%s:%d) to %s:%d\n', transportName, reconnAttempts, this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketReconnectFailed = function() {
		this.cursor.
		reset().
		write(util.format('reconnect to %s:%d failed\n', this.host, this.port));
	};

	NetmonUiApp.prototype.onSocketReconnecting = function(reconnectionDelay, reconnectionAttempts) {
		this.clearRecoMsgInterval();
		var endDate = Date.now() + reconnectionDelay;
		this.recoMsgInterval = setInterval(function(){
			var
			msElapsed = endDate - Date.now(),
			sElapsed = msElapsed < 1000 ? 0 : (msElapsed / 1000).toFixed(),
			message = util.format('Reconnecting to %s:%d in %ds (attempt %d)\n',
				this.host, this.port, sElapsed, reconnectionAttempts);

			if (reconnectionAttempts === 1) {
				this.cursor.
				reset().
				write(message);
				return;
			}
			this.cursor.
				reset().
				previousLine().
				eraseLine(2).
				write(message);

			if (reconnectionAttempts === 10 && sElapsed === 0) {
				this.clearRecoMsgInterval();
				this.cursor.
					reset().
					write("Server is down. Quit.");
				process.exit(1);
				return;
			}
		}.bind(this), 1000);

	};

	NetmonUiApp.prototype.clearRecoMsgInterval = function() {
		if (this.recoMsgInterval !== -1) {
			clearInterval(this.recoMsgInterval);
		}
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
		this.cursor.reset();
		this.cursor.hide();
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
				if (d.jobs[jobName].config.hasOwnProperty('description')) {
					description = d.jobs[jobName].config.description;
				}
				this.cursor.
				bg.reset().
				write(description).write(': \n');
				this.jobToScreen(d.jobs[jobName], PADDING.base);
			}
		}
	};

	NetmonUiApp.prototype.jobToScreen = function(job, padding) {
		padding = Math.max(padding, PADDING.base);

		var
		taskName,
		task,
		action,
		config;

		if (Object.keys(job.tasks).length === 0) {
			config = job.config;
			this.cursor.reset();
			this.screenPad(padding).
			write(this.stringPad('', PADDING.action)).
			write('     ').
			write(this.stringPad('', PADDING.host)).
			bg.grey().
			write(this.stringPad(config.enabled ? 'Scheduled: ' + config.cronTime : 'Disabled', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad('-', PADDING.msDuration, true)).
			write('\n');
			return;
		}

		//
		for(taskName in job.tasks) {
			if (job.tasks.hasOwnProperty(taskName)) {
				task = job.tasks[taskName];
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
				case 'ssh':
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
		case 'starting':
			this.cursor.bg.grey().
			write(this.stringPad('Starting...', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad('' , PADDING.msDuration, true));
			break;

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
		if (task.action !== 'script' && task.action !== 'ssh') {
			throw new Error('Invalid action task');
		}

		var
		config = task.config;

		switch(task.state) {
		case 'starting':
			this.cursor.bg.grey().
			write(this.stringPad('Starting ' + config.script + ' ...', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad('' , PADDING.msDuration, true));
			break;

		case 'progress':
			this.cursor.bg.grey().
			write(this.stringPad(config.script + ': ' + task.message.msg, PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
			break;

		case 'result':
			if (task.err) {
				this.cursor.bg.red().
				write(this.stringPad(util.format('%s, failed, %s(%s)', config.script , task.err.message, task.err.code), PADDING.details));
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
			this.cursor.bg.red().
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
		case 'starting':
			this.cursor.bg.grey().
			write(this.stringPad('Starting ' + ssl + config.path + ' ...', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad('' , PADDING.msDuration, true));
			break;

		case 'progress':
			this.cursor.bg.grey().
			write(this.stringPad(ssl + config.path + ', ' + task.message.msg, PADDING.details));

			this.cursor.bg.brightBlue().
			write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
			break;

		case 'result':
			if (task.err) {
				//console.log(task.err);
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
		case 'starting':
			this.cursor.bg.grey().
			write(this.stringPad('Starting on port ' + task.config.port +  ' ...', PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad('' , PADDING.msDuration, true));
			break;

		case 'progress':
			this.cursor.bg.grey().
			write(this.stringPad(task.message.msg, PADDING.details));
			this.cursor.bg.brightBlue().
			write(this.stringPad(task.message.msDuration + 'ms' , PADDING.msDuration, true));
			break;

		case 'result':
			if (task.err) {
				this.cursor.bg.red().
				write(this.stringPad(task.config.port + ', failed, ' + task.err.code, PADDING.details));
				this.cursor.bg.brightBlue().
				write(this.stringPad(task.err.msDuration + 'ms' , PADDING.msDuration, true));
			} else {
				this.cursor.bg.green().
				write(this.stringPad(task.config.port + ', succeed' , PADDING.details));

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
		return this.cursor.reset().
		goto(0, 0).
		eraseData(2); // clear screen
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

	NetmonUiApp.prototype.initProcessSignals = function() {
		process.on('exit', this.onProcessExit.bind(this));
		process.on('SIGINT', this.onProcessSigint.bind(this));
	};

	NetmonUiApp.prototype.onProcessExit = function() {
		this.cursor.show();
	};

	NetmonUiApp.prototype.onProcessSigint = function() {
		this.clearRecoMsgInterval();
		if (this._sigintCount >= 1) {
			process.exit();
		} else {
			this.cursor.
			write('\nTrying to quit... Press CTRL+C again to force\n');
		}
		this.socket.disconnect();
		this._sigintCount++;
	};

	NetmonUiApp.prototype.helpExit = function(message) {
		console.error('!!! ' + message);
		this.program.outputHelp();
		process.exit(1);
	};

	return NetmonUiApp;
}()),

app = new NetmonUiApp();
