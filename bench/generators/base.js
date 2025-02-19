import crypto from 'node:crypto';
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

class BaseGenerator {
	#id;
	#client;
	constructor(client) {
		this.#client = client;
		this.#id = this.randomString();
	}
	get id() {
		return this.#id;
	}
	async run() {
		throw new Error(`Run not implemented in generator`);
	}
	async cleanup() {
		throw new Error(`Cleanup not implemented in generator`);
	}
	async query(query, values) {
		let start = +new Date();
		//console.log(`> ${query.substr(0, 100)}`);
		let result = await this.#client.query(query, values);
		let end = +new Date();
		//console.log(`< ${query.substr(0, 100)}; ${end-start}ms`);
		return result;
	}
	async create(tableName, fields) {
		await this.query(`CREATE TABLE "${tableName}" (${_.map(fields, f => `${f.name} ${f.type}`).join(', ')})`);
	}
	async insert(tableName, fields, data, chunkSize = 10000) { 
		let chunks = _.chunk(data, chunkSize);
		for (let chunk of chunks) {
			let valuePlaceHolders = [];
			let values = [];
			let i = 1;
			for (let field of fields) {
				let fieldData = new Array(chunk.length)
				for (let j = 0; j < chunk.length; j++) {
					fieldData[j] = chunk[j][field.name];
				}
				valuePlaceHolders.push(`$${i}::${field.type}[]`);
				values.push(fieldData);
				i++;
			}
			let start = +new Date();
			await this.query(`INSERT INTO "${tableName}" (${_.map(fields, f => f.name).join(', ')}) SELECT * FROM UNNEST (${valuePlaceHolders.join(', ')})`, values);
			let end = +new Date();
			//console.log('actual insert took', end - start);
		}
	}
	async drop(tableName) {
		await this.query(`DROP TABLE "${tableName}"`);
	}
	uuid() {
		return crypto.randomUUID();
	}
	randomString(length = 16) {
		return Math.random().toString(20).substr(2, 6);
	}
}

export default BaseGenerator;