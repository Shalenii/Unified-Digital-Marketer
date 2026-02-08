import React, { useEffect, useState } from 'react';
import CalendarView from './components/CalendarView';
import PostOptionsDropdown from './components/PostOptionsDropdown';
import RescheduleModal from './components/RescheduleModal';

function PostList({ refreshTrigger }) {
    const [posts, setPosts] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [reschedulePost, setReschedulePost] = useState(null);

    const fetchPosts = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/posts');
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
        if (action === 'delete') {
            if (!window.confirm('Are you sure you want to delete this post?')) return;
            try {
                const res = await fetch(`http://localhost:3001/api/posts/${id}`, { method: 'DELETE' });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to delete'); }
        } else if (action === 'pause' || action === 'resume') {
            const newStatus = action === 'pause' ? 'Paused' : 'Pending';
            try {
                const res = await fetch(`http://localhost:3001/api/posts/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (res.ok) fetchPosts();
            } catch (err) { alert('Failed to update status'); }
        } else if (action === 'stop_recurrence') {
            if (!window.confirm('This will stop future recurring posts for this schedule. The current post will still publish once. Continue?')) return;
            try {
                const res = await fetch(`http://localhost:3001/api/posts/${id}`, {
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
                                    src={post.image_path.includes('.') ? `http://localhost:3001/source_content/${post.image_path.split('/')[0]}/${post.image_path}` : `http://localhost:3001/uploads/${post.image_path}`}
                                    alt="Post" className="post-thumb"
                                    onError={(e) => {
                                        // Fallback for different path structures
                                        e.target.src = `http://localhost:3001/uploads/${post.image_path}`;
                                    }}
                                />
                            ) : (
                                <div className="post-thumb" style={{ background: '#333' }} />
                            )}

                            <div className="post-info">
                                <div className="post-meta">
                                    <span>{new Date(post.scheduled_time).toLocaleString()}</span>
                                    {post.is_recurring === 1 && (
                                        <span className="recurrence-badge">
                                            🔄 {post.recurrence_frequency.toUpperCase()}
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
