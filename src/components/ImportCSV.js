import React, { useState, useRef, useEffect } from 'react';
import { importCSVFile, saveCheckpoint, restoreCheckpoint, hasCheckpoint, getCheckpointInfo, getAllCheckpoints, deleteCheckpoint, resetToOriginalQuestions } from '../utils';

const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

export default function ImportCSV({ onImportComplete }) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [checkpointExists, setCheckpointExists] = useState(false);
  const [checkpointInfo, setCheckpointInfo] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const fileInputRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    refreshCheckpoints();
    
    // Set up auto-save timer
    autoSaveTimerRef.current = setInterval(() => {
      saveCheckpoint('Auto-save');
      refreshCheckpoints();
    }, AUTO_SAVE_INTERVAL);
    
    // Cleanup on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, []);

  const refreshCheckpoints = () => {
    setCheckpointExists(hasCheckpoint());
    setCheckpointInfo(getCheckpointInfo());
    setCheckpoints(getAllCheckpoints());
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      setSuccess(null);
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await importCSVFile(file);
      setSuccess(`Successfully imported ${result.questionsAdded} questions! Total questions: ${result.totalQuestions}`);
      setError(null);
      refreshCheckpoints();
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component to refresh
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      setError(`Failed to import CSV: ${err.message}`);
      setSuccess(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleSaveCheckpoint = () => {
    try {
      const saved = saveCheckpoint('Manual');
      if (saved) {
        setSuccess('Checkpoint saved successfully!');
        setError(null);
        refreshCheckpoints();
      } else {
        setError('Failed to save checkpoint');
        setSuccess(null);
      }
    } catch (err) {
      setError(`Failed to save checkpoint: ${err.message}`);
      setSuccess(null);
    }
  };

  const handleRestoreCheckpoint = (checkpointId) => {
    if (!window.confirm('Are you sure you want to restore this checkpoint? This will replace your current questions.')) {
      return;
    }

    try {
      restoreCheckpoint(checkpointId);
      setSuccess('Successfully restored checkpoint!');
      setError(null);
      setShowCheckpoints(false);
      
      // Notify parent component to refresh
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      setError(`Failed to restore checkpoint: ${err.message}`);
      setSuccess(null);
    }
  };

  const handleDeleteCheckpoint = (checkpointId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this checkpoint?')) {
      return;
    }

    try {
      deleteCheckpoint(checkpointId);
      refreshCheckpoints();
      setSuccess('Checkpoint deleted');
      setError(null);
    } catch (err) {
      setError(`Failed to delete checkpoint: ${err.message}`);
      setSuccess(null);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleResetToOriginal = () => {
    if (!window.confirm('Are you sure you want to reset to the original questions? This will remove ALL imported questions and checkpoints. This cannot be undone.')) {
      return;
    }

    try {
      resetToOriginalQuestions();
      setSuccess('Successfully reset to original questions!');
      setError(null);
      refreshCheckpoints();
      
      // Notify parent component to refresh
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      setError(`Failed to reset: ${err.message}`);
      setSuccess(null);
    }
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 15, borderTop: '1px solid #ddd' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
        <button 
          className="btn" 
          onClick={handleButtonClick}
          disabled={isImporting}
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem', padding: '6px 8px' }}
        >
          {isImporting ? 'Importing...' : '📁 Import'}
        </button>
        
        <button 
          className="btn" 
          onClick={handleSaveCheckpoint}
          disabled={isImporting}
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem', padding: '6px 8px' }}
          title="Save current state as checkpoint"
        >
          💾 Save
        </button>
      </div>

      {/* <button 
        className="btn" 
        onClick={handleResetToOriginal}
        disabled={isImporting}
        style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem', marginBottom: 5, padding: '6px 8px', backgroundColor: '#fee', borderColor: '#fcc' }}
        title="Reset to original questions from JSON file"
      >
        🔄 Reset to Original
      </button> */}

      {checkpointExists && (
        <button 
          className="btn" 
          onClick={() => setShowCheckpoints(!showCheckpoints)}
          disabled={isImporting}
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem', marginBottom: 5, marginTop: 4,  padding: '6px 8px' }}
          title="View and restore checkpoints"
        >
          {showCheckpoints ? '▼' : '▶'} Checkpoints ({checkpoints.length})
        </button>
      )}

      {showCheckpoints && checkpoints.length > 0 && (
        <div style={{ 
          marginTop: 8, 
          maxHeight: '300px', 
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: 4,
          backgroundColor: '#fafafa'
        }}>
          {checkpoints.map((cp) => (
            <div 
              key={cp.id}
              onClick={() => handleRestoreCheckpoint(cp.id)}
              style={{
                padding: '8px 10px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#fff',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                  {cp.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>
                  {formatDate(cp.timestamp)} • {cp.questionCount} questions
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteCheckpoint(cp.id, e)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
                title="Delete checkpoint"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ 
          marginTop: 8, 
          padding: 8, 
          backgroundColor: '#fee', 
          border: '1px solid #fcc',
          borderRadius: 4,
          fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          marginTop: 8, 
          padding: 8, 
          backgroundColor: '#efe', 
          border: '1px solid #cfc',
          borderRadius: 4,
          fontSize: '0.85rem'
        }}>
          {success}
        </div>
      )}

      {!error && !success && checkpointInfo && (
        <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#888', lineHeight: 1.3 }}>
          Latest: {checkpointInfo.label} ({checkpointInfo.questionCount} questions)
          <br />
          Auto-saves every 2 minutes
        </div>
      )}

      {!error && !success && !checkpointInfo && (
        <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#888', lineHeight: 1.3 }}>
          Add more questions from CSV files
          <br />
          Auto-saves every 2 minutes
        </div>
      )}
    </div>
  );
}
