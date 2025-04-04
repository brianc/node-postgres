import * as Cases from "../cases/index.js";
import cp from 'node:child_process';
import * as versions from '../versions.js';

class Bencher {
	#pgVersion;
	constructor(pgVersion) {
		if (!pgVersion) {
			throw new Error(`pgVersion not passed`);
		}
		this.#pgVersion = pgVersion;
	}
	async run() {
		let result = {};
		for (let caseType in Cases) {
			result[caseType] = await this.#runCase(caseType);
		}
		return result;
	}
	async #runCase(name) {
		return await this.#runInCp(name);
	}
	#runInCp(caseName) {
		return new Promise((resolve, reject) => {
			cp.exec(`node lib/runner.js ${caseName} ${this.#pgVersion}`, (err, stdout, stderr) => {
				if (err) {
					return reject(new Error(`Error running case ${caseName} for version ${this.#pgVersion}; ${err.message}`));
				}
				if (stderr) {
					return reject(new Error(`Error while running case ${caseName} for version ${this.#pgVersion}; ${stderr}`));
				}
				try {
					return resolve(JSON.parse(stdout));
				} catch (e) {
					return reject(new Error(`Error after running case ${caseName} for version ${this.#pgVersion}; ${e.message}`));
				}
			})
		});
	}
}

export default Bencher;