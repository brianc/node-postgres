import { Client } from 'pg';

async function doTransaction(client: Client) {
  await client.query('BEGIN');
  
  let shouldRollback = false;
  let disposed = false;
  
  return {
    async [Symbol.asyncDispose]() {
      if (disposed) return;
      disposed = true;
      
      if (shouldRollback) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }
    },
    
    rollback() {
      shouldRollback = true;
    }
  };
}

// Auto-rollback wrapper that catches errors automatically
async function transaction<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await using txn = await doTransaction(client);
  
  try {
    const result = await fn();
    // If we get here, success - transaction will auto-commit
    return result;
  } catch (error) {
    // If error occurs, mark for rollback
    txn.rollback();
    throw error;
  }
}

export { transaction as transaction };
