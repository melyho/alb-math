const fs = require('fs');
const path = require('path');

function readCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseCSVLine(line);
    // Pad or trim to headers length
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(row);
  }
  return { headers, rows };
}

function writeCSV(filePath, headers, rows) {
  const escapeField = (val) => {
    const s = (val ?? '').toString();
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [];
  lines.push(headers.join(','));
  for (const row of rows) {
    const line = headers.map(h => escapeField(row[h])).join(',');
    lines.push(line);
  }
  fs.writeFileSync(filePath, lines.join('\n'));
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map(s => s.trim());
}

function normalizeWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function toLatexAscii(s) {
  if (!s) return '';
  let out = s;
  // Fix common OCR/spacing artifact like 'isp = ' -> 'p = '
  out = out.replace(/^isp\s*=/i, 'p = ');
  out = out.replace(/≥/g, ' \\geq ').replace(/≤/g, ' \\leq ');
  out = out.replace(/>=/g, ' \\geq ').replace(/<=/g, ' \\leq ');
  out = out.replace(/−/g, '-');
  out = replaceFuncCall(out, 'sqrt', (arg) => `\\sqrt{${arg}}`);
  out = replaceFuncCall(out, 'ln', (arg) => `\\ln\\left(${arg}\\right)`);
  // e^(...) -> e^{...}
  out = replaceCaretParens(out);
  // absolute value: |...| -> \left|...\right|
  out = out.replace(/\|([^|]+)\|/g, (_m, inner) => `\\left|${inner}\\right|`);
  // replace union/intersection
  out = out.replace(/∪/g, '\\cup').replace(/∩/g, '\\cap');
  // fix " at " text inside latex context if present
  out = out.replace(/\bat\b/g, '\\text{ at }');
  return out;
}

function replaceFuncCall(s, name, replacer) {
  // Replace name(...) with provided latex replacer, supporting nested parens
  let i = 0;
  let out = '';
  while (i < s.length) {
    const idx = s.indexOf(name + '(', i);
    if (idx === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    const { content, endIdx } = extractParenContent(s, idx + name.length);
    if (endIdx === -1) {
      // no closing, just append rest and break
      out += s.slice(idx);
      break;
    }
    out += replacer(content);
    i = endIdx + 1;
  }
  return out;
}

function replaceCaretParens(s) {
  // x^(...) => x^{...}
  s = s.replace(/\^\(([^()]+)\)/g, (_m, inner) => `^{${inner}}`);
  // e^(...) already handled, but ensure other letters too: a^b where b is more than one char, user likely wrote x^(1/3)
  return s;
}

function extractParenContent(s, startIdxBeforeParen) {
  // startIdxBeforeParen points to index of '(' after function name
  const start = startIdxBeforeParen;
  if (s[start] !== '(') return { content: '', endIdx: -1 };
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) {
        // exclude wrapping parens
        return { content: s.slice(start + 1, i), endIdx: i };
      }
    }
  }
  return { content: '', endIdx: -1 };
}

function extractMathFromText(text) {
  const original = text || '';
  let remaining = original;
  const mathParts = new Set();

  const addPart = (m) => {
    let candidate = m.replace(/^(is|be|given by|equals)\s+/i, '');
    const trimmed = trimTrailingUnits(candidate);
    if (trimmed && !/^[A-Za-z\s]+$/.test(trimmed)) {
      mathParts.add(trimmed.trim());
    }
  };

  const patterns = [
    // Function assignment: C(x) = ..., N(x) = ...
    /\b[A-Za-z]\s*\(\s*[a-zA-Z]\s*\)\s*(?:<=|>=|=|<|>)\s*[^;]+/g,
    // Variable relations: p = ..., x = ..., x >= ..., p0 = ...
    /\b[a-zA-Z][a-zA-Z0-9]*\s*(?:<=|>=|=|<|>)\s*[^;]+/g,
    // Inequality chain: 0 ≤ x ≤ 40
    /\b-?\d+(?:\.\d+)?\s*(?:≤|>=|<=|<|>)\s*[a-zA-Z][a-zA-Z0-9]*\s*(?:≤|>=|<=|<|>)\s*-?\d+(?:\.\d+)?/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(remaining)) !== null) {
      addPart(m[0]);
    }
  }

  // Also split on semicolons in the original text for chained equations
  const semis = original.split(';');
  if (semis.length > 1) {
    for (const seg of semis) {
      if (/(=|<=|>=|≤|≥)/.test(seg) || /sqrt\(/.test(seg) || /\^/.test(seg)) {
        addPart(seg.trim());
      }
    }
  }

  // Remove collected math parts from remaining text
  for (const part of mathParts) {
    const safe = escapeRegExp(part);
    remaining = remaining.replace(new RegExp('\n?\s*' + safe + '\s*', 'g'), ' ');
  }
  remaining = normalizeWhitespace(remaining);
  return { cleanText: remaining, mathParts: Array.from(mathParts) };
}

