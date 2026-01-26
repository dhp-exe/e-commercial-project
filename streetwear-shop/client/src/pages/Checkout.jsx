import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCart } from "../context/CartContext";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm() {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { refresh } = useCart();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setIsLoading(true);

        // Confirm Payment with Stripe
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin + "/account",
            },
            redirect: "if_required", // Important: Prevents redirecting if not needed
        });

        if (error) {
            setMessage(error.message);
            setIsLoading(false);
        } 
        else if (paymentIntent && paymentIntent.status === "succeeded") {
            // Payment succeed -> create the order in MySQL
            try {
                await api.post("/orders"); 
                await refresh(); 
                navigate("/account"); 
                alert("Payment Successful! Order placed.");
            } 
            catch (err) {
                console.error(err);
                alert("Payment succeeded, but order creation failed. Contact support.");
            }
        } 
        else {
            setMessage("Something went wrong.");
            setIsLoading(false);
        }
    };
    return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "500px", margin: "0 auto" }}>
      <PaymentElement />
      <button 
        disabled={isLoading || !stripe || !elements} 
        id="submit"
        style={{
            marginTop: "20px", width: "100%", padding: "12px", 
            background: "#000", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer"
        }}
      >
        {isLoading ? "Processing..." : "Pay Now"}
      </button>
      {message && <div style={{ color: "red", marginTop: "10px" }}>{message}</div>}
    </form>
  );
}

export default function Checkout() {
    const [clientSecret, setClientSecret] = useState("");

    useEffect(() => {
        // Fetch the PaymentIntent when page loads
        api.post("/orders/create-payment")
        .then((res) => setClientSecret(res.data.clientSecret))
        .catch((err) => console.error("Error initiating payment:", err));
    }, []);

  return (
    <div className="container" style={{ padding: "40px 0" }}>
        <h1 style={{ textAlign: "center", marginBottom: "40px" }}>Secure Checkout</h1>
        {clientSecret ? (
            <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
            <CheckoutForm />
            </Elements>
        ) : (
            <p style={{ textAlign: "center" }}>Loading payment details...</p>
        )}
    </div>
  );
}
