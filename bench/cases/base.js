import * as Generators from "../generators/index.js";
import _ from 'lodash';

class BaseCase {
	#measurements = {};
	#mainMeasurement;
	#generator;
	#pgLib;
	#pool;
	#client;
	constructor(pgLib, mainMeasurement = 'full') {
		this.#pgLib = pgLib;
		this.#mainMeasurement = mainMeasurement;
	}
	async prepare(generator, cfg = {}) {
		if (generator) {
			if (generator instanceof Generators.BaseGenerator) {
				this.#generator = generator;
				await this.#generator.run();
			} else if (typeof generator == 'function' && 'prototype' in generator) {
				this.#generator = new generator(this.#client);
				await this.#generator.run(cfg);
			}
		}
	}
	async #setup() {
		this.#pool = new this.#pgLib.Pool({

		});
		this.#client = await this.#pool.connect();
		await this.#client.query(`SET work_mem = '512MB'`);
	}
	async #teardown() {
		await this.#client.release();
		await this.#pool.end();
	}
	async run() {
		this.startMeasurement('total');
		this.startMeasurement('setup');
		await this.#setup();
		this.endMeasurement('setup');
		this.startMeasurement('prepare');
		await this.prepare();
		this.endMeasurement('prepare');

		this.startMeasurement('full');
		if (typeof this.implementation != 'function') {
			throw new Error(`Implementation not provided`);
		}
		await this.implementation(this.#generator);
		this.endMeasurement('full');

		this.startMeasurement('clean');
		await this.clean();
		this.endMeasurement('clean');
		this.startMeasurement('teardown');
		await this.#teardown();
		this.endMeasurement('teardown');
		this.endMeasurement('total');
		let details = _.mapValues(this.#measurements, (obj, k) => _.round(obj.total, 2));

		return {
			main: details[this.#mainMeasurement],
			details
		};
	}
	async clean() {
		
	}
	startMeasurement(name) {
		if (this.#measurements[name]) {
			throw new Error(`Measurement ${name} was already started`);
		}
		this.#measurements[name] = {
			start: process.hrtime.bigint(),
			end: null,
			total: null
		};
	}
	endMeasurement(name) {
		if (!this.#measurements[name]) {
			throw new Error(`Measurement ${name} was never started`);
		}
		if (this.#measurements[name].end) {
			throw new Error(`Measurement ${name} has already ended`);
		}
		this.#measurements[name].end = process.hrtime.bigint();
		this.#measurements[name].total = new Number(this.#measurements[name].end - this.#measurements[name].start) / 1000 / 1000;
	}
}

export default BaseCase;