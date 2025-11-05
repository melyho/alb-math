// Utilities: loadQuestions, getRandomQuestion, progress save/load
import questionsData from './data/questions.json';

const STORAGE_KEY = 'qaProgress';

export function loadQuestions() {
  return questionsData;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedQuestions: [], savedQuestions: [] };
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load progress', e);
    return { completedQuestions: [], savedQuestions: [] };
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.error('Failed to save progress', e);
  }
}

export function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to reset progress', e);
  }
}

export function getRandomQuestion(questions, completedIds = []) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const remaining = questions.filter(q => !completedIds.includes(q.id));
  if (remaining.length === 0) return null;
  const idx = Math.floor(Math.random() * remaining.length);
  return remaining[idx];
}

// Return flat array of questions with cluster and topic metadata
export function flattenQuestions(data) {
  const out = [];
  (data.clusters || []).forEach(cluster => {
    (cluster.topics || []).forEach(topic => {
      (topic.questions || []).forEach(q => {
        out.push({ ...q, cluster: cluster.name, topic: topic.name });
      });
    });
  });
  return out;
}

export function findQuestionById(data, id) {
  const flat = flattenQuestions(data);
  return flat.find(q => q.id === id) || null;
}

export function getProgressSummary(data, progress) {
  // completed entries may be numeric ids or topic-scoped keys like 'TopicName::id'
  const completed = new Set(progress.completedQuestions || []);
  return (data.clusters || []).map(cluster => {
    const topics = (cluster.topics || []).map(topic => {
      const total = (topic.questions || []).length;
      const completedCount = (topic.questions || []).filter(q => {
        // Consider it completed if either the numeric id is present, or the topic-scoped key exists
        if (completed.has(q.id)) return true;
        const key = `${topic.name}::${q.id}`;
        if (completed.has(key)) return true;
        return false;
      }).length;
      const percent = total ? Math.round((completedCount / total) * 100) : 0;
      return { name: topic.name, total, completed: completedCount, percent };
    });

    const clusterTotal = topics.reduce((s, t) => s + (t.total || 0), 0);
    const clusterCompleted = topics.reduce((s, t) => s + (t.completed || 0), 0);
    const clusterPercent = clusterTotal ? Math.round((clusterCompleted / clusterTotal) * 100) : 0;

    return {
      name: cluster.name,
      total: clusterTotal,
      completed: clusterCompleted,
      percent: clusterPercent,
      topics
    };
  });
}

// Helpers to modify savedQuestions list
export function addSavedQuestion(id) {
  const progress = loadProgress();
  const saved = new Set(progress.savedQuestions || []);
  saved.add(id);
  const next = { ...progress, savedQuestions: Array.from(saved) };
  saveProgress(next);
  return next;
}

export function removeSavedQuestion(id) {
  const progress = loadProgress();
  const saved = new Set(progress.savedQuestions || []);
  if (saved.has(id)) saved.delete(id);
  const next = { ...progress, savedQuestions: Array.from(saved) };
  saveProgress(next);
  return next;
}

export function isQuestionSaved(id) {
  const progress = loadProgress();
  return (progress.savedQuestions || []).includes(id);
}

// Add or remove a completed question using a topic-scoped key to avoid collisions
export function addCompletedQuestion(question) {
  const progress = loadProgress();
  const completed = new Set(progress.completedQuestions || []);
  const key = `${question.topic}::${question.id}`;
  completed.add(key);
  const next = { ...progress, completedQuestions: Array.from(completed) };
  saveProgress(next);
  return next;
}

export function removeCompletedQuestion(question) {
  const progress = loadProgress();
  const arr = progress.completedQuestions || [];
  const filtered = arr.filter(entry => {
    if (typeof entry === 'string' && entry.includes('::')) {
      const [tName, idStr] = entry.split('::');
      if (tName === question.topic && Number(idStr) === question.id) return false;
      return true;
    }
    // numeric id
    if (entry === question.id) return false;
    return true;
  });
  const next = { ...progress, completedQuestions: filtered };
  saveProgress(next);
  return next;
}

// Reset progress for a specific topic's questions only
export function resetTopicProgress(topic) {
  const progress = loadProgress();
  const topicQuestionIds = new Set((topic.questions || []).map(q => q.id));
  const completedQuestions = (progress.completedQuestions || []).filter(id => !topicQuestionIds.has(id));
  const next = { ...progress, completedQuestions };
  saveProgress(next);
  return next;
}
