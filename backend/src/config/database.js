// src/config/database.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Create a connection pool (better than single client for multiple requests)
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 1200000, // Close idle clients after 120 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if no connection available
});

// Test the connection on startup
pool.on('connect', () => {
  console.log('✅ Database pool connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
  process.exit(-1); // Exit if database fails
});

// Helper function to execute queries with error handling
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Helper function to get a client from the pool (for transactions)
export const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Monkey patch the query method to track execution time
  client.query = (...args) => {
    client.lastQuery = args;
    return query(...args);
  };
  
  // Set a timeout to release the client if not released manually
  const timeout = setTimeout(() => {
    console.error('⚠️ Client was not released in time', client.lastQuery);
    release();
  }, 5000);
  
  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    release();
    return true;
  };
  
  return client;
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🔄 Closing database pool...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
  } catch (err) {
    console.error('❌ Error closing database pool:', err);
  }
};

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default pool;