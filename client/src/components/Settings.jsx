import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const Settings = () => {
    // WhatsApp lives on Railway (persistent server), all other API calls go to Vercel
    const RAILWAY_URL = import.meta.env.VITE_API_URL || '';
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // Key being saved
    const [message, setMessage] = useState(null);
    const [whatsappStatus, setWhatsappStatus] = useState('INITIALIZING');
    const [whatsappQr, setWhatsappQr] = useState(null);

    // Pairing Code State
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState(null);
    const [requestingPairing, setRequestingPairing] = useState(false);
    const [pairingError, setPairingError] = useState(null);

    // Group definitions for UI
    const groups = {
        'Twitter': ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
        'Official Meta (FB/IG) API': ['FACEBOOK_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID'],
        'Telegram': ['TELEGRAM_BOT_TOKEN'],
        'System / Bridge': ['PUBLIC_URL'],
        'WhatsApp Web (Groups)': []
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    // Poll for WhatsApp QR Code
    useEffect(() => {
        let interval;
        const fetchQr = async () => {
            try {
                const res = await fetch(`${RAILWAY_URL}/api/whatsapp/qr`);
                if (res.ok) {
                    const data = await res.json();
                    setWhatsappStatus(data.status);
                    setWhatsappQr(data.qrCode);

                    if (data.status === 'AUTHENTICATED') {
                        clearInterval(interval);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch WhatsApp QR:', error);
            }
        };

        if (whatsappStatus !== 'AUTHENTICATED') {
            fetchQr(); // Fetch immediately
            interval = setInterval(fetchQr, 5000); // Poll every 5s
        }

        return () => clearInterval(interval);
    }, [whatsappStatus]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            if (!res.ok) throw new Error('Failed to fetch settings');
            const data = await res.json();
            setSettings(data);
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Error loading settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleRequestPairing = async () => {
        if (!phoneNumber) {
            setPairingError('Please enter a phone number with country code (e.g., 14155552671)');
            return;
        }
        setRequestingPairing(true);
        setPairingError(null);
        setPairingCode(null);
        try {
            const res = await fetch(`${RAILWAY_URL}/api/whatsapp/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to request pairing code');

            setPairingCode(data.code);
        } catch (err) {
            console.error(err);
            setPairingError(err.message);
        } finally {
            setRequestingPairing(false);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        if (!window.confirm("Are you sure you want to disconnect WhatsApp? You will need to scan the QR code or link with your phone number again.")) return;

        try {
            const res = await fetch(`${RAILWAY_URL}/api/whatsapp/disconnect`, { method: 'POST' });
            if (res.ok) {
                setWhatsappStatus('INITIALIZING');
                setWhatsappQr(null);
                setPhoneNumber('');
                setPairingCode(null);
            } else {
                alert("Failed to disconnect");
            }
        } catch (err) {
            console.error('Failed to disconnect WhatsApp', err);
        }
    };

    const handleSave = async (key, value) => {
        setSaving(key);
        setMessage(null);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');

            setSettings(prev => ({ ...prev, [key]: value }));
            setMessage({ type: 'success', text: `Saved ${key}` });

            // Clear message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(null);
        }
    };

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (loading) return <div className="loading">Loading settings...</div>;

    return (
        <div className="settings-page">
            <h2>⚙️ Application Settings</h2>

            {message && (
                <div className={`message-banner ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="settings-grid">
                {Object.entries(groups).map(([groupName, keys]) => (
                    <div key={groupName} className="settings-group">
                        <h3>{groupName}</h3>
                        {keys.map(key => (
                            <div key={key} className="setting-item">
                                <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                                <div className="input-with-action">
                                    <input
                                        type={key.includes('TOKEN') || key.includes('SECRET') ? "password" : "text"}
                                        id={key}
                                        value={settings[key] || ''}
                                        onChange={(e) => handleChange(key, e.target.value)}
                                        placeholder={`Enter ${key}...`}
                                    />
                                    <button
                                        onClick={() => handleSave(key, settings[key])}
                                        disabled={saving === key}
                                        className="save-btn"
                                    >
                                        {saving === key ? '...' : '💾'}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {groupName === 'WhatsApp Web (Groups)' && (
                            <div className="whatsapp-auth-section" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #ddd' }}>
                                <h4 style={{ margin: '0 0 1rem 0', color: '#000' }}>WhatsApp Connection Status</h4>

                                {whatsappStatus === 'INITIALIZING' && (
                                    <div style={{ color: '#555' }}>⏳ Initializing WhatsApp Client. Please wait...</div>
                                )}

                                {whatsappStatus === 'QR_READY' && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
                                        {/* QR Code Section */}
                                        {whatsappQr && (
                                            <div style={{ flex: '1', minWidth: '250px', textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 1rem 0', color: '#333', fontWeight: 'bold' }}>Option 1: Scan this code with your phone</p>
                                                <div style={{ background: 'white', padding: '1rem', display: 'inline-block', borderRadius: '8px', border: '1px solid #eee' }}>
                                                    <QRCodeSVG value={whatsappQr} size={200} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Phone Number Pairing Section */}
                                        <div style={{ flex: '1', minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <p style={{ margin: '0', color: '#333', fontWeight: 'bold' }}>Option 2: Link with Phone Number</p>

                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Enter number (e.g. 14155552671)"
                                                    value={phoneNumber}
                                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc', color: '#000', background: '#fff' }}
                                                />
                                                <button
                                                    className="btn-primary"
                                                    onClick={handleRequestPairing}
                                                    disabled={requestingPairing}
                                                    style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', background: '#3b82f6', color: 'white', border: 'none' }}
                                                >
                                                    {requestingPairing ? '...' : 'Get Code'}
                                                </button>
                                            </div>

                                            {pairingError && <div style={{ color: 'red', fontSize: '0.85rem' }}>{pairingError}</div>}

                                            {pairingCode && (
                                                <div style={{ marginTop: '10px', padding: '15px', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', textAlign: 'center' }}>
                                                    <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem', color: '#555' }}>Your 8-Character Pairing Code:</p>
                                                    <h2 style={{ margin: '0', fontSize: '2rem', letterSpacing: '4px', color: '#000' }}>{pairingCode}</h2>
                                                    <p style={{ margin: '10px 0 0 0', fontSize: '0.8rem', color: '#333' }}>
                                                        Open WhatsApp &gt; Linked Devices &gt; Link with Phone Number. Type this code in within 15 seconds.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {whatsappStatus === 'AUTHENTICATED' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                        <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                                            <span style={{ fontSize: '1.2rem' }}>✅</span> Successfully Connected to WhatsApp!
                                        </div>
                                        <button
                                            onClick={handleDisconnectWhatsApp}
                                            style={{ padding: '8px 16px', background: 'var(--error)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                )}

                                {whatsappStatus === 'FAILED' && (
                                    <div style={{ color: 'var(--error)' }}>
                                        ❌ Authentication failed. Please restart the server.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Custom/Other Settings */}
                <div className="settings-group">
                    <h3>Other Settings</h3>
                    <div className="setting-item">
                        <label>Add New / Other Key</label>
                        <div className="input-with-action">
                            <input type="text" placeholder="Key Name" id="new-key" />
                            <input type="text" placeholder="Value" id="new-val" />
                            <button
                                className="save-btn"
                                onClick={() => {
                                    const k = document.getElementById('new-key').value;
                                    const v = document.getElementById('new-val').value;
                                    if (k && v) handleSave(k, v);
                                }}
                            >
                                ➕
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Settings;
