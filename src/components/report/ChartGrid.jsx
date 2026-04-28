import React from 'react';
import { pipelinesApi } from '../../auth';
import ChartCard from '../primitives/ChartCard.jsx';

/**
 * Generic chart grid — renders whatever the engine produced under
 * runs/{id}/outputs/charts/. Each item is { kind, title, category, path }.
 *
 * Charts are grouped by category (evaluation, validation, training, etc.)
 * with a section header per group. The image src points to the
 * /api/pipelines/{runId}/files/{path} endpoint so cookie auth flows.
 */
export default function ChartGrid({ charts, runId, theme }) {
  if (!charts?.length) return null;

  const groups = groupByCategory(charts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(({ category, items }) => (
        <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              color: theme.fg2,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {prettyCategory(category)} · {items.length} chart{items.length === 1 ? '' : 's'}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: items.length === 1 ? '1fr' : 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            {items.map((c) => (
              <ChartCard key={c.path} title={c.title} subtitle={c.kind} theme={theme} height={260}>
                <img
                  src={pipelinesApi.fileUrl(runId, c.path)}
                  alt={c.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </ChartCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_ORDER = ['evaluation', 'validation', 'training', 'ensembling', 'eda'];
const CATEGORY_LABELS = {
  evaluation: 'Evaluation',
  validation: 'Validation',
  training: 'Training',
  ensembling: 'Ensembling',
  eda: 'Exploratory Data Analysis',
};

function prettyCategory(c) {
  return CATEGORY_LABELS[c] || c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function groupByCategory(charts) {
  const map = new Map();
  for (const c of charts) {
    const cat = c.category || 'other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(c);
  }
  const ordered = [];
  for (const c of CATEGORY_ORDER) if (map.has(c)) ordered.push({ category: c, items: map.get(c) });
  for (const [c, items] of map) if (!CATEGORY_ORDER.includes(c)) ordered.push({ category: c, items });
  return ordered;
}
