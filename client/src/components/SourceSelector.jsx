import React, { useState, useEffect } from 'react';

const SourceSelector = ({ mode, setMode, onImageSelect }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (mode === 'Auto') {
            fetchImages();
        }
    }, [mode, selectedDate]);

    const fetchImages = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/source-images?date=${selectedDate}`);
            const data = await res.json();
            setImages(data.images || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="section-card">
            <h3>1. Source Selection</h3>
            <div className="tabs">
                <button
                    className={mode === 'Auto' ? 'active' : ''}
                    onClick={() => setMode('Auto')}
                    type="button"
                >
                    Auto Mode
                </button>
                <button
                    className={mode === 'Manual' ? 'active' : ''}
                    onClick={() => setMode('Manual')}
                    type="button"
                >
                    Manual Upload
                </button>
            </div>

            {mode === 'Auto' ? (
                <div className="auto-source-panel">
                    <label>Select Date:</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />

                    <div className="image-grid">
                        {loading && <p>Loading...</p>}
                        {!loading && images.length === 0 && <p className="no-data">No images found for this date at <code>server/source_content/{selectedDate}</code></p>}
                        {images.map(img => (
                            <div key={img} className="image-item" onClick={() => onImageSelect(`${selectedDate}/${img}`, `/source_content/${selectedDate}/${img}`)}>
                                <img src={`/source_content/${selectedDate}/${img}`} alt={img} />
                                <span>{img}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div 
                    className="manual-upload-panel" 
                    onClick={() => document.getElementById('hidden-file-input').click()}
                >
                    <input
                        id="hidden-file-input"
                        type="file"
                        accept="image/png, image/jpeg"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                onImageSelect(e.target.files[0], URL.createObjectURL(e.target.files[0]));
                            }
                        }}
                    />
                    <div className="upload-icon-wrapper">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)", marginBottom: "12px" }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                    </div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", color: "var(--text-main)" }}>Click to Upload Media</h4>
                    <p className="hint">Drag and drop or browse (JPG, PNG)</p>
                </div>
            )}
        </div>
    );
};

export default SourceSelector;
