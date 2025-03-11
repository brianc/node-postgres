import BaseGenerator from "./base.js";

class WideRowsGenerator extends BaseGenerator {
	#typeConfigs = {
		int: () => {
			return Math.floor(Math.random() * 1000000);
		},
		uuid: () => {
			return this.uuid();
		},
		text: () => {
			return this.uuid(100);
		}
	};
	constructor(client) {
		super(client)
	}
	async run(config) {
		if (!config) {
			throw new Error(`Config not passed to run`);
		}
		if (!config.rows) {
			throw new Error(`Rows not passed`);
		}
		if (!config.fields) {
			throw new Error(`Fields not passed`);
		}
		let fields = [];
		for (let i = 0; i < config.fields; i++) {
			let typeIndex = i % Object.keys(this.#typeConfigs).length;
			fields.push({
				name: `col_${i}`,
				type: Object.keys(this.#typeConfigs)[typeIndex],
				generator: this.#typeConfigs[Object.keys(this.#typeConfigs)[typeIndex]]
			});
		}
		await this.create(this.id, fields);
		let data = [];
		let beforeGenerate = +new Date();
		for (let i = 0; i < config.rows; i++) {
			let obj = {};
			for (let field of fields) {
				obj[field.name] = field.generator();
			}
			data.push(obj);
		}
		let afterGenerate = +new Date();
		//console.log(`generating; ${afterGenerate-beforeGenerate}ms`);
		await this.insert(this.id, fields, data);
		let afterInsert = +new Date();
		//console.log(`inserting; ${afterInsert-afterGenerate}ms`);
	}
	async cleanup() {
		await this.drop(this.id);
	}
}

export default WideRowsGenerator;