// Utilities: loadQuestions, getRandomQuestion, progress save/load
import questionsData from './data/questions.json';

const STORAGE_KEY = 'qaProgress';
const QUESTIONS_STORAGE_KEY = 'qaQuestionsData';
const CHECKPOINTS_KEY = 'qaQuestionsCheckpoints';
const MAX_CHECKPOINTS = 10; // Keep last 10 checkpoints

export function loadQuestions() {
  // Try to load from localStorage first (for imported CSVs)
  try {
    const stored = localStorage.getItem(QUESTIONS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load questions from localStorage', e);
  }
  // Fall back to the default imported JSON
  return questionsData;
}

export function saveQuestions(data) {
  try {
    localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save questions to localStorage', e);
    throw e;
  }
}

export function resetToOriginalQuestions() {
  try {
    // Remove all imported questions and checkpoints
    localStorage.removeItem(QUESTIONS_STORAGE_KEY);
    localStorage.removeItem(CHECKPOINTS_KEY);
    // Also clear saved/completed questions to avoid ID mismatches
    localStorage.removeItem(STORAGE_KEY);
    return questionsData;
  } catch (e) {
    console.error('Failed to reset questions', e);
    throw e;
  }
}

export function cleanupInvalidProgress() {
  try {
    const data = loadQuestions();
    const progress = loadProgress();
    const flat = flattenQuestions(data);
    const validIds = new Set(flat.map(q => q.id));
    
    // Clean saved questions
    const validSaved = (progress.savedQuestions || []).filter(id => validIds.has(id));
    
    // Clean completed questions
    const validCompleted = (progress.completedQuestions || []).filter(entry => {
      if (typeof entry === 'string' && entry.includes('::')) {
        const [, idStr] = entry.split('::');
        return validIds.has(Number(idStr));
      }
      return validIds.has(entry);
    });
    
    const cleaned = {
      ...progress,
      savedQuestions: validSaved,
      completedQuestions: validCompleted
    };
    
    saveProgress(cleaned);
    return cleaned;
  } catch (e) {
    console.error('Failed to cleanup progress', e);
    return loadProgress();
  }
}

// Checkpoint functions
export function saveCheckpoint(label = 'Manual') {
  try {
    const currentData = loadQuestions();
    const checkpoints = getAllCheckpoints();
    
    const newCheckpoint = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      data: currentData,
      questionCount: flattenQuestions(currentData).length,
      label: label
    };
    
    // Add new checkpoint and keep only the most recent MAX_CHECKPOINTS
    checkpoints.unshift(newCheckpoint);
    if (checkpoints.length > MAX_CHECKPOINTS) {
      checkpoints.splice(MAX_CHECKPOINTS);
    }
    
    localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(checkpoints));
    return true;
  } catch (e) {
    console.error('Failed to save checkpoint', e);
    return false;
  }
}

export function restoreCheckpoint(checkpointId) {
  try {
    const checkpoints = getAllCheckpoints();
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }
    
    localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(checkpoint.data));
    return checkpoint.data;
  } catch (e) {
    console.error('Failed to restore checkpoint', e);
    throw e;
  }
}

export function getAllCheckpoints() {
  try {
    const checkpointsData = localStorage.getItem(CHECKPOINTS_KEY);
    if (!checkpointsData) {
      return [];
    }
    return JSON.parse(checkpointsData);
  } catch (e) {
    console.error('Failed to get checkpoints', e);
    return [];
  }
}

export function hasCheckpoint() {
  return getAllCheckpoints().length > 0;
}

export function getCheckpointInfo() {
  const checkpoints = getAllCheckpoints();
  if (checkpoints.length === 0) {
    return null;
  }
  // Return the most recent checkpoint info
  const latest = checkpoints[0];
  return {
    timestamp: latest.timestamp,
    questionCount: latest.questionCount,
    date: new Date(latest.timestamp),
    label: latest.label
  };
}

export function deleteCheckpoint(checkpointId) {
  try {
    const checkpoints = getAllCheckpoints();
    const filtered = checkpoints.filter(cp => cp.id !== checkpointId);
    localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Failed to delete checkpoint', e);
    return false;
  }
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

// CSV Parsing Functions
export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }
  
  return rows;
}

export function convertCSVToQuestions(rows, existingData) {
  // Get the highest question ID from existing data
  const flat = flattenQuestions(existingData);
  let maxId = flat.reduce((max, q) => Math.max(max, q.id || 0), 0);
  
  const clusterMap = new Map();
  
  // First, add all existing clusters and topics
  (existingData.clusters || []).forEach(cluster => {
    clusterMap.set(cluster.name, {
      name: cluster.name,
      topics: cluster.topics.map(topic => ({
        name: topic.name,
        questions: [...topic.questions]
      }))
    });
  });
  
  // Now add new questions from CSV
  rows.forEach(row => {
    const clusterName = row.cluster;
    const topicName = row.topic;
    
    if (!clusterMap.has(clusterName)) {
      clusterMap.set(clusterName, {
        name: clusterName,
        topics: []
      });
    }
    
    const cluster = clusterMap.get(clusterName);
    let topic = cluster.topics.find(t => t.name === topicName);
    
    if (!topic) {
      topic = {
        name: topicName,
        questions: []
      };
      cluster.topics.push(topic);
    }
    
    // Create question object with new field structure
    const question = {
      id: ++maxId,
      questionText: row.questionText || '',
      questionLatex: row.questionLatex || '',
      hint: row.hint || '',
      answer: row.answer || '',
      answerLatex: row.answerLatex || '',
      solutionText: row.solutionText || '',
      solutionLatex: row.solutionLatex || ''
    };
    
    topic.questions.push(question);
  });
  
  return {
    clusters: Array.from(clusterMap.values())
  };
}

export async function importCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const rows = parseCSV(csvText);
        
        if (rows.length === 0) {
          reject(new Error('CSV file is empty or invalid'));
          return;
        }
        
        // Save checkpoint before importing
        saveCheckpoint('Before Import');
        
        const currentData = loadQuestions();
        const newData = convertCSVToQuestions(rows, currentData);
        
        saveQuestions(newData);
        
        resolve({
          questionsAdded: rows.length,
          totalQuestions: flattenQuestions(newData).length
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}
