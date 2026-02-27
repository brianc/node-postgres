#!/usr/bin/env node
'use strict'

/**
 * Netezza Driver Examples
 * 
 * This example demonstrates how to use the Netezza Node.js driver
 * to connect to IBM Netezza databases.
 */

const { Client } = require('../lib')

async function basicExample() {
  console.log('=== Basic Netezza Connection Example ===\n')

  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    debug: false,
  })

  try {
    console.log('Connecting to Netezza...')
    await client.connect()
    console.log('Connected successfully!\n')

    // Drop table
    // console.log('Dropping table...')
    // const dropResultt = await client.query('DROP TABLE example_tablee')
    // console.log('✓ DROP TABLE result:')
    // console.log('  - command:', dropResultt.command)
    // console.log('  - rowCount:', dropResultt.rowCount)
    // console.log()
    console.log('Creating Database db1')
    const createDatabaseResult = await client.query('create database db1;')
    console.log('CREATE Database result:')
    console.log('  - command:', createDatabaseResult.command)
    console.log()

    //Demonstrate CommandComplete message with CREATE TABLE
    console.log('Creating Schema db1.s1;')
    const createResult = await client.query('CREATE schema db1.s1;')
    console.log('CREATE SCHEMA RESULT:')
    console.log('  - command:', createResult.command)
    console.log()

    console.log('Creating Table t1;')
    const createTableResult = await client.query('CREATE TABLE db1.s1.t1(i int, j varchar(20));')
    console.log('CREATE TABLE RESULT:')
    console.log('  - command:', createTableResult.command)
    console.log()

    // Insert data
    console.log('Inserting data into t1;')
    // const insertResult = await client.query("INSERT INTO example_table VALUES (1, 'Netezza')")
    const insertSingleResult = await client.query("INSERT INTO db1.s1.t1 VALUES (1, 'Netezza')")
    console.log('✓ INSERT result:')
    console.log('  - command:', insertSingleResult.command)
    console.log('  - rowCount:', insertSingleResult.rowCount)
    console.log()

    // //Insert data
    // console.log('Inserting data...')
    // // const insertResult = await client.query("INSERT INTO example_table VALUES (1, 'Netezza')")
    // const insertResult = await client.query('INSERT INTO example_tablee SELECT * from example_tablee;')
    // console.log('✓ INSERT result:')
    // console.log('  - command:', insertResult.command)
    // console.log('  - rowCount:', insertResult.rowCount)
    // console.log()

    //Select data
    console.log('Selecting data from t1')
    const selectResult = await client.query('SELECT * from db1.s1.t1 limit 5;')
    // console.log('✓ SELECT result:', selectResult)
    console.log('  - command:', selectResult.command)
    console.log('  - rowCount:', selectResult.rowCount)
    console.log('  - rows:', JSON.stringify(selectResult.rows, null, 2))
    console.log()

    //
    console.log('NOTICE - show AUTOMAINT;')
    const selectRowResult = await client.query('show AUTOMAINT;')
    // console.log('✓ SELECT result:', selectRowResult)
    console.log('NOTICE result:', selectRowResult.notices[0].message)
    console.log('  - command:', selectRowResult.command)
    console.log()

    // console.log('Error query;')
    // const errorResult = await client.query('showw AUTOMAINT;')
    // // console.log('✓ SELECT result:', selectRowResult)
    // console.log('✓ NOTICE result:', errorResult.notices[0].message)
    // console.log('  - command:', errorResult.command)
    // // console.log('  - rowCount:', selectRowResult.rowCount)
    // // console.log('  - rows:', JSON.stringify(selectRowResult.rows, null, 2))
    // console.log()
    //Select data
    // console.log('SELECT CURRENT_TIMESTAMP')
    // const select1Result = await client.query('SELECT CURRENT_TIMESTAMP;')
    // console.log('✓ SELECT result:', select1Result)
    // console.log('  - command:', select1Result.command)
    // console.log('  - rowCount:', select1Result.rowCount)
    // console.log('  - rows:', JSON.stringify(select1Result.rows, null, 2))
    // console.log()

    // Drop table
    console.log('Dropping table db1.s1.t1')
    const dropResult = await client.query('DROP TABLE db1.s1.t1')
    console.log('DROP TABLE result:')
    console.log('  - command:', dropResult.command)
    console.log()

    // Drop table
    console.log('Dropping database db1')
    const dropDatabaseResult = await client.query('DROP DATABASE db1')
    console.log('DROP DATABASE result:')
    console.log('  - command:', dropDatabaseResult.command)
    console.log()
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
    console.log('\n✓ Connection closed')
  }
}

