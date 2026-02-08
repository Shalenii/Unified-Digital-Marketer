import React from 'react';

const ContentComposer = ({ caption, setCaption, hashtags, setHashtags, internalNotes, setInternalNotes }) => {
    return (
        <div className="section-card">
            <h3>2. Content Composer</h3>

            <div className="form-group">
                <label>Caption</label>
                <textarea
                    rows="4"
                    placeholder="Write your main post body..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Hashtags (Auto-appended)</label>
                <input
                    type="text"
                    placeholder="#startup #launch #tech"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                />
            </div>

            <div className="form-group internal-notes">
                <label>Internal Notes (Not published)</label>
                <input
                    type="text"
                    placeholder="e.g. Campaign ID: 552, Approval by Marketing"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                />
            </div>
        </div>
    );
};

export default ContentComposer;
