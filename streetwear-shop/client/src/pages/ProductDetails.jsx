import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext'; 
import CartDrawer from '../components/CartDrawer';
import './ProductDetails.css';

import bagIcon from "../assets/shopping_bag.png";
import accountIcon from "../assets/account_icon.png";

export default function ProductDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const { add, totalQty } = useCart(); 
    const { token, name } = useAuth();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSize, setSelectedSize] = useState(null);
    const [quantity, setQuantity] = useState(1);
    
    const [isCartOpen, setCartOpen] = useState(false);

    const productImgRef = useRef(null);
    const cartIconRef = useRef(null);
    const [flyingItem, setFlyingItem] = useState(null);

    useEffect(() => {
        api.get(`/products/${id}`)
           .then(res => {
               setProduct(res.data);
               setLoading(false);
           })
           .catch(err => {
               console.error("Failed to fetch product", err);
               setLoading(false);
           });
    }, [id]);

    if (loading) return <div style={{padding: 40, textAlign:'center'}}>Loading product...</div>;
    if (!product) return <div style={{padding: 40, textAlign:'center'}}>Product not found.</div>;

    const availableSizes = product.sizes ? product.sizes.split(',') : [];

    const handleQuantityChange = (delta) => {
        setQuantity(prev => Math.max(1, prev + delta)); 
    };

    const triggerFlyAnimation = () => {
        if (!productImgRef.current || !cartIconRef.current) return;

        const startRect = productImgRef.current.getBoundingClientRect();
        const endRect = cartIconRef.current.getBoundingClientRect();

        setFlyingItem({
            src: product.image_url,
            style: {
                position: 'fixed',
                top: startRect.top,
                left: startRect.left,
                width: startRect.width,
                height: startRect.height,
                opacity: 1,
                zIndex: 9999,
                borderRadius: '12px',
                pointerEvents: 'none',
                transition: 'none', 
            }
        });

        requestAnimationFrame(() => {
            setTimeout(() => {
                setFlyingItem({
                    src: product.image_url,
                    style: {
                        position: 'fixed',
                        top: endRect.top + 10,
                        left: endRect.left + 10,
                        width: '20px',
                        height: '20px',
                        opacity: 0,
                        zIndex: 9999,
                        borderRadius: '50%',
                        pointerEvents: 'none',
                        transition: 'all 0.8s cubic-bezier(0.2, 1, 0.3, 1)'
                    }
                });
            }, 20); 
        });

        setTimeout(() => setFlyingItem(null), 850);
    };

    const handleAddToCart = async (isBuyNow = false) => {
        if (availableSizes.length > 0 && !selectedSize) {
            alert("Please select a size first.");
            return;
        }

        const success = await add(product.id, quantity, selectedSize);
        
        if (success) {
            if (isBuyNow) {
                navigate('/checkout');
            } else {
                triggerFlyAnimation();
            }
        }
    };

    return (
    <>  
        {flyingItem && (
            <img 
                src={flyingItem.src} 
                style={flyingItem.style} 
                className="flying-item" 
                alt="" 
            />
        )}
        
        {/* --- HEADER ICONS --- */}
        <div className="home-icons" 
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '20px 40px',
            }}>
            {/* Back Button */}
            <button
                onClick={() => navigate(-1)}
                style={{
                position: 'relative',
                color: 'black',
                fontSize: 18,
                cursor: 'pointer',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.12)',
                background: 'white',
                top: 10,
                left: 30,
                padding: '10px 14px',
                }}>
                ← Back
            </button>

            {/* Right-side icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginLeft: 'auto'}}>
                {/* Cart Icon */}
                <div ref={cartIconRef} style={{ position: 'relative' }}>
                <img
                    src={bagIcon}
                    alt="Cart"
                    title="Cart"
                    onClick={() => setCartOpen(true)}
                    style={{ width: 32, height: 32, cursor: 'pointer' }}
                />
                {totalQty > 0 && (
                    <span
                    style={{
                        position: 'absolute',
                        bottom: -5,
                        left: -5,
                        background: 'black',
                        color: 'white',
                        borderRadius: '50%',
                        padding: '2px 6px',
                        fontSize: 12,
                        fontWeight: 'bold',
                        minWidth: 18,
                        textAlign: 'center',
                    }}
                    >
                    {totalQty}
                    </span>
                )}
                </div>

                {/* Account Icon */}
                <img
                src={accountIcon}
                alt="Account"
                title={token ? `Account (${name || 'me'})` : 'Login / Register'}
                onClick={() => navigate(token ? '/account' : '/login')}
                style={{ width: 32, height: 32, cursor: 'pointer' }}
                />
            </div>
        </div>

        {/* --- MAIN PRODUCT CONTENT --- */}
        <div className="pdp-container fade-in">
            {/* Left: Image */}
            <div className="pdp-image-container">
                <img 
                    ref={productImgRef}
                    src={product.image_url} 
                    alt={product.name} 
                    className="pdp-image" 
                />
            </div>

            {/* Right: Details */}
            <div className="pdp-info">
                <h1 className="pdp-name">{product.name}</h1>
                <div className="pdp-price">${Number(product.price).toFixed(2)}</div>
                <p style={{color:'#666', lineHeight:'1.5'}}>
                    {product.description || "A classic essential for your wardrobe. Made with high-quality materials for lasting comfort and style."}
                </p>

                {/* Size Selector */}
                {availableSizes.length > 0 && (
                    <div className="size-section">
                        <h4>Select Size: {selectedSize}</h4>
                        <div className="size-grids">
                            {availableSizes.map(size => (
                                <div 
                                    key={size} 
                                    className={`size-box ${selectedSize === size ? 'selected' : ''}`}
                                    onClick={() => setSelectedSize(size)}
                                >
                                    {size}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Quantity Selector */}
                <div className="qty-section">
                    <h4>Quantity</h4>
                    <div className="qty-wrapper">
                        <button className="qty-btn" onClick={() => handleQuantityChange(-1)}>−</button>
                        <div className="qty-display">{quantity}</div>
                        <button className="qty-btn" onClick={() => handleQuantityChange(1)}>+</button>
                    </div>
                </div>

                {/* Buttons */}
                <div className="pdp-actions">
                    <button className="btn-add-cart" onClick={() => handleAddToCart(false)}>
                        Add to Cart
                    </button>
                    <button className="btn-buy-now" onClick={() => handleAddToCart(true)}>
                        Buy Now
                    </button>
                </div>
            </div>
        </div>

        <CartDrawer isOpen={isCartOpen} onClose={() => setCartOpen(false)} />
    </>
    );
}