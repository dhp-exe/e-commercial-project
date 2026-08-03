import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

/**
 * Fetch all products, optionally filtered by query params.
 * Cache key includes filters so each unique filter combo gets its own cache entry.
 */
export function useProducts(params = {}) {
  return useQuery({
    queryKey: ['products', params.q || '', params.categoryId || ''],
    queryFn: () => api.get('/products', { params }).then(r => r.data),
  });
}

/**
 * Fetch a single product by ID.
 */
export function useProduct(productId) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.get(`/products/${productId}`).then(r => r.data),
    enabled: !!productId,
  });
}

/**
 * Fetch AI-powered product recommendations for a specific product.
 * Returns similar products based on TF-IDF cosine similarity.
 */
export function useProductRecommendations(productId) {
  return useQuery({
    queryKey: ['recommendations', 'product', productId],
    queryFn: () => api.get(`/recommend/product/${productId}`).then(r => {
      return Array.isArray(r.data) ? r.data : [];
    }),
    enabled: !!productId,
  });
}

/**
 * Fetch personalized recommendations for the logged-in user.
 * Only runs when the user is authenticated (token is truthy).
 */
export function useUserRecommendations(isAuthenticated) {
  return useQuery({
    queryKey: ['recommendations', 'user'],
    queryFn: () => api.get('/recommend/user').then(r => {
      return Array.isArray(r.data) ? r.data : [];
    }),
    enabled: !!isAuthenticated,
  });
}