async function secureConnectionExample() {
  console.log('\n=== Secure Netezza Connection Example ===\n')
  
  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    securityLevel: 2, // Preferred secured
    appName: 'NetezzaExample',
    ssl: {
      rejectUnauthorized: false // For self-signed certificates
    }
  })

  try {
    console.log('Connecting with SSL...')
    await client.connect()
    console.log('✓ Secure connection established!\n')

    const result = await client.query('SELECT VERSION()')
    console.log('Netezza Version:', result.rows[0].version)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function poolExample() {
  console.log('\n=== Netezza Connection Pool Example ===\n')
  
  const { Pool } = require('../lib')
  
  const pool = new Pool({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })

  try {
    console.log('Creating connection pool...')
    
    // Execute multiple queries concurrently
    const queries = []
    for (let i = 1; i <= 3; i++) {
      queries.push(
        pool.query(`SELECT ${i} as query_number, CURRENT_TIMESTAMP as ts`)
      )
    }

    const results = await Promise.all(queries)
    console.log('✓ Executed 3 concurrent queries:\n')
    results.forEach((result, index) => {
      console.log(`Query ${index + 1}:`, result.rows[0])
    })
    console.log()

    // Using a client from the pool
    const client = await pool.connect()
    try {
      console.log('Using pooled client for transaction...')
      await client.query('BEGIN')
      const result = await client.query('SELECT 1 as test')
      console.log('Transaction result:', result.rows[0])
      await client.query('COMMIT')
      console.log('✓ Transaction committed\n')
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
    console.log('✓ Pool closed')
  }
}

async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===\n')
  
  const client = new Client({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password'
  })

  try {
    await client.connect()
    console.log('✓ Connected\n')

    // Intentional error - invalid SQL
    try {
      await client.query('SELECT * FROM nonexistent_table')
    } catch (error) {
      console.log('Caught expected error:')
      console.log('  Code:', error.code)
      console.log('  Message:', error.message)
      console.log()
    }

    // Connection is still valid
    const result = await client.query('SELECT 1 as still_working')
    console.log('✓ Connection still works:', result.rows[0])
    console.log()

  } catch (error) {
    console.error('Unexpected error:', error.message)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function transactionExample() {
  console.log('\n=== Transaction Example ===\n')
  
  const { Pool } = require('../lib')
  
  const pool = new Pool({
    host: process.env.NETEZZA_HOST || 'localhost',
    port: parseInt(process.env.NETEZZA_PORT || '5480'),
    database: process.env.NETEZZA_DATABASE || 'system',
    user: process.env.NETEZZA_USER || 'admin',
    password: process.env.NETEZZA_PASSWORD || 'password'
  })

  const client = await pool.connect()

  try {
    console.log('Starting transaction...')
    await client.query('BEGIN')
    
    console.log('Executing queries in transaction...')
    await client.query('SELECT 1')
    await client.query('SELECT 2')
    
    await client.query('COMMIT')
    console.log('✓ Transaction committed successfully\n')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('✗ Transaction rolled back:', error.message)
  } finally {
    client.release()
    await pool.end()
    console.log('✓ Connection closed')
  }
}

// Main execution
async function main() {
  console.log('Netezza Node.js Driver Examples')
  console.log('================================\n')
  console.log('Environment variables:')
  console.log('  NETEZZA_HOST:', process.env.NETEZZA_HOST || 'localhost')
  console.log('  NETEZZA_PORT:', process.env.NETEZZA_PORT || '5480')
  console.log('  NETEZZA_DATABASE:', process.env.NETEZZA_DATABASE || 'system')
  console.log('  NETEZZA_USER:', process.env.NETEZZA_USER || 'admin')
  console.log('  NETEZZA_PASSWORD:', process.env.NETEZZA_PASSWORD ? '***' : 'password')
  console.log()

  try {
    await basicExample()
    
    // Uncomment to run other examples
    // await secureConnectionExample()
    // await poolExample()
    // await errorHandlingExample()
    // await transactionExample()
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

module.exports = {
  basicExample,
  secureConnectionExample,
  poolExample,
  errorHandlingExample,
  transactionExample,
}
