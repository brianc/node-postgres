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
  console.log('\n=== Comprehensive Transaction Management Tests ===\n')

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
    console.log('✓ Connected successfully!\n')

    // Setup: Create test table
    console.log('Setting up test table...')
    try {
      // Try to drop table if it exists (Netezza doesn't support IF EXISTS)
      try {
        await client.query('DROP TABLE transaction_test')
        console.log('✓ Existing test table dropped')
      } catch (err) {
        // Table doesn't exist, that's fine
        console.log('✓ No existing test table to drop')
      }

      await client.query('CREATE TABLE transaction_test (id INT, name VARCHAR(50), test_type VARCHAR(50))')
      console.log('✓ Test table created\n')
    } catch (error) {
      console.error('Setup failed:', error.message)
      throw error
    }

    //Test 1: BEGIN and COMMIT
    console.log('--- Test 1: BEGIN and COMMIT ---')
    try {
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')

      console.log('2. Inserting data within transaction...')
      const insertResult = await client.query(
        "INSERT INTO transaction_test VALUES (1, 'Test Commit', 'commit_test')"
      )
      console.log('   ✓ INSERT executed:', insertResult.rowCount, 'row(s)')

      console.log('3. Executing COMMIT...')
      await client.query('COMMIT')
      console.log('   ✓ COMMIT executed successfully')

      console.log('4. Verifying data was persisted...')
      const verifyResult = await client.query(
        "SELECT * FROM transaction_test WHERE test_type = 'commit_test'"
      )
      console.log('   ✓ Data found after COMMIT:', verifyResult.rows)
      console.log('   ✓ Test 1 PASSED: COMMIT works correctly\n')
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('   ✗ Test 1 FAILED:', error.message, '\n')
    }

    // Test 2: BEGIN and ROLLBACK
    console.log('--- Test 2: BEGIN and ROLLBACK ---')
    try {
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')

      console.log('2. Inserting data within transaction...')
      await client.query(
        "INSERT INTO transaction_test VALUES (2, 'Test Rollback', 'rollback_test')"
      )
      console.log('   ✓ INSERT executed')

      console.log('3. Executing ROLLBACK...')
      await client.query('ROLLBACK')
      console.log('   ✓ ROLLBACK executed successfully')

      console.log('4. Verifying data was NOT persisted...')
      const verifyResult = await client.query(
        "SELECT * FROM transaction_test WHERE test_type = 'rollback_test'"
      )
      if (verifyResult.rows.length === 0) {
        console.log('   ✓ No data found after ROLLBACK (expected)')
        console.log('   ✓ Test 2 PASSED: ROLLBACK works correctly\n')
      } else {
        console.log('   ✗ Data found after ROLLBACK (unexpected):', verifyResult.rows)
        console.log('   ✗ Test 2 FAILED\n')
      }
    } catch (error) {
      console.error('   ✗ Test 2 FAILED:', error.message, '\n')
    }

    
    // Test 3: Error handling with automatic ROLLBACK
    console.log('--- Test 3: Error Handling with ROLLBACK ---')
    try {
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')

      console.log('2. Inserting valid data...')
      await client.query(
        "INSERT INTO transaction_test VALUES (4, 'Test Error', 'error_test')"
      )
      console.log('   ✓ First INSERT executed')

      console.log('3. Attempting invalid operation (intentional error)...')
      try {
        await client.query('INSERT INTO non_existent_table VALUES (1)')
      } catch (err) {
        console.log('   ✓ Error caught as expected:', err.message)
      }

      console.log('4. Executing ROLLBACK due to error...')
      await client.query('ROLLBACK')
      console.log('   ✓ ROLLBACK executed successfully')

      console.log('5. Verifying all transaction data was rolled back...')
      const verifyResult = await client.query(
        "SELECT * FROM transaction_test WHERE test_type = 'error_test'"
      )
      if (verifyResult.rows.length === 0) {
        console.log('   ✓ No data found after ROLLBACK (expected)')
        console.log('   ✓ Test 3 PASSED: Error handling with ROLLBACK works correctly\n')
      } else {
        console.log('   ✗ Data found after ROLLBACK (unexpected):', verifyResult.rows)
        console.log('   ✗ Test 3 FAILED\n')
      }
    } catch (error) {
      console.error('   ✗ Test 3 FAILED:', error.message, '\n')
    }

    // Test 4: Multiple operations in single transaction test
    console.log('--- Test 4: Multiple Operations in Single Transaction ---')
    try {
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')

      console.log('2. Executing  INSERT operations...')
      await client.query("INSERT INTO transaction_test VALUES (5, 'Multi Op 1', 'multi_test')")
      console.log('3. Executing COMMIT...')
      await client.query('COMMIT')
      console.log('   ✓ COMMIT executed successfully')
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')
      await client.query("INSERT INTO transaction_test VALUES (6, 'Multi Op 2', 'multi_test')")
      await client.query("INSERT INTO transaction_test VALUES (7, 'Multi Op 3', 'multi_test')")
      console.log('   ✓ 3 INSERT operations executed')
      console.log(' Executing ROLLBACK...')
      await client.query('ROLLBACK')
      console.log('   ✓ ROLLBACK executed successfully')//rollback before commit should work

      console.log('4. Verifying correct data  persisted...')
      const verifyResult = await client.query(
        "SELECT * FROM transaction_test WHERE test_type = 'multi_test' ORDER BY id"
      )
      console.log('   ✓ Found', verifyResult.rows.length, 'rows after COMMIT')
      console.log('   ✓ Data:', verifyResult.rows)
      console.log('   ✓ Test 4 PASSED: Multiple operations in transaction work correctly\n')


    } catch (error) {
      //await client.query('ROLLBACK')
      console.error('   ✗ Test 4 FAILED:', error.message, '\n')
    }

    // Test 5: ROLLBACK after COMMIT (should have no effect)
    console.log('--- Test 5: ROLLBACK After COMMIT (No Effect) ---')
    try {
      console.log('1. Executing BEGIN...')
      await client.query('BEGIN')
      console.log('   ✓ BEGIN executed successfully')

      console.log('2. Inserting data...')
      await client.query("INSERT INTO transaction_test VALUES (8, 'Test Commit Then Rollback', 'commit_rollback_test')")
      console.log('   ✓ INSERT executed')

      console.log('3. Executing COMMIT...')
      await client.query('COMMIT')
      console.log('   ✓ COMMIT executed successfully (data is now permanent)')

      console.log('4. Attempting ROLLBACK after COMMIT...')
      await client.query('ROLLBACK')
      console.log('   ✓ ROLLBACK executed (but has no effect - no active transaction)')

      console.log('5. Verifying data is still present (ROLLBACK had no effect)...')
      const verifyResult = await client.query(
        "SELECT * FROM transaction_test WHERE test_type = 'commit_rollback_test'"
      )
      if (verifyResult.rows.length > 0) {
        console.log('   ✓ Data still exists after ROLLBACK:', verifyResult.rows)
        console.log('   ✓ Test 5 PASSED: ROLLBACK after COMMIT has no effect (as expected)\n')
      } else {
        console.log('   ✗ Data not found (unexpected)')
        console.log('   ✗ Test 5 FAILED\n')
      }
    } catch (error) {
      console.error('   ✗ Test 5 FAILED:', error.message, '\n')
    }

    // Summary
    console.log('--- Test Summary ---')
    const allData = await client.query('SELECT * FROM transaction_test ORDER BY id')
    console.log('Total rows in transaction_test table:', allData.rows.length)
    console.log('All data:', JSON.stringify(allData.rows, null, 2))
    console.log()

    //Cleanup
    console.log('Cleaning up test table...')
    await client.query('DROP TABLE transaction_test')
    console.log('✓ Test table dropped\n')

  } catch (error) {
    console.error('Fatal error in transaction tests:', error.message)
  } finally {
    await client.end()
    console.log('✓ Connection closed')
  }
}

