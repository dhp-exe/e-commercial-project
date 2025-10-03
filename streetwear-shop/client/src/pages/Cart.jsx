import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartDrawer from '../components/CartDrawer';

const Cart = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(true);

    const handleClose = () => {
        setIsOpen(false);
        navigate(-1);
    };

    return (
        <CartDrawer isOpen={isOpen} onClose={handleClose} />
    );
};

export default Cart;