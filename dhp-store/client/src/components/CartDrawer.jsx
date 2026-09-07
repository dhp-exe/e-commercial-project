import React, {useContext, useState} from "react";
import {useNavigate} from "react-router-dom";
import api from "../api";
import { CartContext } from "../context/CartContext";
import "./CartDrawer.css";

export default function CartDrawer({ isOpen, onClose }) {
  const { items, total, update, refresh } = useContext(CartContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  async function handleCheckout() {
    if (items.length === 0) {
      alert("Your cart is empty!");
      return;
    }
    onClose(); 
    navigate("/checkout");
  }

  return (
    <div className={`cart-drawer ${isOpen ? "open" : ""}`}>
      <div className="cart-header">
        <h2>🛒 Your cart</h2>
        <button onClick={onClose}>✖</button>
      </div>

      <div className="cart-body">
        {items.length === 0 ? (
          <p>Your cart is empty</p>
        ) : (
          items.map((item) => (
            <div key={item.variant_id ? `v-${item.variant_id}` : `${item.id || item.product_id}-${item.size}`} className="cart-item">
              <img src={item.image_url} alt={item.name} />
              <div style={{ flex: 1 }}>
                <h4>{item.name}</h4>
                <p style={{ fontSize: "12px", color: "#666", margin: "2px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>Color: <strong>{item.color_name || "Default"}</strong></span>
                  <span>•</span>
                  <span>Size: <strong>{item.size_name || item.size || "Standard"}</strong></span>
                </p>
                <p style={{ fontWeight: "600", margin: "4px 0" }}>${Number(item.price * item.qty).toFixed(2)}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button onClick={() => update({ variantId: item.variant_id, productId: item.product_id, qty: Math.max(0, item.qty - 1), size: item.size })}>-</button>
                  <span style={{ fontWeight: "bold", minWidth: "20px", textAlign: "center" }}>{item.qty}</span>
                  <button 
                    onClick={() => update({ variantId: item.variant_id, productId: item.product_id, qty: item.qty + 1, size: item.size })}
                    disabled={item.available_stock !== undefined && item.qty >= item.available_stock}
                    style={{ opacity: (item.available_stock !== undefined && item.qty >= item.available_stock) ? 0.5 : 1 }}
                  >+</button>
                  {item.available_stock !== undefined && item.qty >= item.available_stock && (
                    <span style={{ fontSize: "11px", color: "#e53e3e" }}>Max stock</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart-footer">
        <h3>Total: ${Number(total).toFixed(2)}</h3>
        <button 
          className="checkout-btn" 
          onClick={handleCheckout}
          disabled={isLoading || items.length === 0}
          style={{ opacity: (isLoading || items.length === 0) ? 0.5 : 1 }}
        >
          {isLoading ? "Processing..." : "Checkout"}
        </button>
      </div>
    </div>
  );
}
