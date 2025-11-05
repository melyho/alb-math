import React from 'react';

export default function TopicSelect({ cluster, onBack, onSelect }) {
  return (
    <div>
      <div className="header">
        <h2>{cluster.name} — Topics</h2>
        <button className="btn" onClick={onBack}>Back</button>
      </div>

      <ul className="list">
        {cluster.topics.map((t, idx) => (
          <li key={idx} onClick={() => onSelect(t)}>
            <strong>{t.name}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
