'use strict'
const helper = require('../test-helper')

const suite = new helper.Suite()

// https://github.com/brianc/node-postgres/issues/2716
suite.testAsync('rows returned from pg have a clean shape which allows faster access and copying', async () => {
	const amountOfCols = 100
	const testCopies = 10000
	const expectedFasterFactor = 50

	const client = new helper.pg.Client()
	await client.connect()
	
	
	const queryFields = []
	for (let i = 1; i <= amountOfCols; i++) {
		queryFields.push(`${i} as col${i}`)
	}
	const query = `SELECT ${queryFields.join(', ')}`
	const resultWithoutShape = await client.query({
		text: query,
		usePrebuiltEmptyResultObjects: false
	})
	const rowFromPgWithoutShape = resultWithoutShape.rows[0]
	const resultWithShape = await client.query({
		text: query,
		usePrebuiltEmptyResultObjects: true
	})
	const rowFromPgWithShape = resultWithShape.rows[0]
	
	
	const beforeWithout = process.hrtime.bigint()
	for (let i = 0; i < testCopies; i++) {
		let copy = { ...rowFromPgWithoutShape }
	}
	const afterWithout = process.hrtime.bigint()
	const withoutResult = afterWithout - beforeWithout

	const beforeWith = process.hrtime.bigint()
	for (let i = 0; i < testCopies; i++) {
		let copy = { ...rowFromPgWithShape }
	}
	const afterWith = process.hrtime.bigint()
	const withResult = afterWith - beforeWith

	const factorFaster = withoutResult / withResult
	assert(factorFaster > expectedFasterFactor)

	await client.end()
})
