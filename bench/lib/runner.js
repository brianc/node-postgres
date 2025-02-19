import * as cases from "../cases/index.js";
import * as versions from '../versions.js';

const caseName = process.argv[2];
if (!cases[caseName]) {
	throw new Error(`Case: ${caseName} not found`);
}

const pgVersion = process.argv[3];
if (!versions.versions[pgVersion]) {
	throw new Error(`Version: ${pgVersion} not found`);
}

const inst = new cases[caseName](versions.versions[pgVersion]);
const result = await inst.run();
process.stdout.write(JSON.stringify(result));