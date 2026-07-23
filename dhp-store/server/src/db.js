import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 20, // Increased for production concurrency
  queueLimit: 0,       // Unlimited queuing
  idleTimeout: 60000,  // Clean up idle connections after 60s
  ssl: process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : undefined
});