import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  socket: {
    reconnectStrategy(retries) {
      if (retries > 10) return new Error('Redis max retries reached');
      return Math.min(retries * 100, 3000); // exponential backoff, max 3s
    },
  },
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('reconnecting', () => console.log('Redis reconnecting...'));

// Non-blocking connect — server continues without caching if Redis is down
redis.connect().catch((err) => {
  console.error('Redis initial connection failed:', err.message);
  console.warn('Server will continue without caching.');
});

export default redis;