import React, { useState, useMemo } from 'react';
import './Contact.css';
// 1. Import the icons you need
import { FaMapMarkerAlt, FaClock, FaPhoneAlt, FaDirections } from 'react-icons/fa';

const SHOWROOMS = [
    {
        id: 1,
        name: 'DHP Store VINCOM CENTER DONG KHOI',
        city: 'Ho Chi Minh City',
        address: 'B1 Vincom Center Dong Khoi, 72 Le Thanh Ton, Ben Nghe Ward, District 1, Ho Chi Minh City',
        hours: 'Mon - Fri: 10:00 - 22:00; Sat, Sun & Holidays: 09:00 - 22:00',
        phone: '070 291 9822',
    },
    {
        id: 2,
        name: 'DHP Store Su Van Hanh',
        city: 'Ho Chi Minh City',
        address: ' 2nd Floor Van Hanh Mall, 11 Su Van Hanh Street, Ward 12, District 10, Ho Chi Minh City',
        hours: 'Mon - Fri: 10:00 - 21:00',
        phone: '091 3911 1000',
    },
    {
        id: 3,
        name: 'DHP Store BINH TAN',
        city: 'Ho Chi Minh City',
        address: '1st Floor Aeon Mall Binh Tan, No. 1 Street 17A, An Lac Ward, Binh Tan District, Ho Chi Minh City',
        hours: 'Mon - Fri: 10:00 - 22:00; Sat, Sun & Holidays: 09:00 - 22:00',
        phone: '078 585 2286',
    },
    {
        id: 4,
        name: 'DHP Store Vincom Mega Mall Times City',
        city: 'Hanoi',
        address: '1st Floor Vincom Mega Mall Times City, 458 Minh Khai ward, Times City Urban Area, Hai Ba Trung District, Hanoi',
        hours: 'Mon - Fri: 10:00 - 21:00',
        phone: '090 9819 0000',
    },
    {
        id: 5,
        name: 'DHP Store HA DONG',
        city: 'Hanoi',
        address: ' 2nd Floor, Aeon Mall Ha Dong Shopping Center, Hoang Van Thu Residential Area, Duong Noi Ward, Hanoi',
        hours: 'Mon - Fri: 10:00 - 21:00',
        phone: '090 9911 0000',
    },
];

export default function Contact() {
    const [selectedCity, setSelectedCity] = useState('Nationwide');
    const [selectedId, setSelectedId] = useState(SHOWROOMS[0].id);

    const cities = useMemo(() => {
        const s = new Set(SHOWROOMS.map((s) => s.city));
        return ['Nationwide', ...Array.from(s)];
    }, []);

    const filtered = useMemo(() => {
        if (selectedCity === 'Nationwide') return SHOWROOMS;
        return SHOWROOMS.filter((s) => s.city === selectedCity);
    }, [selectedCity]);

    const selected = SHOWROOMS.find((s) => s.id === selectedId) || filtered[0];

    // Using backticks correctly for the map URL
    const mapSrc = `https://www.google.com/maps?q=$?q=${encodeURIComponent(
        selected.address
    )}&output=embed`;

    // Inline style helper to align icons with text
    const iconStyle = { marginRight: '8px', color: '#333', verticalAlign: 'middle' };

    return (
        <div className="contact-page">
            <h2 className="contact-title">ALL SHOWROOMS INFORMATION</h2>
            <div className="contact-grid">
                <aside className="contact-left">
                    <label className="city-label">SELECT CITY</label>
                    <select
                        className="city-select"
                        value={selectedCity}
                        onChange={(e) => setSelectedCity(e.target.value)}
                    >
                        {cities.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>

                    <div className="showroom-list">
                        {filtered.map((s) => (
                            <div
                                key={s.id}
                                className={`showroom-item ${s.id === selectedId ? 'active' : ''}`}
                                onClick={() => setSelectedId(s.id)}
                            >
                                <h3 className="showroom-name">{s.name}</h3>
                                <p className="showroom-address">
                                    <FaMapMarkerAlt style={iconStyle} />
                                    {s.address}
                                </p>
                                <p className="showroom-hours">
                                    <FaClock style={iconStyle} />
                                    {s.hours}
                                </p>
                                <p className="showroom-phone">
                                    <FaPhoneAlt style={iconStyle} />
                                    {s.phone}
                                </p>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="contact-right">
                    <div className="map-frame">
                        <iframe
                            title="showroom-map"
                            src={mapSrc}
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            allowFullScreen=""
                            loading="lazy"
                        />
                    </div>

                    <div className="map-card">
                        <h3>{selected.name}</h3>
                        
                        {/* Added Icons to the main details card */}
                        <p style={{ display: 'flex', alignItems: 'center' }}>
                            <FaMapMarkerAlt style={{ ...iconStyle, flexShrink: 0 }} />
                            {selected.address}
                        </p>
                        <p style={{ display: 'flex', alignItems: 'center' }}>
                            <FaClock style={iconStyle} />
                            {selected.hours}
                        </p>
                        <p style={{ display: 'flex', alignItems: 'center' }}>
                            <FaPhoneAlt style={iconStyle} />
                            {selected.phone}
                        </p>
                        
                        <a
                            className="directions-link"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                selected.address
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', marginTop: '10px' }}
                        >
                            <FaDirections style={{ marginRight: '8px' }} />
                            Get directions
                        </a>
                    </div>
                </main>
            </div>
        </div>
    );
}