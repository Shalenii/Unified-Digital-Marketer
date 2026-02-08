import React, { useState, useRef, useEffect } from 'react';

const PostOptionsDropdown = ({ post, onAction }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    const handleAction = (action) => {
        setIsOpen(false);
        onAction(post.id, action);
    };

    return (
        <div className="options-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                className="icon-btn"
                onClick={() => setIsOpen(!isOpen)}
                style={{ width: '32px', height: '32px', border: 'none', background: 'transparent' }}
            >
                ⋮
            </button>

            {isOpen && (
                <div className="options-menu">
                    {/* Status Actions */}
                    {(post.status === 'Pending' || post.status === 'Paused') && (
                        <div className="menu-item" onClick={() => handleAction(post.status === 'Paused' ? 'resume' : 'pause')}>
                            {post.status === 'Paused' ? '▶️ Resume' : '⏸️ Pause'}
                        </div>
                    )}

                    {/* Recurrence Actions */}
                    {post.is_recurring === 1 && (post.status === 'Pending' || post.status === 'Paused') && (
                        <div className="menu-item" onClick={() => handleAction('stop_recurrence')}>
                            🛑 Stop Recurrence
                        </div>
                    )}

                    {/* Reschedule (Pending, Paused, or Published) */}
                    {/* Reschedule (Pending, Paused, or Published) */}
                    {(post.status === 'Pending' || post.status === 'Paused' || post.status === 'Published') && (
                        <div className="menu-item" onClick={() => handleAction('reschedule')}>
                            📅 Reschedule
                        </div>
                    )}

                    {/* Delete Action (Always available) */}
                    <div className="menu-item delete" onClick={() => handleAction('delete')}>
                        🗑️ Delete
                    </div>
                </div>
            )}
        </div>
    );
};

export default PostOptionsDropdown;
