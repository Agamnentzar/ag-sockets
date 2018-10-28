/// <reference types="mocha" />
/// <reference path="../../typings/chai.d.ts" />
/// <reference path="../../typings/chai-as-promised.d.ts" />

require('source-map-support').install();

import * as http from 'http';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

export function delay(duration: number) {
	return new Promise(resolve => setTimeout(resolve, duration));
}

export function createKillMethod(server: http.Server) {
	const connections: any = {};

	server.on('connection', (connection) => {
		const key = `${connection.remoteAddress}:${connection.remotePort}`;
		connections[key] = connection;
		connection.on('close', () => {
			delete connections[key];
		});
	});

	return (callback = () => { }) => {
		server.close(callback);

		for (const key of Object.keys(connections)) {
			connections[key].destroy();
		}
	};
}
