import Bencher from "./lib/bencher.js";
import * as versions from './versions.js';
import _ from 'lodash';

let measurementsByVersions = {};

for (let version in versions.versions) {
	console.log(`> ${version}`);
	let start = +new Date();
	measurementsByVersions[version] = await new Bencher(version).run();
	let end = +new Date();
	console.log(`< ${version}; ${end-start}ms`);
}

let first = Object.keys(measurementsByVersions)[0];
let cases = Object.keys(measurementsByVersions[first]);
for (let caseName of cases) {
	console.log(caseName, _.mapValues(measurementsByVersions, r => r[caseName].main));
}

/*console.log(util.inspect(measurementsByVersions, {
	depth: null
}));*/