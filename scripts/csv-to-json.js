const fs = require('fs');
const path = require('path');

// Parse CSV file and convert to JSON structure
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
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

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line) {
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

// Convert CSV rows to the expected JSON structure
function convertToQuestionFormat(rows) {
  const clusterMap = new Map();
  let questionIdCounter = 1;
  
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
      id: questionIdCounter++,
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

// Main execution
const csvPath = path.join(__dirname, '../src/data/4.2.4, 4.3, 5.1.csv');
const jsonPath = path.join(__dirname, '../src/data/questions.json');

console.log('Reading CSV file:', csvPath);
const csvText = fs.readFileSync(csvPath, 'utf-8');

console.log('Parsing CSV...');
const rows = parseCSV(csvText);
console.log(`Parsed ${rows.length} questions`);

console.log('Converting to JSON format...');
const jsonData = convertToQuestionFormat(rows);

console.log('Writing JSON file:', jsonPath);
fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

console.log('Done! Created questions.json with:');
console.log(`- ${jsonData.clusters.length} clusters`);
jsonData.clusters.forEach(cluster => {
  console.log(`  - ${cluster.name}: ${cluster.topics.length} topics`);
  cluster.topics.forEach(topic => {
    console.log(`    - ${topic.name}: ${topic.questions.length} questions`);
  });
});
