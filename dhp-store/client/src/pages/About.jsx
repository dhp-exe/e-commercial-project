import React from "react"; // Removed useEffect
import { Helmet } from 'react-helmet-async';
import "./About.css";
import aboutImage from "../assets/about-image.jpeg";
import quoteImage from "../assets/about2.jpg";

export default function About() {
    return (
        <div className="about-page">
            <Helmet>
                <title>About Us | DHP Streetwear</title>
                <meta name="description" content="Learn about DHP Streetwear — driven by passion, inspired by culture, designed for everyone." />
                <meta property="og:title" content="About Us — DHP Streetwear" />
                <meta property="og:description" content="Driven by passion. Inspired by culture. Designed for everyone." />
            </Helmet>
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
        </div>
    );
}