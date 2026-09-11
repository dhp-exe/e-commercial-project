import axios from 'axios';
import { pool } from '../../shared/db/pool.js';
import redis from '../../shared/cache/redis.js';
import { AppError } from '../../shared/errors/AppError.js';
import { getProductsByIds } from '../catalog/index.js';
import { getLastPurchasedProductId } from '../orders/index.js';
import { aiRefreshQueue } from './queues/aiRefreshQueue.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:10000';

// Shared AI HTTP client with a 10-second timeout
const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 10000,
});

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Get similar products for a given product ID.
 */
export async function getSimilarProducts(id) {
  const cacheKey = `recs:product:${id}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (redisErr) {
    console.warn('Redis cache error, falling back to AI service', redisErr.message);
  }

  // Ask Python AI service: "What is similar to product X?"
  const aiResponse = await aiClient.get(`/recommend/${id}`);
  const similarIds = aiResponse.data?.recommendations;

  if (!Array.isArray(similarIds) || similarIds.length === 0) return [];

  const products = await getProductsByIds(similarIds);

  try {
    await redis.set(cacheKey, JSON.stringify(products), { EX: 300 });
  } catch (redisErr) {
    console.warn('Redis set error', redisErr.message);
  }

  return products;
}

/**
 * Get personalized recommendations for a user based on their purchase history.
 */
export async function getUserRecommendations(userId) {
  const cacheKey = `recs:user:${userId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (redisErr) {
    console.warn('Redis cache error, falling back to DB/AI', redisErr.message);
  }

  // Step A: Find the LAST item this user bought via orders module facade
  const lastProductId = await getLastPurchasedProductId(userId);

  let recommendedProducts = [];

  if (lastProductId) {
    try {
      const aiResponse = await aiClient.get(`/recommend/${lastProductId}`);
      const similarIds = aiResponse.data?.recommendations;
      if (Array.isArray(similarIds) && similarIds.length > 0) {
        recommendedProducts = await getProductsByIds(similarIds);
      }
    } catch (aiErr) {
      console.warn('AI recommendation fetch error:', aiErr.message);
    }
  }

  // Fallback: random products without ORDER BY RAND()
  if (recommendedProducts.length === 0) {
    const [maxRow] = await pool.query('SELECT MAX(id) AS maxId FROM products WHERE is_active = true');
    const maxId = maxRow[0]?.maxId || 0;

    if (maxId > 0) {
      const randomIds = new Set();
      const attempts = Math.min(maxId, 20); // avoid infinite loop on small tables
      for (let i = 0; i < attempts && randomIds.size < 4; i++) {
        randomIds.add(Math.floor(Math.random() * maxId) + 1);
      }

      if (randomIds.size > 0) {
        recommendedProducts = await getProductsByIds([...randomIds]);
      }
    }
  }

  try {
    await redis.set(cacheKey, JSON.stringify(recommendedProducts), { EX: 300 });
  } catch (redisErr) {
    console.warn('Redis set error', redisErr.message);
  }

  return recommendedProducts;
}

/**
 * Queue an AI model retraining job.
 */
export async function triggerModelRefresh() {
  const job = await aiRefreshQueue.add('ai-refresh', {
    type: 'ai-refresh',
  });
  return { message: 'AI model refresh queued', jobId: job.id };
}

/**
 * Send a message to the AI chatbot service.
 */
export async function chatWithAI(message) {
  if (!message || typeof message !== 'string') {
    throw new AppError('Please enter a message.', 400);
  }

  const trimmed = message.trim();
  if (trimmed.length === 0) {
    throw new AppError('Please enter a message.', 400);
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(`Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`, 400);
  }

  try {
    const aiResponse = await aiClient.post('/chat', { message: trimmed });
    return { reply: aiResponse.data.reply };
  } catch (error) {
    if (error.response) {
      console.error('Chat Error Status:', error.response.status);
      console.error('Chat Error Data:', error.response.data);
    } else {
      console.error('Chat Error:', error.message);
    }
    return { reply: "I'm sorry, I can't connect to the server right now.", status: 'error' };
  }
}
