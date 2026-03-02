import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const Settings = () => {
    // WhatsApp API base: use PUBLIC_URL from settings (Railway URL), fallback to VITE_API_URL or same-origin
    // This is set AFTER settings load, so WhatsApp polling re-checks when settings are available
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // Key being saved
    const [message, setMessage] = useState(null);
    const [whatsappStatus, setWhatsappStatus] = useState('INITIALIZING');
    const [whatsappQr, setWhatsappQr] = useState(null);
    const [whatsappFetchError, setWhatsappFetchError] = useState(null);

    // Pairing Code State
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState(null);
    const [requestingPairing, setRequestingPairing] = useState(false);
    const [pairingError, setPairingError] = useState(null);

    // Group definitions for UI
    const groups = {
        'Twitter': ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
        'Official Meta (FB/IG) API': ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID', 'INSTAGRAM_ACCOUNT_ID'],
        'Telegram': ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
        'System / Bridge': ['PUBLIC_URL'],
        'WhatsApp Web (Groups)': []
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    // Poll for WhatsApp QR Code — call Railway directly
    useEffect(() => {
        // Use settings.PUBLIC_URL if available, otherwise use hardcoded Railway URL
        const RAILWAY_URL = settings.PUBLIC_URL || 'https://unified-digital-marketer-production.up.railway.app';
        console.log(`[WhatsApp] Polling Railway at: ${RAILWAY_URL}`);

        let interval;
        const fetchQr = async () => {
            try {
                const res = await fetch(`${RAILWAY_URL}/api/whatsapp/qr`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setWhatsappStatus(data.status);
                    setWhatsappQr(data.qrCode);
                    setWhatsappFetchError(null);

                    if (data.status === 'AUTHENTICATED') {
                        clearInterval(interval);
                    }
                } else {
                    const errorJson = await res.json().catch(() => ({}));
                    setWhatsappFetchError(`Railway Error (${res.status}): ${errorJson.error || 'Unknown'}`);
                }
            } catch (error) {
                console.error('Failed to fetch WhatsApp QR:', error);
                setWhatsappFetchError(`Connection Failed: ${error.message} (Is Railway Online?)`);
            }
        };

        if (whatsappStatus !== 'AUTHENTICATED') {
            fetchQr();
            interval = setInterval(fetchQr, 5000);
        }

        return () => clearInterval(interval);
    }, [settings.PUBLIC_URL, whatsappStatus]);

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
            const RAILWAY_URL = settings.PUBLIC_URL || import.meta.env.VITE_API_URL || '';
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
            const RAILWAY_URL = settings.PUBLIC_URL || import.meta.env.VITE_API_URL || '';
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
                            <div className="whatsapp-auth-section" style={{ marginTop: '1.5rem', padding: '0', borderRadius: '8px', border: '1px solid #ddd', overflow: 'hidden' }}>
                                <iframe
                                    src={(settings.PUBLIC_URL || 'https://unified-digital-marketer-production.up.railway.app') + '/whatsapp-connect'}
                                    style={{ width: '100%', height: '480px', border: 'none' }}
                                    title="WhatsApp Connection"
                                />
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
