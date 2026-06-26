import assert from 'assert'
import pg from 'pg'
import { DatabaseError } from 'pg-protocol'
import BatchQuery from "../src"

describe('BatchQuery error handling', function () {
    beforeEach(async function () {
        this.client = new pg.Client()
        await this.client.connect()
    })

    afterEach(function (){
        this.client.end()
    })
        
    it('handles error in parsing but can continue with another client', async function() {
        const batch = new BatchQuery({
            text: 'INSERT INTO foo (name) VALUES ($1)',
            values: [
                ['first'],
                ['second']
            ]
        })
        // fails since table is not yet created
        try {
            await this.client.query(batch).execute()
        } catch (e) {
            assert.equal(e.message, 'relation "foo" does not exist')
        }
        await this.client.query('Select now()')
    })

    it('handles error in insert of some of the values provided and reverts transaction', async function (){
        await this.client.query('CREATE TEMP TABLE foo(value int, id SERIAL PRIMARY KEY)')
        const batch = new BatchQuery({
            text: 'INSERT INTO foo (value) VALUES ($1)',
            values: [
                ['1'],
                ['3'],
                ['xxx']
            ],
        })
        // fails since xxx is not an int
        try {
            await this.client.query(batch).execute()
        } catch (e) {
            assert.equal(e.message, 'invalid input syntax for integer: "xxx"')
        }
        const response = await this.client.query('Select sum(value) from foo')
        assert.equal(response.rows[0]['sum'], null)
    })

    it('handles error in select batch query', async function (){
        await this.client.query('CREATE TEMP TABLE foo(value int, id SERIAL PRIMARY KEY)')
        const batch = new BatchQuery({
            text: 'SELECT * from foo where value = ($1)',
            values: [
                ['1'],
                ['3'],
                ['xxx']
            ],
        })
        // fails since xxx is not an int
        try {
            await this.client.query(batch).execute()
        } catch (e) {
            assert.equal(e.message, 'invalid input syntax for integer: "xxx"')
        }
    })
})