import React, { useState, useEffect } from 'react';
import LatexText from './LatexText';
import { loadQuestions, findQuestionById, removeSavedQuestion, flattenQuestions, addCompletedQuestion, removeCompletedQuestion } from '../utils';

export default function SavedProblems({ onOpenTopic, progress, onUpdateProgress }) {
  const data = loadQuestions();
  const [savedQuestions, setSavedQuestions] = useState([]);
  const [completedQuestions, setCompletedQuestions] = useState([]);

  function reload(p) {
    const savedIds = (p && p.savedQuestions) || [];
    const list = savedIds.map(id => findQuestionById(data, id)).filter(Boolean);
    setSavedQuestions(list);
  }

  function reloadCompleted(p) {
    const completed = (p && p.completedQuestions) || [];
    // build flat question list and match by numeric id or topic-scoped key
    const flat = flattenQuestions(data);
    const list = flat.filter(q => {
      const key = `${q.topic}::${q.id}`;
      if (completed.includes(key)) return true;
      if (completed.includes(q.id)) return true;
      return false;
    });
    return list;
  }

  useEffect(() => {
    reload(progress);
    setCompletedQuestions(reloadCompleted(progress));
  }, [data, progress]);

  useEffect(() => {
    // if progress changes, refresh completed list
    setCompletedQuestions(reloadCompleted(progress));
  }, [progress]);

  function handleUnsave(id) {
    // Use utils helper to remove & get next progress, then notify parent
    const next = removeSavedQuestion(id);
    if (onUpdateProgress) onUpdateProgress(next);
    else reload(next);
  }

  function handleUnmarkCompleted(q) {
    const next = removeCompletedQuestion(q);
    if (onUpdateProgress) onUpdateProgress(next);
    else setCompletedQuestions(reloadCompleted(next));
  }

  function handleMarkCompleted(q) {
    const next = addCompletedQuestion(q);
    if (onUpdateProgress) onUpdateProgress(next);
    else setCompletedQuestions(reloadCompleted(next));
  }

  return (
    <div>
      <div className="header">
        <h2>Problems</h2>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Completed Problems</h3>
        {completedQuestions.length === 0 ? (
          <div className="small">No completed problems :(</div>
        ) : (
          <ul className="list">
            {completedQuestions.map((q) => (
              <li key={`c-${q.id}`} onClick={() => onOpenTopic(q.cluster, q.topic)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '60%' }}>
                    <div><strong>#{q.id}</strong></div>
                    <div className="small"><LatexText text={q.question} /></div>
                  </div>
                  <div>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); onOpenTopic(q.cluster, q.topic); }}>View</button>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); handleUnmarkCompleted(q); }}>Unmark</button>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); handleUnsave(q.id); }}>Unsave</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 style={{ marginTop: 20 }}>Saved Problems</h3>
        {savedQuestions.length === 0 ? (
          <div className="small">No saved problems.</div>
        ) : (
          <ul className="list">
            {savedQuestions.map((q) => (
              <li key={q.id} onClick={() => onOpenTopic(q.cluster, q.topic)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '60%' }}>
                    <div><strong>#{q.id}</strong></div>
                    <div className="small"><LatexText text={q.question} /></div>
                  </div>
                  <div>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); onOpenTopic(q.cluster, q.topic); }}>Open Question</button>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); handleUnsave(q.id); }}>Unsave</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
