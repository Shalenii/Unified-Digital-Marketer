import React, { useState } from 'react';
import PostForm from './PostForm';
import PostList from './PostList';
import Settings from './components/Settings';

function App() {
  const [currentPage, setCurrentPage] = useState('create'); // 'create' | 'history'
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handlePostCreated = () => {
    setRefreshTrigger(prev => prev + 1);
    // Optional: Switch to history automatically? No, keep user in flow.
  };

  return (
    <div className="container">
      <header>
        <h1>Unified Digital Marketer</h1>
        <p className="subtitle">Manage and schedule your content across all platforms</p>

        <nav className="main-nav">
          <button
            className={`nav-btn ${currentPage === 'create' ? 'active' : ''}`}
            onClick={() => setCurrentPage('create')}
          >
            ✏️ Create Post
          </button>
          <button
            className={`nav-btn ${currentPage === 'history' ? 'active' : ''}`}
            onClick={() => setCurrentPage('history')}
          >
            📅 History & Schedule
          </button>
          <button
            className={`nav-btn ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            ⚙️ Settings
          </button>
        </nav>
      </header>

      <main>
        {currentPage === 'create' && <PostForm onPostCreated={handlePostCreated} />}
        {currentPage === 'history' && <PostList refreshTrigger={refreshTrigger} />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
