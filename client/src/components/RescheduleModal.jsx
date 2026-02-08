import React, { useState } from 'react';

const RescheduleModal = ({ post, onClose, onSuccess }) => {
    const [newTime, setNewTime] = useState(post.scheduled_time ? post.scheduled_time.slice(0, 16) : '');
    const [isRecurring, setIsRecurring] = useState(!!post.is_recurring);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!newTime) return alert('Please select a time');
        setLoading(true);

        try {
            // Prepare update payload
            const updates = {
                scheduled_time: newTime,
                is_recurring: isRecurring ? 1 : 0
            };

            // If it was Published/Failed, we must reset status to Pending to "move" it
            if (post.status === 'Published' || post.status === 'Failed') {
                updates.status = 'Pending';
            }

            const res = await fetch(`http://localhost:3001/api/posts/${post.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (res.ok) {
                onSuccess();
                onClose();
                alert('Post updated successfully!');
            } else {
                const err = await res.json(); // Safely try to parse JSON, or fallback? server usually sends JSON
                alert('Failed to update');
            }
        } catch (error) {
            console.error(error);
            alert('Error updating post');
        } finally {
            setLoading(false);
        }
    };

    const titleText = (post.status === 'Published' || post.status === 'Failed')
        ? '♻️ Edit & Restart Series'
        : '📅 Reschedule Post';

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={modalStyle}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>{titleText}</h3>
                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                    Original: {new Date(post.scheduled_time).toLocaleString()}
                </p>

                <label style={{ display: 'block', marginBottom: '0.5rem' }}>New Date & Time:</label>
                <input
                    type="datetime-local"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    style={{ width: '100%', marginBottom: '1.5rem', padding: '0.75rem' }}
                />

                {post.is_recurring === 1 && (
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                        <input
                            type="checkbox"
                            id="recurCheck"
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                            style={{ width: 'auto', margin: 0 }}
                        />
                        <label htmlFor="recurCheck" style={{ margin: 0, cursor: 'pointer', fontSize: '0.9rem' }}>
                            Keep Recurring ({post.recurrence_frequency})?
                        </label>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleSave} style={saveBtnStyle} disabled={loading}>
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(5px)'
};

const modalStyle = {
    background: 'var(--bg-color)',
    padding: '2rem',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
};

const saveBtnStyle = {
    background: 'var(--primary)',
    color: 'white',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600
};

const cancelBtnStyle = {
    background: 'transparent',
    color: 'var(--text-muted)',
    padding: '0.75rem 1.5rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer'
};

export default RescheduleModal;
