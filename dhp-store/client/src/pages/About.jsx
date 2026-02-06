import React from "react"; // Removed useEffect
import "./About.css";
import aboutImage from "../assets/about-image.jpeg";
import quoteImage from "../assets/about2.jpg";

export default function About() {
    // No more useEffect, no more event listeners!

    return (
        <div className="about-page">
            {/* Hero Section - Standard static header */}
            <section className="hero">
                <div className="hero-content">
                    <h1>About DHP</h1>
                    <p>Driven by passion. Inspired by culture. Designed for everyone.</p>
                </div>
            </section>
            
            {/* Image Section */}
            <section className="image-section">
                <img src={aboutImage} alt="About us" />
            </section>

            {/* Quote Section */}
            <section className="quote-section">
                <img src={quoteImage} alt="Quote" />
                <blockquote>
                    "Fashion is the armor to survive the reality of everyday life."
                    <br />- Bill Cunningham
                </blockquote>
            </section>

            {/* Mission Section */}
            <section className="mission">
                <h2>Our Mission</h2>
                <p>
                    We believe in self-expression through fashion. Streetwear Shop aims to
                    empower individuals with high-quality, trend-setting apparel that
                    merges comfort, creativity, and community.
                </p>
            </section>

            {/* Values Section */}
            <section className="values">
                <h2>Our Values</h2>
                <div className="values-grid">
                    <div>
                        <h3>Innovation</h3>
                        <p>We constantly evolve our designs to reflect modern street culture.</p>
                    </div>
                    <div>
                        <h3>Sustainability</h3>
                        <p>We're committed to ethical production and eco-conscious materials.</p>
                    </div>
                    <div>
                        <h3>Community</h3>
                        <p>We celebrate individuality and inclusivity in everything we create.</p>
                    </div>
                </div>
            </section>

            <section className="footer">
                <p>© 2025 Streetwear Shop. All rights reserved.</p>
            </section>
        </div>
    );
}