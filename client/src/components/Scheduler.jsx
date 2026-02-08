import React from 'react';

const Scheduler = ({
    scheduleType, setScheduleType,
    date, setDate,
    time, setTime,
    isRecurring, setIsRecurring,
    recurrenceFreq, setRecurrenceFreq,
    recurrenceEnd, setRecurrenceEnd
}) => {
    // Current date for min attribute
    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="section-card scheduler-section">
            <h3 className="section-header">I SCHEDULE</h3>

            <div className="radio-group">
                <label className={scheduleType === 'Now' ? 'active' : ''}>
                    <input
                        type="radio"
                        name="scheduleType"
                        value="Now"
                        checked={scheduleType === 'Now'}
                        onChange={() => setScheduleType('Now')}
                    />
                    Publish Now
                </label>
                <label className={scheduleType === 'Later' ? 'active' : ''}>
                    <input
                        type="radio"
                        name="scheduleType"
                        value="Later"
                        checked={scheduleType === 'Later'}
                        onChange={() => setScheduleType('Later')}
                    />
                    Schedule for Later
                </label>
            </div>

            {scheduleType === 'Later' && (
                <div className="schedule-details">
                    <div className="row">
                        <div className="col">
                            <label>Date</label>
                            <input
                                type="date"
                                min={today}
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                        <div className="col">
                            <label>Time</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="recurrence-box">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={isRecurring}
                                onChange={(e) => setIsRecurring(e.target.checked)}
                            />
                            Recurring Schedule
                        </label>

                        {isRecurring && (
                            <div className="recurrence-options">
                                <label>Frequency:
                                    <select value={recurrenceFreq} onChange={(e) => setRecurrenceFreq(e.target.value)}>
                                        <option value="Daily">Daily</option>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                    </select>
                                </label>
                                <label>End Date (Optional):
                                    <input
                                        type="date"
                                        min={date}
                                        value={recurrenceEnd}
                                        onChange={(e) => setRecurrenceEnd(e.target.value)}
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Scheduler;
