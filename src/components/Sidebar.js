import React, { useState } from 'react';
import { loadQuestions, getProgressSummary } from '../utils';
import houseIcon from '../assets/lucide/house.svg';
import arrowLeftIcon from '../assets/lucide/arrow-left.svg';
import menuIcon from '../assets/lucide/menu.svg';

export default function Sidebar({ onOpenCluster, onOpenSaved, onOpenHome, selectedCluster, selectedTopic, progress }) {
  const [collapsed, setCollapsed] = useState(false);
  const data = loadQuestions();
  const summary = getProgressSummary(data, progress || { completedQuestions: [], savedQuestions: [] });

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle" onClick={() => setCollapsed(false)} title="Expand sidebar" style={{marginTop: 2}}>
          <img src={menuIcon} alt="" aria-hidden="true" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>cutie patooie's math prep</h3>
        <button className="sidebar-toggle" onClick={() => setCollapsed(true)} title="Collapse sidebar">
          <img src={arrowLeftIcon} alt="" aria-hidden="true" style={{ width: 18, height: 18, display: 'block' }} />
        </button>
      </div>
      <div className="sidebar-content">
        <div className="sidebar-saved" style={{ display: 'flex', gap: '0rem' }}>
          <button className="btn" onClick={onOpenHome}>Home</button>
          <button className="btn" onClick={onOpenSaved}>Saved Questions</button>
        </div>
        {summary.map((cluster, ci) => {
          const clusterActive = selectedCluster === cluster.name;
          const clusterPercent = cluster.total ? Math.round((cluster.completed / cluster.total) * 100) : 0;
          return (
            <div key={ci} className={`sidebar-section ${clusterActive ? 'cluster-active' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sidebar-cluster">{cluster.name}</div>
                <div style={{ textAlign: 'right' }} className="small" title={`${cluster.completed}/${cluster.total} completed`}>
                  {clusterPercent}%
                </div>
              </div>
              <ul className="sidebar-list">
                {cluster.topics.map((t, ti) => {
                  const topicActive = clusterActive && selectedTopic === t.name;
                  const topicPercent = t.total ? Math.round((t.completed / t.total) * 100) : 0;
                  return (
                    <li key={ti} className={`sidebar-item ${topicActive ? 'active' : ''}`} onClick={() => onOpenCluster(cluster.name, t.name)} title={`${t.completed}/${t.total} completed — ${topicPercent}%`}>
                      <div className="sidebar-topic">
                        <span className="sidebar-topic-name">{t.name}</span>
                        <span className="small">{topicPercent}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}