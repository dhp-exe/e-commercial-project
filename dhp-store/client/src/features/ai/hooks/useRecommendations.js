import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/api';

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
