import axios from 'axios';
import * as Sentry from '@sentry/node';
import { pool } from '../../shared/db/pool.js';
import redis from '../../shared/cache/redis.js';
import { AppError } from '../../shared/errors/AppError.js';
import { getProductById, getProducts, getProductsByIds } from '../catalog/index.js';
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
 *
 * Tier 1: Query Python AI microservice (Pinecone semantic similarity).
 * Tier 2: Relational fallback to active products in the same category (excluding current product).
 * Tier 3: Top active products from catalog if category has insufficient items.
 */
export async function getSimilarProducts(id) {
  const productId = parseInt(id, 10);
  if (isNaN(productId) || productId <= 0) {
    return [];
  }

  const cacheKey = `recs:product:${productId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (redisErr) {
    console.warn('Redis cache error, falling back to AI/DB:', redisErr.message);
  }

  let products = [];

  // Step 1: Query Python AI service for Pinecone semantic similarity
  try {
    const aiResponse = await aiClient.get(`/recommend/${productId}`);
    const similarIds = aiResponse.data?.recommendations;

    if (Array.isArray(similarIds) && similarIds.length > 0) {
      products = await getProductsByIds(similarIds);
    }
  } catch (aiErr) {
    console.warn(`[AI Service] Microservice unavailable for product ${productId}:`, aiErr.message);
    Sentry.addBreadcrumb({
      category: 'ai-service',
      message: `Failed to fetch similar products from Python microservice: ${aiErr.message}`,
      level: 'warning',
      data: { productId },
    });
  }

  // Step 2: Relational fallback to active products in same category
  if (products.length === 0) {
    try {
      const currentProduct = await getProductById(productId);
      let fallbackProducts = [];

      if (currentProduct?.category_id) {
        const categoryProducts = await getProducts({ categoryId: currentProduct.category_id });
        fallbackProducts = categoryProducts.filter((p) => p.id !== productId);
      }

      // Step 3: If category has fewer than 4 products, top up with other active products
      if (fallbackProducts.length < 4) {
        const allProducts = await getProducts();
        const existingIds = new Set([productId, ...fallbackProducts.map((p) => p.id)]);
        const additional = allProducts.filter((p) => !existingIds.has(p.id));
        fallbackProducts = [...fallbackProducts, ...additional].slice(0, 4);
      } else {
        fallbackProducts = fallbackProducts.slice(0, 4);
      }

      products = fallbackProducts;
    } catch (fallbackErr) {
      console.error('[AI Service] Relational fallback error:', fallbackErr.message);
      Sentry.captureException(fallbackErr, {
        tags: { module: 'ai', operation: 'getSimilarProducts-fallback' },
        extra: { productId },
      });
    }
  }

  if (products.length > 0) {
    try {
      await redis.set(cacheKey, JSON.stringify(products), { EX: 300 });
    } catch (redisErr) {
      console.warn('Redis set error:', redisErr.message);
    }
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
