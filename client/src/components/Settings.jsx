import React, { useState, useEffect } from 'react';

const Settings = () => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // Key being saved
    const [message, setMessage] = useState(null);

    // Group definitions for UI
    const groups = {
        'Twitter': ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
        'Facebook & Instagram': ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID'],
        'Telegram': ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
        'WhatsApp': ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TO_PHONE']
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/settings');
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

    const handleSave = async (key, value) => {
        setSaving(key);
        setMessage(null);
        try {
            const res = await fetch('http://localhost:3001/api/settings', {
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
                                        type="password"
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
