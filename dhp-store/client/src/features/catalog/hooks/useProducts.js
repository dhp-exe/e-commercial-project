import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/api';

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
