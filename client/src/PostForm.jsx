import React, { useState } from 'react';
import toast from 'react-hot-toast';
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
    const [publishJob, setPublishJob] = useState(null);

    const handleImageSelect = (imgData, url) => {
        setSelectedImage(imgData);
        setPreviewUrl(url);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!selectedImage) { toast.error('Please select an image.'); return; }
        if (selectedPlatforms.length === 0) { toast.error('Please select at least one platform.'); return; }

        let finalScheduledTime;
        if (scheduleType === 'Now') {
            finalScheduledTime = new Date();
        } else {
            if (!date || !time) { toast.error('Please set date and time.'); return; }
            // Construction: Combining "YYYY-MM-DD" and "HH:mm" to create a local Date object
            // Use the hyphen and space format which is most reliable for "local" interpretation in JS
            finalScheduledTime = new Date(`${date} ${time}`);

            // Safety Check: If for some reason the date is invalid or in the past
            if (isNaN(finalScheduledTime.getTime())) {
                toast.error('Invalid date or time selected.');
                return;
            }
            if (finalScheduledTime < new Date()) {
                console.warn('Post scheduled for the past. Adjusting to current time + 1 min for safety or alerting.');
                // Optional: toast.error('You cannot schedule a post in the past.');
            }
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
            const res = await fetch(`/api/posts`, {
                method: 'POST',
                body: formData
            });

            // Check if response is a stream (NDJSON)
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/x-ndjson')) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                // Initialize Progress State
                setPublishJob({
                    active: true,
                    totalPlatforms: selectedPlatforms.length,
                    completed: 0,
                    currentPlatform: 'Initializing...',
                    status: 'processing', // processing, success, error
                    logs: []
                });

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep the last incomplete line in the buffer

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);
                            
                            setPublishJob(prev => {
                                const newJob = { ...prev };
                                
                                if (event.type === 'start') {
                                    newJob.totalPlatforms = event.totalPlatforms;
                                } else if (event.type === 'progress') {
                                    if (event.status === 'publishing') {
                                        newJob.currentPlatform = event.platform;
                                        newJob.logs = [...newJob.logs, `Publishing to ${event.platform}...`];
                                    } else if (event.status === 'success') {
                                        newJob.completed += 1;
                                        newJob.logs = [...newJob.logs, `✅ Success: ${event.platform}`];
                                    } else if (event.status === 'error') {
                                        newJob.completed += 1;
                                        newJob.logs = [...newJob.logs, `❌ Failed: ${event.platform} - ${event.error}`];
                                    }
                                } else if (event.type === 'complete') {
                                    newJob.status = event.hasErrors ? 'error' : 'success';
                                    newJob.currentPlatform = 'Done!';
                                    if (!event.hasErrors) {
                                        toast.success('All platforms published successfully!');
                                    } else {
                                        toast.error('Published with some errors. Check logs.');
                                    }
                                    
                                    // Reset form on complete
                                    setCaption('');
                                    setHashtags('');
                                    setInternalNotes('');
                                    if (onPostCreated) onPostCreated();

                                    // Auto close after 3 seconds if success
                                    if (!event.hasErrors) {
                                        setTimeout(() => setPublishJob(null), 3000);
                                    }
                                } else if (event.type === 'error') {
                                    newJob.status = 'error';
                                    newJob.logs = [...newJob.logs, `💥 Critical Error: ${event.error}`];
                                    toast.error('Critical publishing error.');
                                }
                                
                                return newJob;
                            });
                        } catch (e) {
                            console.error('Failed to parse NDJSON line:', line, e);
                        }
                    }
                }
            } else {
                // Handle standard JSON response (for Scheduled posts)
                if (res.ok) {
                    toast.success(`Success! Post ${scheduleType === 'Now' ? 'queued' : 'scheduled'}.`);
                    setCaption('');
                    setHashtags('');
                    setInternalNotes('');
                    if (onPostCreated) onPostCreated();
                } else {
                    const err = await res.json();
                    toast.error('Failed: ' + err.error);
                }
            }
        } catch (error) {
            console.error(error);
            toast.error('Error submitting form');
        } finally {
            setLoading(false);
        }
    };

    // --- Progress Modal Component ---
    const renderProgressModal = () => {
        if (!publishJob || !publishJob.active) return null;

        const progressPercent = publishJob.totalPlatforms > 0 
            ? Math.round((publishJob.completed / publishJob.totalPlatforms) * 100) 
            : 0;

        return (
            <div className="publish-modal-overlay">
                <div className="publish-modal-content">
                    <h2 className="modal-title" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-main)', textAlign: 'center' }}>
                        {publishJob.status === 'processing' && '🚀 Publishing Post...'}
                        {publishJob.status === 'success' && '✨ Publish Complete!'}
                        {publishJob.status === 'error' && '⚠️ Publish Finished (with errors)'}
                    </h2>
                    
                    <p className="current-action" style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: '600', marginBottom: '1.5rem' }}>
                        {publishJob.currentPlatform}
                    </p>

                    <div className="progress-bar-container">
                        <div 
                            className={`progress-fill ${publishJob.status}`} 
                            style={{ width: `${progressPercent}%` }}
                        ></div>
                    </div>
                    <p className="progress-text" style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                        {progressPercent}% ({publishJob.completed}/{publishJob.totalPlatforms} platforms)
                    </p>

                    <div className="publish-logs" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', maxHeight: '150px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {publishJob.logs.map((log, i) => (
                            <div key={i} className="log-line" style={{ marginBottom: '4px' }}>{log}</div>
                        ))}
                    </div>

                    {publishJob.status !== 'processing' && (
                        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                            <button type="button" className="primary-btn" onClick={() => setPublishJob(null)} style={{ width: 'auto', padding: '0.8rem 2rem' }}>
                                Close Window
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (

        <form onSubmit={handleSubmit} className="dashboard-grid">
            {renderProgressModal()}
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
