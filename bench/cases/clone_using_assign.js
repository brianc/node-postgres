import BaseCase from "./base.js";
import { WideRowsGenerator } from "../generators/index.js";

class CloneUsingAssignCase extends BaseCase {
	constructor(pgLib) {
		super(pgLib, 'processing');
	}
	async prepare() {
		await super.prepare(WideRowsGenerator, { rows: 10000, fields: 100 });
	}
	async implementation(generator) {
		let result = await generator.query(`SELECT * FROM "${generator.id}"`);
		this.startMeasurement('processing');
		for (let row of result.rows) {
			this.runRow(row);
		}
		this.endMeasurement('processing');
	}
	runRow(row) {
		let clone = Object.assign({}, row);
	}
}

export default CloneUsingAssignCase;