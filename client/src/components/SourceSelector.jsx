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
            const res = await fetch(`http://localhost:3001/api/source-images?date=${selectedDate}`);
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
                            <div key={img} className="image-item" onClick={() => onImageSelect(`${selectedDate}/${img}`, `http://localhost:3001/source_content/${selectedDate}/${img}`)}>
                                <img src={`http://localhost:3001/source_content/${selectedDate}/${img}`} alt={img} />
                                <span>{img}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="manual-upload-panel">
                    <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={(e) => onImageSelect(e.target.files[0], URL.createObjectURL(e.target.files[0]))}
                    />
                    <p className="hint">Drag and drop or browse (JPG, PNG)</p>
                </div>
            )}
        </div>
    );
};

export default SourceSelector;
