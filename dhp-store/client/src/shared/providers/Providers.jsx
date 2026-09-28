"use client";

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import CartProvider from '@/features/orders/context/CartContext';
import { SearchProvider } from '@/shared/context/SearchContext';
import { ToastProvider } from '@/shared/context/ToastContext';

export default function Providers({ children }) {
  // useState ensures one QueryClient per browser session (not per render)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <SearchProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </SearchProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
