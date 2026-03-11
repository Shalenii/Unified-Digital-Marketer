import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';

const Settings = () => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [message, setMessage] = useState(null);

    // WhatsApp State
    const [whatsappStatus, setWhatsappStatus] = useState('INITIALIZING');
    const [whatsappQr, setWhatsappQr] = useState(null);

    // WhatsApp Groups State (manual config)
    const [savedGroups, setSavedGroups] = useState([]);
    const [savingGroups, setSavingGroups] = useState(false);
    const [groupMessage, setGroupMessage] = useState(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupId, setNewGroupId] = useState('');

    // Group definitions for UI
    const groups = {
        'Twitter': ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
        'Official Meta (FB/IG) API': ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID', 'INSTAGRAM_ACCOUNT_ID'],
        'Telegram': ['TELEGRAM_BOT_TOKEN'],
        'System / Bridge': ['PUBLIC_URL'],
        'WhatsApp Web (Groups)': []
    };

    useEffect(() => {
        fetchSettings();
        fetchSavedGroups();
    }, []);

    // Poll for WhatsApp QR Code — LOCAL server
    useEffect(() => {
        let interval;
        const fetchQr = async () => {
            try {
                const res = await fetch(`/api/whatsapp/qr`, { cache: 'no-store' });
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
            fetchQr();
            interval = setInterval(fetchQr, 5000);
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

    const fetchSavedGroups = async () => {
        try {
            const res = await fetch('/api/whatsapp/saved-groups');
            if (res.ok) {
                const data = await res.json();
                setSavedGroups(data.groups || []);
            }
        } catch (err) {
            console.error('Failed to fetch saved groups:', err);
        }
    };

    const handleAddGroup = () => {
        if (!newGroupName.trim() || !newGroupId.trim()) {
            setGroupMessage({ type: 'error', text: 'Both Group Name and Group ID are required.' });
            return;
        }
        // Auto-append @g.us if not present
        let finalId = newGroupId.trim();
        if (!finalId.endsWith('@g.us')) {
            finalId = finalId + '@g.us';
        }
        // Check for duplicates
        if (savedGroups.some(g => g.id === finalId)) {
            setGroupMessage({ type: 'error', text: 'This Group ID is already added.' });
            return;
        }
        setSavedGroups([...savedGroups, { id: finalId, name: newGroupName.trim() }]);
        setNewGroupName('');
        setNewGroupId('');
        setGroupMessage(null);
    };

    const handleRemoveGroup = (groupId) => {
        setSavedGroups(savedGroups.filter(g => g.id !== groupId));
    };

    const handleSaveGroups = async () => {
        setSavingGroups(true);
        setGroupMessage(null);
        try {
            const res = await fetch('/api/whatsapp/saved-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groups: savedGroups })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            setGroupMessage({ type: 'success', text: `✅ Saved ${savedGroups.length} group(s) successfully!` });
            setTimeout(() => setGroupMessage(null), 4000);
        } catch (err) {
            setGroupMessage({ type: 'error', text: err.message });
        } finally {
            setSavingGroups(false);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        if (!window.confirm("Are you sure you want to disconnect WhatsApp? You will need to scan the QR code again.")) return;
        try {
            const res = await fetch(`/api/whatsapp/disconnect`, { method: 'POST' });
            if (res.ok) {
                setWhatsappStatus('INITIALIZING');
                setWhatsappQr(null);
            } else {
                toast.error("Failed to disconnect");
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

                        {/* WhatsApp Web Section */}
                        {groupName === 'WhatsApp Web (Groups)' && (
                            <div className="whatsapp-auth-section" style={{
                                marginTop: '1.5rem', padding: '2rem', borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)'
                            }}>
                                {/* Connection Status */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                    <span style={{
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        background: whatsappStatus === 'AUTHENTICATED' ? '#22c55e'
                                            : whatsappStatus === 'QR_READY' ? '#f59e0b'
                                                : whatsappStatus === 'FAILED' ? '#ef4444' : '#6b7280',
                                        display: 'inline-block',
                                        boxShadow: whatsappStatus === 'AUTHENTICATED' ? '0 0 8px #22c55e' : 'none'
                                    }} />
                                    <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                        {whatsappStatus === 'AUTHENTICATED' ? '✅ WhatsApp Connected'
                                            : whatsappStatus === 'QR_READY' ? '📷 Scan QR Code to Connect'
                                                : whatsappStatus === 'FAILED' ? '❌ Connection Failed'
                                                    : '⏳ Initializing WhatsApp...'}
                                    </span>
                                </div>

                                {/* QR Code Display */}
                                {whatsappStatus === 'QR_READY' && whatsappQr && (
                                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{
                                            background: 'white', padding: '20px', borderRadius: '16px',
                                            display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                                        }}>
                                            <QRCodeSVG value={whatsappQr} size={220} />
                                        </div>
                                        <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.9rem' }}>
                                            Open WhatsApp → Linked Devices → Link a Device → Scan this code
                                        </p>
                                    </div>
                                )}

                                {whatsappStatus === 'INITIALIZING' && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                                        <p>Starting WhatsApp client... This may take 30-60 seconds.</p>
                                    </div>
                                )}

                                {whatsappStatus === 'FAILED' && (
                                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--error)', marginBottom: '1rem' }}>
                                        <p>WhatsApp failed to initialize. Check that Google Chrome is installed and restart the server.</p>
                                    </div>
                                )}

                                {/* Disconnect Button (shown when authenticated) */}
                                {whatsappStatus === 'AUTHENTICATED' && (
                                    <button
                                        type="button"
                                        onClick={handleDisconnectWhatsApp}
                                        style={{
                                            padding: '0.6rem 1.2rem', borderRadius: '10px',
                                            background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                                            border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'pointer',
                                            fontWeight: 600, fontSize: '0.85rem', marginBottom: '1.5rem',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        🔌 Disconnect WhatsApp
                                    </button>
                                )}

                                {/* ===== Manual Group Configuration ===== */}
                                <div style={{
                                    borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', marginTop: '0.5rem'
                                }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
                                        📋 Configure WhatsApp Groups
                                    </h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.2rem', lineHeight: 1.5 }}>
                                        Add group IDs manually. To find a Group ID: open WhatsApp Web → open the group → 
                                        check the URL or group info. The ID looks like <code style={{ 
                                            background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.82rem'
                                        }}>120363XXXXXXXXX@g.us</code>
                                    </p>

                                    {/* Add New Group Form */}
                                    <div style={{
                                        display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap'
                                    }}>
                                        <input
                                            type="text"
                                            placeholder="Group Name (e.g. Marketing Team)"
                                            value={newGroupName}
                                            onChange={e => setNewGroupName(e.target.value)}
                                            style={{
                                                flex: '1 1 180px', padding: '0.8rem 1rem', borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                color: 'white', fontSize: '0.95rem', outline: 'none'
                                            }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Group ID (e.g. 120363XXXXXXXXX@g.us)"
                                            value={newGroupId}
                                            onChange={e => setNewGroupId(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                                            style={{
                                                flex: '2 1 250px', padding: '0.8rem 1rem', borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                color: 'white', fontSize: '0.95rem', outline: 'none',
                                                fontFamily: 'monospace'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddGroup}
                                            style={{
                                                padding: '0.8rem 1.5rem', borderRadius: '10px',
                                                background: 'var(--primary)', color: 'white', border: 'none',
                                                cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                                                whiteSpace: 'nowrap', transition: 'opacity 0.2s'
                                            }}
                                        >
                                            ➕ Add
                                        </button>
                                    </div>

                                    {/* Group Message */}
                                    {groupMessage && (
                                        <div style={{
                                            padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '1rem',
                                            background: groupMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                            color: groupMessage.type === 'success' ? '#22c55e' : '#ef4444',
                                            border: `1px solid ${groupMessage.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                            fontSize: '0.9rem'
                                        }}>
                                            {groupMessage.text}
                                        </div>
                                    )}

                                    {/* Saved Groups List */}
                                    {savedGroups.length > 0 && (
                                        <div style={{
                                            background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.07)', marginBottom: '1rem',
                                            overflow: 'hidden'
                                        }}>
                                            {savedGroups.map((grp, idx) => (
                                                <div key={grp.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '12px 16px',
                                                    borderBottom: idx < savedGroups.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                                                }}>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px' }}>
                                                            {grp.name}
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.8rem', color: 'var(--text-muted)',
                                                            fontFamily: 'monospace', overflow: 'hidden',
                                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }}>
                                                            {grp.id}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveGroup(grp.id)}
                                                        title="Remove group"
                                                        style={{
                                                            background: 'none', border: 'none', color: '#ef4444',
                                                            cursor: 'pointer', fontSize: '1.4rem', padding: '0 8px',
                                                            flexShrink: 0, transition: 'opacity 0.2s'
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {savedGroups.length === 0 && (
                                        <div style={{
                                            textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)',
                                            background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                                            border: '1px dashed rgba(255,255,255,0.08)', marginBottom: '1rem',
                                            fontSize: '0.9rem'
                                        }}>
                                            No groups configured yet. Add a group above to get started.
                                        </div>
                                    )}

                                    {/* Save All Groups Button */}
                                    <button
                                        type="button"
                                        onClick={handleSaveGroups}
                                        disabled={savingGroups}
                                        style={{
                                            padding: '0.8rem 1.5rem', borderRadius: '12px',
                                            background: '#22c55e', color: 'white', border: 'none',
                                            cursor: 'pointer', fontWeight: 600, fontSize: '1rem',
                                            width: '100%', transition: 'opacity 0.2s',
                                            opacity: savingGroups ? 0.6 : 1
                                        }}
                                    >
                                        {savingGroups ? '⏳ Saving...' : `💾 Save ${savedGroups.length} Group(s) to Config`}
                                    </button>
                                </div>
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
