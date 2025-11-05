import React from 'react';

export default function ClusterSelect({ clusters, onSelect }) {
  return (
    <div>
      <h2>Select a cluster</h2>
      <ul className="list">
        {clusters.map((c, idx) => (
          <li key={idx} onClick={() => onSelect(c)}>
            <strong>{c.name}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