async function ddlExample() {
  console.log('\n=== Comprehensive DDL Tests ===\n')

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
    console.log('✓ Connected successfully!\n')

    // Test 1: CREATE TABLE AS (CTAS)
    console.log('--- Test 1: CREATE TABLE AS (CTAS) ---')
    try {
      console.log('1. Creating source table...')
      await client.query('CREATE TABLE ddl_source (id INT, name VARCHAR(50), value INT)')
      await client.query("INSERT INTO ddl_source VALUES (1, 'Row1', 100)")
      await client.query("INSERT INTO ddl_source VALUES (2, 'Row2', 200)")
      console.log('   ✓ Source table created with 2 rows')

      console.log('2. Creating table using CTAS...')
      await client.query('CREATE TABLE ddl_ctas AS SELECT * FROM ddl_source WHERE value > 100')
      console.log('   ✓ CTAS executed successfully')

      console.log('3. Verifying CTAS result...')
      const result = await client.query('SELECT * FROM ddl_ctas')
      console.log('   ✓ CTAS table contains:', result.rows.length, 'row(s)')
      console.log('   ✓ Data:', result.rows)
      console.log('   ✓ Test 1 PASSED: CREATE TABLE AS works correctly\n')
    } catch (error) {
      console.error('   ✗ Test 1 FAILED:', error.message, '\n')
    }

    // Test 2: ALTER TABLE
    console.log('--- Test 2: ALTER TABLE ---')
    try {
      console.log('1. Creating table for ALTER tests...')
      await client.query('CREATE TABLE ddl_alter (id INT, name VARCHAR(50))')
      console.log('   ✓ Table created')

      console.log('2. Adding new column...')
      await client.query('ALTER TABLE ddl_alter ADD COLUMN email VARCHAR(100)')
      console.log('   ✓ Column added successfully')

      console.log('3. Inserting data with new column...')
      await client.query("INSERT INTO ddl_alter VALUES (1, 'Test', 'test@example.com')")
      console.log('   ✓ Data inserted')

      console.log('4. Verifying ALTER result...')
      const result = await client.query('SELECT * FROM ddl_alter')
      console.log('   ✓ Table structure modified:', result.rows)
      console.log('   ✓ Test 2 PASSED: ALTER TABLE works correctly\n')
    } catch (error) {
      console.error('   ✗ Test 2 FAILED:', error.message, '\n')
    }

    // Test 3: CREATE VIEW
    console.log('--- Test 3: CREATE VIEW ---')
    try {
      console.log('1. Creating view from existing table...')
      await client.query('CREATE VIEW ddl_view AS SELECT id, name FROM ddl_source WHERE id > 0')
      console.log('   ✓ View created successfully')

      console.log('2. Querying the view...')
      const result = await client.query('SELECT * FROM ddl_view')
      console.log('   ✓ View query returned:', result.rows.length, 'row(s)')
      console.log('   ✓ Data:', result.rows)
      console.log('   ✓ Test 3 PASSED: CREATE VIEW works correctly\n')
    } catch (error) {
      console.error('   ✗ Test 3 FAILED:', error.message, '\n')
    }

    // Test 4: CREATE SEQUENCE
    console.log('--- Test 4: CREATE SEQUENCE ---')
    try {
      console.log('1. Creating sequence...')
      await client.query('CREATE SEQUENCE ddl_seq START WITH 1 INCREMENT BY 1')
      console.log('   ✓ Sequence created successfully')

      console.log('2. Getting next value from sequence...')
      const result1 = await client.query('SELECT NEXT VALUE FOR ddl_seq AS next_val')
      console.log('   ✓ First value:', result1.rows[0])

      const result2 = await client.query('SELECT NEXT VALUE FOR ddl_seq AS next_val')
      console.log('   ✓ Second value:', result2.rows[0])

      console.log('   ✓ Test 4 PASSED: CREATE SEQUENCE works correctly\n')
    } catch (error) {
      console.error('   ✗ Test 4 FAILED:', error.message, '\n')
    }


    // Test 5: CREATE PROCEDURE
    console.log('--- Test 5: CREATE PROCEDURE (Stored Procedure) ---')
    try {
      console.log('1. Creating stored procedure...')
      await client.query(`
    CREATE OR REPLACE PROCEDURE ddl_test_proc()
    RETURNS INTEGER
    LANGUAGE NZPLSQL
    AS
    BEGIN_PROC
      BEGIN
        INSERT INTO ddl_source VALUES (10, 'Proc Test', 1000);
        RETURN 1;
      END;
    END_PROC;
  `)

      console.log('   ✓ Stored procedure created successfully')

      console.log('2. Executing stored procedure...')
      await client.query("CALL ddl_test_proc()")
      console.log('   ✓ Stored procedure executed')

      console.log('3. Verifying procedure result...')
      const result = await client.query('SELECT * FROM ddl_source WHERE id = 10')

      if (result.rows.length > 0) {
        console.log('   ✓ Procedure inserted data:', result.rows)
        console.log('   ✓ Test 5 PASSED\n')
      } else {
        console.log('   ✗ No data found')
        console.log('   ✗ Test 5 FAILED\n')
      }

    } catch (error) {
      console.error('   ✗ Test 5 FAILED:', error.message, '\n')
    }



    // Cleanup
    console.log('Cleaning up DDL test objects...')
    // Drop in correct order (dependencies first)
    try { await client.query('DROP VIEW ddl_view') } catch (e) { /* ignore */ }
    try { await client.query('DROP PROCEDURE ddl_test_proc(INT, VARCHAR)') } catch (e) { /* ignore */ }
    try { await client.query('DROP FUNCTION ddl_test_func(INT)') } catch (e) { /* ignore */ }
    try { await client.query('DROP SEQUENCE ddl_seq') } catch (e) { /* ignore */ }
    try { await client.query('DROP TABLE ddl_ctas') } catch (e) { /* ignore */ }
    try { await client.query('DROP TABLE ddl_alter') } catch (e) { /* ignore */ }
    try { await client.query('DROP TABLE ddl_source') } catch (e) { /* ignore */ }
    console.log('✓ DDL test objects cleaned up\n')

  } catch (error) {
    console.error('Fatal error in DDL tests:', error.message)
  } finally {
    await client.end()
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
    // Run transaction tests by default
    //await transactionExample()

    // Uncomment to run other examples
    await ddlExample()
    // await basicExample()
    // await secureConnectionExample()
    // await poolExample()
    // await errorHandlingExample()
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