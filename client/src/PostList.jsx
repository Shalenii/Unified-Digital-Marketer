import React, { useEffect, useState } from 'react';
import CalendarView from './components/CalendarView';
import PostOptionsDropdown from './components/PostOptionsDropdown';
import RescheduleModal from './components/RescheduleModal';

// START: App Configuration
// In production (Vercel), we use relative paths. Locally, use localhost:3001.
const isProd = import.meta.env.PROD;
const API_BASE_URL = isProd ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

const safeJSONParse = (input, fallback = []) => {
    if (!input) return fallback;
    if (typeof input !== 'string') return input;
    try {
        const parsed = JSON.parse(input);
        // If it's still a string (double encoded), try one more parse
        if (typeof parsed === 'string') return JSON.parse(parsed);
        return parsed;
    } catch (e) {
        console.warn('[PostList] JSON Parse failed:', e.message, 'Input:', input);
        return fallback;
    }
};

const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path; // Already a URL
    return `${API_BASE_URL}/uploads/${path}`;
};
// END: App Configuration

function PostList({ refreshTrigger }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [reschedulePost, setReschedulePost] = useState(null);

    const fetchPosts = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        try {
            const response = await fetch(`/api/posts?t=${Date.now()}`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const data = await response.json();

            if (data && Array.isArray(data.posts)) {
                setPosts(data.posts);
                setError(null);
            } else {
                console.error('Invalid data format from API:', data);
                if (isInitial) setPosts([]);
            }
        } catch (error) {
            console.error('Failed to fetch posts:', error);
            setError(error.message);
        } finally {
            if (isInitial) setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts(true);
        // Poll every 10 seconds to check for status updates
        const interval = setInterval(() => fetchPosts(false), 10000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const formatDate = (isoString) => {
        return new Date(isoString).toLocaleString();
    };

    const handleAction = async (id, action) => {
        if (action === 'delete') {
            if (!window.confirm('Are you sure you want to delete this post?')) return;
            try {
                const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to delete'); }
        } else if (action === 'pause' || action === 'resume') {
            const newStatus = action === 'pause' ? 'Paused' : 'Pending';
            try {
                const res = await fetch(`/api/posts/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to update status'); }
        } else if (action === 'stop_recurrence') {
            if (!window.confirm('This will stop future recurring posts for this schedule. The current post will still publish once. Continue?')) return;
            try {
                const res = await fetch(`/api/posts/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_recurring: 0 })
                });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to stop recurrence'); }
        } else if (action === 'reschedule') {
            const post = posts.find(p => p.id === id);
            setReschedulePost(post);
        }
    };

    return (
        <div className="section-card" style={{ width: '100%', marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Scheduled / Past Posts</h3>

                <div className="tabs" style={{ marginBottom: 0 }}>
                    <button
                        className={viewMode === 'list' ? 'active' : ''}
                        onClick={() => setViewMode('list')}
                    >
                        List
                    </button>
                    <button
                        className={viewMode === 'calendar' ? 'active' : ''}
                        onClick={() => setViewMode('calendar')}
                    >
                        Calendar
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="spinner"></div>
                    <p>Loading your history...</p>
                </div>
            ) : error ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#ff4d4d', background: 'rgba(255,77,77,0.1)', borderRadius: '8px' }}>
                    <p>⚠️ Error: {error}</p>
                    <button onClick={() => fetchPosts(true)} className="nav-btn" style={{ marginTop: '1rem' }}>Retry</button>
                </div>
            ) : viewMode === 'calendar' ? (
                <CalendarView posts={posts} />
            ) : (
                <div className="post-list">
                    {(!posts || posts.length === 0) && <p style={{ color: 'var(--text-muted)' }}>No posts found.</p>}
                    {(posts || []).map(post => (
                        <div key={post?.id} className="post-item">
                            {post?.image_path ? (
                                <img
                                    src={getImageUrl(post.image_path)}
                                    alt="Post" className="post-thumb"
                                    onError={(e) => {
                                        e.target.style.display = 'none'; // Hide if broken
                                    }}
                                />
                            ) : (
                                <div className="post-thumb" style={{ background: '#333' }} />
                            )}

                            <div className="post-info">
                                <div className="post-meta">
                                    <span>{post?.scheduled_time ? new Date(post.scheduled_time).toLocaleString() : 'No time set'}</span>
                                    {post?.is_recurring === true && (
                                        <span className="recurrence-badge">
                                            🔄 {post.recurrence_frequency?.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="post-caption">{post?.caption ? post.caption.split('\n')[0] : 'No caption'}</div>
                                <div className="post-meta">
                                    <span>To: {safeJSONParse(post?.platforms).join(', ')}</span>
                                </div>
                            </div>

                            <div className="post-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span className={`status-badge status-${post?.status || 'Unknown'}`}>{post?.status || 'Unknown'}</span>
                                <PostOptionsDropdown post={post} onAction={handleAction} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {reschedulePost && (
                <RescheduleModal
                    post={reschedulePost}
                    onClose={() => setReschedulePost(null)}
                    onSuccess={() => fetchPosts(false)}
                />
            )}
        </div>
    );
}

export default PostList;

