import React, { useEffect, useState } from 'react';
import CalendarView from './components/CalendarView';
import PostOptionsDropdown from './components/PostOptionsDropdown';
import RescheduleModal from './components/RescheduleModal';

// START: Supabase Configuration
// Ideally this comes from import.meta.env.VITE_SUPABASE_URL but we can hardcode for the "no functionality change" constraint quick fix
// or just use the API to get the signed URL if needed. But for public bucket, it's easy.
const SUPABASE_PROJECT_URL = 'https://powpkqqtxxczxghyhgii.supabase.co';
const STORAGE_BUCKET = 'posts';
const API_BASE_URL = 'http://localhost:3001'; // Default local, Vercel will be relative

const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path; // Already a URL
    return `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
};
// END: Supabase Configuration

function PostList({ refreshTrigger }) {
    const [posts, setPosts] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [reschedulePost, setReschedulePost] = useState(null);

    const fetchPosts = async () => {
        try {
            // Use relative URL for Vercel, but localhost for dev if not proxied
            // Vite proxy isn't set up, so we stick to localhost for local dev for now
            // For Vercel, we'll need to change this.
            // Let's use a smart base.
            const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
            const response = await fetch(`${baseUrl}/api/posts`);
            const data = await response.json();
            setPosts(data.posts);
        } catch (error) {
            console.error('Failed to fetch posts:', error);
        }
    };

    useEffect(() => {
        fetchPosts();
        // Poll every 10 seconds to check for status updates
        const interval = setInterval(fetchPosts, 10000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const formatDate = (isoString) => {
        return new Date(isoString).toLocaleString();
    };

    const handleAction = async (id, action) => {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

        if (action === 'delete') {
            if (!window.confirm('Are you sure you want to delete this post?')) return;
            try {
                const res = await fetch(`${baseUrl}/api/posts/${id}`, { method: 'DELETE' });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to delete'); }
        } else if (action === 'pause' || action === 'resume') {
            const newStatus = action === 'pause' ? 'Paused' : 'Pending';
            try {
                const res = await fetch(`${baseUrl}/api/posts/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to update status'); }
        } else if (action === 'stop_recurrence') {
            if (!window.confirm('This will stop future recurring posts for this schedule. The current post will still publish once. Continue?')) return;
            try {
                const res = await fetch(`${baseUrl}/api/posts/${id}`, {
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

            {viewMode === 'calendar' ? (
                <CalendarView posts={posts} />
            ) : (
                <div className="post-list">
                    {posts.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No posts found.</p>}
                    {posts.map(post => (
                        <div key={post.id} className="post-item">
                            {post.image_path ? (
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
                                    <span>{new Date(post.scheduled_time).toLocaleString()}</span>
                                    {post.is_recurring === true && (
                                        <span className="recurrence-badge">
                                            🔄 {post.recurrence_frequency?.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="post-caption">{post.caption.split('\n')[0]}</div>
                                <div className="post-meta">
                                    <span>To: {JSON.parse(post.platforms || '[]').join(', ')}</span>
                                </div>
                            </div>

                            <div className="post-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span className={`status-badge status-${post.status}`}>{post.status}</span>
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
                    onSuccess={fetchPosts}
                />
            )}
        </div>
    );
}

export default PostList;

