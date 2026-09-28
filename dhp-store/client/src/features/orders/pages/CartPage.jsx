import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import CartDrawer from '@/features/orders/components/CartDrawer';

const Cart = () => {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(true);

    const handleClose = () => {
        setIsOpen(false);
        router.back();
    };

    return (
        <CartDrawer isOpen={isOpen} onClose={handleClose} />
    );
};

export default Cart;