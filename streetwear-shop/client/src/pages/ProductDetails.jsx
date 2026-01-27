import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import './ProductDetails.css';

export default function ProductDetails() {
    const { id } = useParams(); // Get Product ID from URL
    const navigate = useNavigate();
    const { add } = useCart();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSize, setSelectedSize] = useState(null);
    const [quantity, setQuantity] = useState(1);

    // Fetch single product details based on ID
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
        setQuantity(prev => Math.max(1, prev + delta)); // Prevent going below 1
    };

    const handleAddToCart = async (isBuyNow = false) => {
        if (availableSizes.length > 0 && !selectedSize) {
            alert("Please select a size first.");
            return;
        }

        const success = await add(product.id, quantity, selectedSize);
        
        if (success && isBuyNow) {
            navigate('/checkout');
        }
    };

    return (
        <div className="pdp-container fade-in">
            {/* Left: Image */}
            <div className="pdp-image-container">
                <img src={product.image_url} alt={product.name} className="pdp-image" />
            </div>

            {/* Right: Details */}
            <div className="pdp-info">
                <h1 className="pdp-name">{product.name}</h1>
                <div className="pdp-price">${Number(product.price).toFixed(2)}</div>
                <p style={{color:'#666', lineHeight:'1.5'}}>
                    {product.description || "A classic essential for your wardrobe. Made with high-quality materials for lasting comfort and style."}
                </p>

                {/* Size Selector (Only show if sizes exist) */}
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
    );
}