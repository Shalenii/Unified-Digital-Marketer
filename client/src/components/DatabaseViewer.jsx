import React, { useEffect, useState } from 'react';

function DatabaseViewer() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3001/api/posts')
            .then(res => res.json())
            .then(data => {
                setPosts(data.posts);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Loading Database...</div>;

    return (
        <div className="section-card" style={{ width: '100%', overflowX: 'auto' }}>
            <h2 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Raw Database Viewer (posts)</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.8)', textAlign: 'left' }}>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Scheduled Time</th>
                        <th style={thStyle}>Platforms</th>
                        <th style={thStyle}>Image Path</th>
                        <th style={thStyle}>Caption</th>
                        <th style={thStyle}>Type</th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map(post => (
                        <tr key={post.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={tdStyle}>{post.id}</td>
                            <td style={tdStyle}>
                                <span className={`status-badge status-${post.status}`}>{post.status}</span>
                            </td>
                            <td style={tdStyle}>{new Date(post.scheduled_time).toLocaleString()}</td>
                            <td style={tdStyle}>{post.platforms ? JSON.parse(post.platforms).join(', ') : '-'}</td>
                            <td style={tdStyle}>
                                <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={post.image_path}>
                                    {post.image_path}
                                </div>
                            </td>
                            <td style={tdStyle}>
                                <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={post.caption}>
                                    {post.caption}
                                </div>
                            </td>
                            <td style={tdStyle}>{post.is_recurring ? 'Recurring' : 'One-time'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const thStyle = {
    padding: '1rem',
    borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap'
};

const tdStyle = {
    padding: '0.75rem 1rem',
    verticalAlign: 'middle'
};

export default DatabaseViewer;
