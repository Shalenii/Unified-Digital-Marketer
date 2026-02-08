import React, { useState } from 'react';

const CalendarView = ({ posts }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const getDaysInMonth = (year, month) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year, month) => {
        return new Date(year, month, 1).getDay(); // 0 = Sunday
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    // Group posts by day
    const postsByDay = {};
    posts.forEach(post => {
        const d = new Date(post.scheduled_time);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const day = d.getDate();
            if (!postsByDay[day]) postsByDay[day] = [];
            postsByDay[day].push(post);
        }
    });

    // Generate grid cells
    const slots = [];
    // Empty slots for days before the 1st
    for (let i = 0; i < firstDay; i++) {
        slots.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayPosts = postsByDay[day] || [];
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

        slots.push(
            <div key={day} className={`calendar-day ${isToday ? 'today' : ''}`}>
                <div className="day-number">{day}</div>
                <div className="day-events">
                    {dayPosts.map(post => (
                        <div key={post.id} className={`event-dot status-${post.status}`} title={`${post.caption} (${post.status})`}>
                            {/* Tiny preview or just a dot */}
                        </div>
                    ))}
                    {dayPosts.length > 0 && <span className="post-count">{dayPosts.length} posts</span>}
                </div>
            </div>
        );
    }

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <button onClick={prevMonth}>&lt;</button>
                <h3>{monthNames[month]} {year}</h3>
                <button onClick={nextMonth}>&gt;</button>
            </div>
            <div className="calendar-grid">
                <div className="day-name">Sun</div>
                <div className="day-name">Mon</div>
                <div className="day-name">Tue</div>
                <div className="day-name">Wed</div>
                <div className="day-name">Thu</div>
                <div className="day-name">Fri</div>
                <div className="day-name">Sat</div>
                {slots}
            </div>
        </div>
    );
};

export default CalendarView;
