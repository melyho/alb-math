import React, { useState } from 'react';
import ClusterSelect from './components/ClusterSelect';
import TopicSelect from './components/TopicSelect';
import QuestionView from './components/QuestionView';
import HomeView from './components/HomeView';
import SavedProblems from './components/SavedProblems';
import Sidebar from './components/Sidebar';
import { loadQuestions, loadProgress, saveProgress } from './utils';

import './index.css';

function App() {
  const data = loadQuestions();
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [view, setView] = useState('home'); // home | cluster | topic | saved
  const [progress, setProgress] = useState(loadProgress());

  function updateProgress(next) {
    try {
      saveProgress(next);
    } catch (e) {
      // saveProgress already logs errors
    }
    setProgress(next);
  }

  return (
  <div className="app-container">
      <Sidebar 
        progress={progress}
        onOpenHome={() => setView('home')}
        selectedCluster={selectedCluster ? selectedCluster.name : null}
        selectedTopic={selectedTopic ? selectedTopic.name : null}
        onOpenCluster={(clusterName, topicName) => {
          const clusterObj = (data.clusters || []).find(c => c.name === clusterName);
          if (!clusterObj) {
            setView('cluster');
            return;
          }
          setSelectedCluster(clusterObj);
          if (topicName) {
            const topicObj = (clusterObj.topics || []).find(t => t.name === topicName);
            if (topicObj) {
              setSelectedTopic(topicObj);
              setView('topic');
              return;
            }
          }
          setView('cluster-topics');
        }}
        onOpenSaved={() => setView('saved')}
      />
      <div className="main-content">
        <div className="header">
          <h1>cutie patooie's math prep!!</h1>
        </div>

        {view === 'home' && (
        <HomeView
          progress={progress}
          onOpenCluster={(clusterName, topicName) => {
            // find cluster by name
            const clusterObj = (data.clusters || []).find(c => c.name === clusterName);
            if (!clusterObj) {
              setView('cluster');
              return;
            }
            setSelectedCluster(clusterObj);
            if (topicName) {
              const topicObj = (clusterObj.topics || []).find(t => t.name === topicName);
              if (topicObj) {
                setSelectedTopic(topicObj);
                setView('topic');
                return;
              }
            }
            setView('cluster-topics');
          }}
          onOpenSaved={() => setView('saved')}
        />
      )}

      {view === 'cluster' && !selectedTopic && (
        <ClusterSelect clusters={data.clusters} onSelect={(c) => { setSelectedCluster(c); setView('cluster-topics'); }} />
      )}

      {view === 'cluster-topics' && selectedCluster && !selectedTopic && (
        <TopicSelect cluster={selectedCluster} onBack={() => { setSelectedCluster(null); setView('home'); }} onSelect={(t) => { setSelectedTopic(t); setView('topic'); }} />
      )}

      {view === 'topic' && selectedTopic && (
        <QuestionView topic={selectedTopic} progress={progress} onUpdateProgress={updateProgress} onBack={() => { setSelectedTopic(null); setView('home'); }} onOpenSaved={() => setView('saved')} />
      )}

        {view === 'saved' && (
        <div>
          <div className="header">
            <button className="btn" onClick={() => setView('home')}>Back</button>
          </div>
            <SavedProblems progress={progress} onUpdateProgress={updateProgress} onOpenTopic={(clusterName, topicName) => {
            // find matching topic and open
            for (const c of data.clusters || []) {
              if (c.name === clusterName) {
                const ft = (c.topics || []).find(tt => tt.name === topicName);
                if (ft) {
                  setSelectedCluster(c);
                  setSelectedTopic(ft);
                  setView('topic');
                  return;
                }
              }
            }
          }} />
        </div>
      )}

    </div>
  </div>
  );
}

export default App;
