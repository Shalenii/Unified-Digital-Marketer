import React, { useState } from 'react';
import SourceSelector from './components/SourceSelector';
import ContentComposer from './components/ContentComposer';
import Scheduler from './components/Scheduler';
import PlatformManager from './components/PlatformManager';

function PostForm({ onPostCreated }) {
    // 1. Source
    const [sourceMode, setSourceMode] = useState('Manual'); // 'Auto' | 'Manual'
    const [selectedImage, setSelectedImage] = useState(null); // File object or Filename string
    const [previewUrl, setPreviewUrl] = useState(null);

    // 2. Content
    const [caption, setCaption] = useState('');
    const [hashtags, setHashtags] = useState('');
    const [internalNotes, setInternalNotes] = useState('');

    // 3. Scheduler
    const [scheduleType, setScheduleType] = useState('Now'); // 'Now' | 'Later'
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceFreq, setRecurrenceFreq] = useState('Daily');
    const [recurrenceEnd, setRecurrenceEnd] = useState('');

    // 4. Platforms
    const [selectedPlatforms, setSelectedPlatforms] = useState([]);
    const [platformSettings, setPlatformSettings] = useState({});

    const [loading, setLoading] = useState(false);

    const handleImageSelect = (imgData, url) => {
        setSelectedImage(imgData);
        setPreviewUrl(url);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!selectedImage) { return alert('Please select an image.'); }
        if (selectedPlatforms.length === 0) { return alert('Please select at least one platform.'); }

        let finalScheduledTime;
        if (scheduleType === 'Now') {
            finalScheduledTime = new Date();
            // No delay for immediate publishing
        } else {
            if (!date || !time) { return alert('Please set date and time.'); }
            finalScheduledTime = new Date(`${date}T${time}`);
        }

        setLoading(true);
        const formData = new FormData();

        // Handle Image: If Manual, it's a File. If Auto, it's a string path/filename.
        if (sourceMode === 'Manual' && selectedImage instanceof File) {
            formData.append('image', selectedImage);
        } else {
            // For Auto mode, we pass the filename as a text field or we depend on backend to find it.
            // Our backend currently expects 'image' file or 'image_path' string.
            formData.append('image_path', selectedImage);
        }

        // Combine caption + hashtags
        const fullCaption = `${caption}\n\n${hashtags}`;

        formData.append('caption', fullCaption);
        formData.append('hashtags', hashtags);
        formData.append('internal_notes', internalNotes);
        formData.append('platforms', JSON.stringify(selectedPlatforms));
        formData.append('platform_settings', JSON.stringify(platformSettings));
        formData.append('scheduled_time', finalScheduledTime.toISOString());
        formData.append('is_recurring', isRecurring);
        formData.append('recurrence_frequency', recurrenceFreq);
        formData.append('recurrence_end_date', recurrenceEnd);
        formData.append('source_mode', sourceMode);
        formData.append('is_immediate', scheduleType === 'Now');

        try {
            // Use relative URL for Vercel, but localhost for dev if not proxied
            const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
            const res = await fetch(`${baseUrl}/api/posts`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                alert(`Success! Post ${scheduleType === 'Now' ? 'queued' : 'scheduled'}.`);
                // Reset form optionally
                setCaption('');
                setHashtags('');
                setInternalNotes('');
                if (onPostCreated) onPostCreated();
            } else {
                const err = await res.json();
                alert('Failed: ' + err.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error submitting form');
        } finally {
            setLoading(false);
        }
    };

    return (

        <form onSubmit={handleSubmit} className="dashboard-grid">
            {/* Row 1: Source & Composer */}
            <div className="row-top">
                <div className="col-source">
                    <SourceSelector
                        mode={sourceMode}
                        setMode={setSourceMode}
                        onImageSelect={handleImageSelect}
                    />
                    {previewUrl && (
                        <div className="preview-pane-small">
                            <img src={previewUrl} alt="Preview" />
                        </div>
                    )}
                </div>

                <div className="col-composer">
                    <ContentComposer
                        caption={caption} setCaption={setCaption}
                        hashtags={hashtags} setHashtags={setHashtags}
                        internalNotes={internalNotes} setInternalNotes={setInternalNotes}
                    />
                </div>
            </div>

            {/* Row 2: Platforms (Horizontal Cards) */}
            <div className="row-platforms">
                <PlatformManager
                    selectedPlatforms={selectedPlatforms}
                    setSelectedPlatforms={setSelectedPlatforms}
                    platformSettings={platformSettings}
                    setPlatformSettings={setPlatformSettings}
                />
            </div>

            {/* Row 3: Action & Scheduler */}
            <div className="row-bottom">
                <Scheduler
                    scheduleType={scheduleType} setScheduleType={setScheduleType}
                    date={date} setDate={setDate}
                    time={time} setTime={setTime}
                    isRecurring={isRecurring} setIsRecurring={setIsRecurring}
                    recurrenceFreq={recurrenceFreq} setRecurrenceFreq={setRecurrenceFreq}
                    recurrenceEnd={recurrenceEnd} setRecurrenceEnd={setRecurrenceEnd}
                />

                <button type="submit" className="primary-btn big-publish-btn" disabled={loading}>
                    {loading ? 'Processing...' : (scheduleType === 'Now' ? 'Publish' : 'Schedule')}
                </button>
            </div>
        </form>
    );

}

export default PostForm;
