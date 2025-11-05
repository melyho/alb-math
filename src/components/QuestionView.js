import React, { useState, useEffect } from 'react';
import LatexText from './LatexText';
import { getRandomQuestion } from '../utils';
import bookmarkIcon from '../assets/lucide/bookmark.svg';
import checkIcon from '../assets/lucide/check.svg';
import lightbulbIcon from '../assets/lucide/lightbulb.svg';
import eyeIcon from '../assets/lucide/eye.svg';
import eyeClosedIcon from '../assets/lucide/eye-closed.svg';
import arrowRightIcon from '../assets/lucide/arrow-big-right.svg';
import SavedProblems from './SavedProblems';

export default function QuestionView({ topic, onBack, progress, onUpdateProgress, onOpenSaved }) {
  const allQuestions = topic.questions || [];
  const [current, setCurrent] = useState(null);
  const [rotateClass, setRotateClass] = useState('rotate-left');
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    // Pick a random question when the topic changes or when completedQuestions updates.
    let completedForTopic = [];
    if (progress && Array.isArray(progress.completedQuestions)) {
      completedForTopic = progress.completedQuestions
        .filter(e => typeof e === 'string' && e.includes('::'))
        .map(e => {
          const parts = e.split('::');
          return { topicName: parts[0], id: Number(parts[1]) };
        })
        .filter(x => x.topicName === topic.name)
        .map(x => x.id);
    }
    // Also include numeric ids present in progress
    const numericCompleted = (progress && Array.isArray(progress.completedQuestions)) ? progress.completedQuestions.filter(e => typeof e === 'number') : [];
    const completedIds = Array.from(new Set([...numericCompleted, ...completedForTopic]));
    const q = getRandomQuestion(allQuestions, completedIds);
    setCurrent(q);
    setShowHint(false);
  setShowAnswer(false);
  setRotateClass(prev => (prev === 'rotate-left' ? 'rotate-right' : 'rotate-left'));
  }, [topic, progress && progress.completedQuestions ? progress.completedQuestions.join(',') : '']);

  function pickRandom() {
    // compute completed ids relevant to this topic (same logic as above)
    let completedForTopic = [];
    if (progress && Array.isArray(progress.completedQuestions)) {
      completedForTopic = progress.completedQuestions
        .filter(e => typeof e === 'string' && e.includes('::'))
        .map(e => {
          const parts = e.split('::');
          return { topicName: parts[0], id: Number(parts[1]) };
        })
        .filter(x => x.topicName === topic.name)
        .map(x => x.id);
    }
    const numericCompleted = (progress && Array.isArray(progress.completedQuestions)) ? progress.completedQuestions.filter(e => typeof e === 'number') : [];
    const completedIds = Array.from(new Set([...numericCompleted, ...completedForTopic]));
    const q = getRandomQuestion(allQuestions, completedIds);
    setCurrent(q);
    setShowHint(false);
  setShowAnswer(false);
  setRotateClass(prev => (prev === 'rotate-left' ? 'rotate-right' : 'rotate-left'));
  }

  function handleSave() {
    if (!current || !onUpdateProgress) return;
    const isSaved = (progress.savedQuestions || []).includes(current.id);
    const saved = new Set(progress.savedQuestions || []);
    if (isSaved) saved.delete(current.id);
    else saved.add(current.id);
    const next = { ...progress, savedQuestions: Array.from(saved) };
    onUpdateProgress(next);
  }

  function handleMarkCompleted() {
    if (!current || !onUpdateProgress) return;
    // Use a topic-scoped key to avoid collisions when IDs repeat across topics
    const key = `${topic.name}::${current.id}`;
    const completed = new Set(progress.completedQuestions || []);
    
    // Toggle: if already completed, remove it; otherwise add it
    if (completed.has(key) || completed.has(current.id)) {
      completed.delete(key);
      completed.delete(current.id);
    } else {
      completed.add(key);
    }
    
    const next = { ...progress, completedQuestions: Array.from(completed) };
    onUpdateProgress(next);
  }

  function handleNext() {
    // Use same per-topic completed ids when selecting next
    let completedForTopic = [];
    if (progress && Array.isArray(progress.completedQuestions)) {
      completedForTopic = progress.completedQuestions
        .filter(e => typeof e === 'string' && e.includes('::'))
        .map(e => {
          const parts = e.split('::');
          return { topicName: parts[0], id: Number(parts[1]) };
        })
        .filter(x => x.topicName === topic.name)
        .map(x => x.id);
    }
    const numericCompleted = (progress && Array.isArray(progress.completedQuestions)) ? progress.completedQuestions.filter(e => typeof e === 'number') : [];
    const completedIds = Array.from(new Set([...numericCompleted, ...completedForTopic]));
    const q = getRandomQuestion(allQuestions, completedIds);
    setCurrent(q);
    setRotateClass(prev => (prev === 'rotate-left' ? 'rotate-right' : 'rotate-left'));
    setShowHint(false);
    setShowAnswer(false);
  }

  function handleReset() {
    if (!onUpdateProgress) return;
    // Remove any completed entries that belong to this topic (both numeric ids and topic-scoped keys)
    const topicIds = new Set(allQuestions.map(q => q.id));
    const nextCompleted = (progress.completedQuestions || []).filter(entry => {
      // If entry is a topic-scoped key like 'TopicName::id', remove if topic matches
      if (typeof entry === 'string' && entry.includes('::')) {
        const [tName, idStr] = entry.split('::');
        const idNum = Number(idStr);
        if (tName === topic.name && topicIds.has(idNum)) return false; // filter out
        return true;
      }
      // numeric id: remove if it belongs to this topic
      if (topicIds.has(entry)) return false;
      return true;
    });
    const next = { ...progress, completedQuestions: nextCompleted };
    onUpdateProgress(next);
    setCurrent(getRandomQuestion(allQuestions, []));
    setShowHint(false);
    setShowAnswer(false);
  }

  // Count unique completed question IDs that belong to this topic only
  const topicIds = Array.from(new Set(allQuestions.map(q => q.id)));
  const completedSet = new Set(progress.completedQuestions || []);
  let completedCount = 0;
  for (const id of topicIds) {
    if (completedSet.has(id)) {
      completedCount += 1;
      continue;
    }
    const key = `${topic.name}::${id}`;
    if (completedSet.has(key)) completedCount += 1;
  }
  const totalCount = allQuestions.length;

  const [isExiting, setIsExiting] = useState(false);

  // Wrapper for next that triggers exit animation
  function handleNextWithAnimation() {
    setIsExiting(true);
    setTimeout(() => {
      handleNext();
      setIsExiting(false);
    }, 500); // Match CSS cardExit duration
  }

  return (
    <div>
      <div className="header">
        <h2>{topic.name}</h2>
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn" onClick={handleReset}>Reset Progress</button>
      </div>

      <div className="footer">
        <div className="small">{completedCount}/{totalCount} completed</div>
        <div className="badge" onClick={onOpenSaved}>Saved questions: {new Set(progress.savedQuestions || []).size}</div>
      </div>

      {current ? (
        <>
          <div className="flashcard-container">
            <div className={`flashcard ${isExiting ? 'exit' : rotateClass}`}>
              <div className="flashcard-content">
                <LatexText text={current.question} />
              </div>
              
              {showHint && (
                <div style={{ marginTop: 20 }}>
                  <div><strong>Hint</strong></div>
                  <div className="small"><LatexText text={current.hint} /></div>
                </div>
              )}

              {showAnswer && (
                <div style={{ marginTop: 20 }}>
                  <div><strong>Answer</strong></div>
                  <div style={{ fontSize: '1.2rem', marginTop: 10 }}><LatexText text={current.answer} /></div>

                  {current.solution && (
                    <div style={{ marginTop: 16 }}>
                      <div><strong>Solution</strong></div>
                      <div className="small"><LatexText text={current.solution} /></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="controls-panel">
            <div className="controls">
              <button className="btn" onClick={() => setShowHint(!showHint)}>
                {showHint ? 'Hide Hint' : 'Show Hint'}
                <img src={lightbulbIcon} className="btn-icon" alt="" aria-hidden="true" />
              </button>
              <button className="btn" onClick={() => setShowAnswer(!showAnswer)}>
                {showAnswer ? 'Hide Answer' : 'Show Answer & Solution'}
                <img src={showAnswer ? eyeClosedIcon : eyeIcon} className="btn-icon" alt="" aria-hidden="true" />
              </button>
              <button className="btn" onClick={handleSave}>
                {(progress.savedQuestions||[]).includes(current.id) ? 'Unsave' : 'Save for Later'}
                <img src={bookmarkIcon} className="btn-icon" alt="" aria-hidden="true" />
              </button>
              <button className="btn btn-primary" onClick={handleMarkCompleted}>
                {(() => {
                  const key = `${topic.name}::${current.id}`;
                  const isCompleted = (progress.completedQuestions || []).includes(key) || (progress.completedQuestions || []).includes(current.id);
                  return isCompleted ? 'Mark Incomplete' : 'Complete';
                })()}
                <img src={checkIcon} className="btn-icon" alt="" aria-hidden="true" />
              </button>
              <button className="btn btn-secondary" onClick={handleNextWithAnimation}>
                Next Question
                <img src={arrowRightIcon} className="btn-icon" alt="" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 20 }}>
          <strong>Yay!!!! You finished a topic!! =^ - ^=</strong>
          <img src="../assets/pudgy.gif" alt="" />
        </div>
      )}
    </div>
  );
}
