/**
 * Shared BullMQ IORedis connection configuration.
 *
 * BullMQ requires an IORedis-compatible connection object. This module
 * parses the existing REDIS_URL environment variable (used by the
 * node-redis caching layer) into a config object that BullMQ can use.
 *
 * Both BullMQ and the cache client connect to the SAME Redis server —
 * they just use different driver libraries (IORedis vs node-redis v5).
 */

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let parsedHost = '127.0.0.1';
let parsedPort = 6379;

try {
  const url = new URL(redisUrl);
  parsedHost = url.hostname || '127.0.0.1';
  parsedPort = Number(url.port) || 6379;
} catch {
  console.warn('Failed to parse REDIS_URL, using defaults (127.0.0.1:6379)');
}

/**
 * IORedis connection config shared by all BullMQ Queues and Workers.
 * `maxRetriesPerRequest: null` is required by BullMQ to avoid IORedis
 * throwing "Reached the max retries" errors on blocking commands.
 */
export const connection = {
  host: parsedHost,
  port: parsedPort,
  maxRetriesPerRequest: null,
};
