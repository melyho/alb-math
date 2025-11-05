import React from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';

// Render a string that may include inline $...$ or block $$...$$ math.
export default function LatexText({ text }) {
  if (!text && text !== 0) return null;
  const parts = [];
  const regex = /(\$\$[^$]+\$\$|\$[^$]+\$)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const idx = match.index;
    if (idx > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, idx) });
    }
    const token = match[0];
    if (token.startsWith('$$')) {
      parts.push({ type: 'block', content: token.slice(2, -2) });
    } else {
      parts.push({ type: 'inline', content: token.slice(1, -1) });
    }
    lastIndex = idx + token.length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) });

  return (
    <span>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.content}</span>;
        if (p.type === 'inline') return <InlineMath key={i} math={p.content} />;
        return <BlockMath key={i} math={p.content} />;
      })}
    </span>
  );
}