function trimTrailingUnits(s) {
  // Remove trailing words like 'dollars', 'units', 'boxes', etc., after math
  let out = s.trim();
  // Drop trailing domain clauses starting with 'where'
  out = out.replace(/\s*,?\s*where\b.*$/i, '');
  // Drop trailing parenthetical domains like (0 <= x <= 15)
  out = out.replace(/\s*\(\s*[-\d\s\.]*\s*(?:≤|>=|<=|<|>)\s*[a-zA-Z][a-zA-Z0-9]*\s*(?:≤|>=|<=|<|>)\s*[-\d\s\.]*\)\s*$/g, '');
  out = out.replace(/\s*(dollars|units|boxes|people|per\s+week|per\s+month)\s*$/i, '');
  out = out.replace(/\s*prints will be sold.*$/i, '');
  // Cut off sentence continuations like '. Find ...'
  out = out.replace(/\.(?=\s*[A-Za-z]).*$/, '');
  // Trim trailing punctuation
  out = out.replace(/[\s,.;:]+$/, '');
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processRow(row) {
  let qText = row.questionText || '';
  let qLatex = row.questionLatex || '';

  // If questionLatex is empty or clearly not latex-rich, attempt extraction
  const shouldExtract = !qLatex || !/\\(frac|sqrt|ln|cup|cap|geq|leq)/.test(qLatex);

  if (shouldExtract) {
    const { cleanText, mathParts } = extractMathFromText(qText);
    if (!qLatex && mathParts.length > 0) {
      qLatex = mathParts.map(toLatexAscii).join('; ');
    } else if (qLatex) {
      qLatex = toLatexAscii(qLatex);
    }
    qText = cleanText;
  } else {
    // Normalize existing latex and also try to remove math remnants from text
    qLatex = toLatexAscii(qLatex);
    const { cleanText } = extractMathFromText(qText);
    qText = cleanText;
  }

  row.questionText = normalizeWhitespace(qText);
  row.questionLatex = normalizeWhitespace(qLatex);
  return row;
}

function main() {
  const inputPath = path.join(__dirname, '../src/data/all-questions.csv');
  const backupPath = path.join(__dirname, '../src/data/all-questions.backup.csv');
  const outputPath = path.join(__dirname, '../src/data/all-questions.cleaned.csv');

  console.log('Reading:', inputPath);
  const { headers, rows } = readCSV(inputPath);
  if (headers.length === 0) {
    console.error('No headers found. Exiting.');
    process.exit(1);
  }

  // Ensure required columns exist
  const required = ['cluster','topic','id','questionText','questionLatex','hint','answer','answerLatex','solutionText','solutionLatex'];
  for (const col of required) {
    if (!headers.includes(col)) headers.push(col);
  }

  const processed = rows.map(r => processRow({ ...r }));

  // Write cleaned file
  console.log('Writing cleaned CSV:', outputPath);
  writeCSV(outputPath, headers, processed);

  // Also create a backup of original if not exists
  if (!fs.existsSync(backupPath)) {
    console.log('Creating backup of original CSV:', backupPath);
    fs.copyFileSync(inputPath, backupPath);
  }

  console.log('Done. Review cleaned file and replace original if satisfied.');
}

if (require.main === module) {
  main();
}
