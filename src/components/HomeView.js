import React from 'react';
import LatexText from './LatexText';
import { loadQuestions, loadProgress, findQuestionById, getProgressSummary } from '../utils';

export default function HomeView({ onOpenCluster, onOpenSaved, progress }) {
  const data = loadQuestions();
  const summary = getProgressSummary(data, progress || { completedQuestions: [], savedQuestions: [] });

  return (
    <div>
      <div className="header">
        <h2>Home</h2>
        <div>
          <button className="btn" onClick={onOpenSaved}>Saved Problems</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Topics</h3>
        {summary.map((cluster, ci) => (
          <div key={ci} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{cluster.name}</strong>
              <div style={{ minWidth: 120, textAlign: 'right' }}>
                <div className="small">{cluster.completed}/{cluster.total} completed</div>
                <div className="small">{cluster.percent}%</div>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="progress" aria-hidden>
                <div className="progress-inner" style={{ width: `${cluster.percent}%` }} />
              </div>
            </div>

            <ul className="list">
              {cluster.topics.map((t, ti) => (
                <li key={ti} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div onClick={() => onOpenCluster(cluster.name, t.name)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><span className="topic-name">{t.name}</span></div>
                      <div className="small">{t.completed}/{t.total} • {t.percent}%</div>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <div className="progress progress-small" aria-hidden>
                        <div className="progress-inner" style={{ width: `${t.percent}%` }} />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
