/**
 * AI Module Public Facade.
 *
 * All external modules must interact with the AI module exclusively
 * through this entry point. Direct imports from internal files
 * are prohibited.
 */

export { default as recommendRouter } from './routes/recommendations.js';
export { default as chatRouter } from './routes/chat.js';
export { aiRefreshQueue } from './queues/aiRefreshQueue.js';
export { default as aiRefreshWorker } from './workers/aiRefreshWorker.js';

export {
  getSimilarProducts,
  getUserRecommendations,
  triggerModelRefresh,
  chatWithAI,
} from './service.js';
