/**
 * Per-scenario insights decks — variable slide count, action-title named.
 *
 * Slide schema:
 *   { kind: 'cover' }
 *     auto-rendered from scenario.name + scenario.goal
 *
 *   { kind: 'data-overview', actionTitle, stats: [{ label, value, sub }] }
 *
 *   { kind: 'action-title', title, subtitle?, ascii? }
 *     pure-text statement; transition / pivot moments
 *
 *   { kind: 'finding-with-chart', title, chart, bullets: [...], source? }
 *     chart key maps via CHART_REGISTRY in InsightsDeck.jsx
 *
 *   { kind: 'leaderboard', title, footnote? }
 *     reuses Leaderboard component
 *
 *   { kind: 'performance-hero', title, kpiIndex: 0, supportingKpis: [1, 2] }
 *     one giant KPI number + 2 smaller ones
 *
 *   { kind: 'shap-deep-dive', title, narrative? }
 *     reuses SHAPPanel component
 *
 *   { kind: 'cluster-persona', clusterId, action }
 *     clustering only — one slide per cluster
 *
 *   { kind: 'recommendation', title, actions: [{ verb, target, reason }] }
 *
 *   { kind: 'next-steps', title, items: [...], stamp? }
 *
 * Action-title rule: titles state the takeaway, not the topic.
 *   ✓ "Transaction frequency drives 55% of churn risk"
 *   ✗ "Feature Importance Analysis"
 */

export const DECKS = {
  // ─────────────────────────────────────────────────────────────────────
  // 1. CHURN — classification
  // ─────────────────────────────────────────────────────────────────────
  churn: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '10,127 cardholders, 21 signals, one prediction window.',
      stats: [
        { label: 'Rows',    value: '10,127',  sub: 'training + holdout' },
        { label: 'Columns', value: '21',      sub: '8 retained after VIF cull' },
        { label: 'Target',  value: 'churn_flag', sub: '16.07% positive class' },
        { label: 'Quality', value: 'HEALTHY',    sub: '0 nulls · 0 duplicates' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Transaction frequency is the dominant churn signal.',
      subtitle: 'Demographics appear nowhere in the top 20 features.',
    },

    {
      kind: 'finding-with-chart',
      title: 'Customers who transact less churn 4× as often.',
      chart: 'roc',
      bullets: [
        'total_trans_ct alone explains 31.2% of SHAP magnitude.',
        'Pair it with total_trans_amt and you cover 55%.',
        'Behavioral signals dominate; static profile fields are noise.',
      ],
      source: 'Held-out test set · n=2,026',
    },

    {
      kind: 'finding-with-chart',
      title: 'Engagement decay shows up months before churn.',
      chart: 'pr',
      bullets: [
        'months_inactive_12m is the #4 driver — leading indicator.',
        'Customers with 3+ inactive months churn at 38% (vs 16% base rate).',
        'A behavioral early-warning is cheaper than a fee-waiver after the fact.',
      ],
      source: 'Held-out test set',
    },

    {
      kind: 'finding-with-chart',
      title: 'At threshold 0.50, we miss only 41 churners in 326.',
      chart: 'confusion',
      bullets: [
        'False-positive rate 1.1% — precision-friendly tuning.',
        'False-negative rate 12.6% — acceptable for a retention queue.',
        'Threshold can be lowered to 0.35 to recover more recall if needed.',
      ],
      source: 'Confusion matrix at threshold 0.50',
    },

    {
      kind: 'leaderboard',
      title: 'XGBoost (tuned) wins by 0.7% AUC over the next-best candidate.',
      footnote: 'Top three within noise. Brahma chose the simpler parameterisation per Occam.',
    },

    {
      kind: 'performance-hero',
      title: 'ROC-AUC = 0.9931 on the held-out test set.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'shap-deep-dive',
      title: 'Top 3 features account for 73% of every prediction.',
      narrative:
        'Transaction frequency (31%), transaction amount (24%), and revolving balance (18%) are the load-bearing signals. Below that, recency-of-activity and inactivity months round out the top 5. Brahma surfaced no profile-level surprises.',
    },

    {
      kind: 'recommendation',
      title: 'Deploy weekly. Score above 0.35 → retention queue.',
      actions: [
        { verb: 'Deploy',   target: 'predict_brahma() as a weekly batch job',         reason: 'Drift expected to be slow; daily is overkill.' },
        { verb: 'Route',    target: 'every customer scoring above 0.35 to retention', reason: 'Tier captures 89% of true churners with manageable volume.' },
        { verb: 'Re-train', target: 'monthly with the most recent 90-day window',     reason: 'Feature drift is concentrated in transaction-velocity features.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. ROC-AUC 0.9931. Ready for production.',
      items: [
        'Stand up A/B test: control vs. retention-queue intervention, 8-week horizon.',
        'Wire feature drift monitoring on total_trans_ct + months_inactive_12m.',
        'Hand the dashboard to the retention team for daily triage.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 2. LTV — regression
  // ─────────────────────────────────────────────────────────────────────
  ltv: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '48,302 customers across 14 transactional signals.',
      stats: [
        { label: 'Rows',    value: '48,302',     sub: '24-month observation window' },
        { label: 'Columns', value: '14',         sub: '10 retained after multicollinearity check' },
        { label: 'Target',  value: 'ltv_24m_usd', sub: 'continuous · USD · log-transformed' },
        { label: 'Quality', value: 'HEALTHY',    sub: '0.4% imputed for tenure_days' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Order frequency × basket size drive 52% of lifetime value.',
      subtitle: 'Tenure adds a steady boost; return rate is a measurable drag.',
    },

    {
      kind: 'finding-with-chart',
      title: 'Residuals are tight and unbiased across the spend range.',
      chart: 'residuals',
      bullets: [
        'Heteroscedasticity check: PASS — variance is constant.',
        'Residual mean = 0.003 — no systematic over/under-prediction.',
        'Outliers concentrated in the long-tail high-LTV cluster (top 1%).',
      ],
      source: 'Residuals on n=9,660 holdout',
    },

    {
      kind: 'finding-with-chart',
      title: 'Predictions track actual within ±$219 RMSE.',
      chart: 'actualVsPredicted',
      bullets: [
        'Diagonal alignment is tight from $0 → $3,500 LTV bucket.',
        'Above $3,500 the model under-predicts by ~$200 on average.',
        'Acceptable for marketing-spend allocation. Re-visit if used for credit.',
      ],
      source: 'Test set · USD',
    },

    {
      kind: 'leaderboard',
      title: 'XGBoost (tuned) leads R² = 0.812. LightGBM trails by 0.6%.',
      footnote: 'Linear baseline at 0.621 — confirms we need non-linear feature interactions.',
    },

    {
      kind: 'performance-hero',
      title: 'R² = 0.812 · MAE = $142.30 · RMSE = $218.90.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'shap-deep-dive',
      title: 'AOV and purchase frequency together carry 52% of predictive load.',
      narrative:
        'Average order value (29%) and purchase frequency (23%) are the load-bearing pair. Tenure days adds 16% — long-tenure cohorts show 2.4× higher LTV than 30-day cohorts. Return rate is a moderate drag at 8% but matters disproportionately for high-AOV customers.',
    },

    {
      kind: 'recommendation',
      title: 'Use predicted LTV to gate concierge onboarding spend.',
      actions: [
        { verb: 'Score',   target: 'every new customer at day 30',                    reason: 'Earliest signal stable enough to act on; avoid month-1 noise.' },
        { verb: 'Route',   target: 'top quintile (predicted ≥ $1,800) to concierge',  reason: 'Concierge ROI clears at LTV $1,500+ in current bookings.' },
        { verb: 'Suppress', target: 'promo discounts for predicted ≥ $2,500 customers', reason: 'Discount erodes margin on a cohort already willing to pay full.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. R² 0.812. LTV scoring is production-ready.',
      items: [
        'Plug predict_brahma() into the day-30 onboarding job.',
        'Revisit the $3,500+ under-prediction with a stratified hold-out next quarter.',
        'Pair LTV with the churn model — the joint score drives expected NPV.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 3. FORECAST — time series
  // ─────────────────────────────────────────────────────────────────────
  forecast: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '4 years of daily sales across 42 SKUs.',
      stats: [
        { label: 'Rows',    value: '61,320',  sub: '4 years × 42 SKUs × ~365 days' },
        { label: 'Columns', value: '8',       sub: 'plus 12 engineered lag/seasonality features' },
        { label: 'Target',  value: 'units_sold', sub: 'daily · positive integer' },
        { label: 'Quality', value: 'HEALTHY',    sub: '0.2% stockout days flagged' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Weekly lag dominates; holidays barely matter.',
      subtitle: '52-week seasonality is modest — this business has limited annual rhythm.',
    },

    {
      kind: 'finding-with-chart',
      title: '90-day forecast tracks actual within 8.4% MAPE.',
      chart: 'forecast',
      bullets: [
        '95% prediction interval covers 94% of held-out points.',
        'Confidence widens around promo windows — expected.',
        'No systematic bias in any quarter.',
      ],
      source: 'Holdout · last 90 days',
    },

    {
      kind: 'finding-with-chart',
      title: 'Error grows gracefully with forecast horizon.',
      chart: 'mapeByHorizon',
      bullets: [
        '7-day MAPE 4.2% → 90-day MAPE 8.4% — sub-linear degradation.',
        'Acceptable for inventory ordering at any horizon.',
        'Re-forecasting weekly cuts realised error in half.',
      ],
      source: 'MAPE per horizon · holdout',
    },

    {
      kind: 'action-title',
      title: 'Lag-7 carries a third of next-day variance on its own.',
      subtitle: 'Lag-30 + weekly seasonality complete the top three drivers.',
    },

    {
      kind: 'leaderboard',
      title: 'N-BEATS edges LightGBM by 0.4 MAE on the 90-day horizon.',
      footnote: 'Ensembling rejected — N-BEATS already captures the seasonality LightGBM picked up.',
    },

    {
      kind: 'performance-hero',
      title: 'MAPE 8.4% · 95% PI coverage 0.94 · 212K pred/sec.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'recommendation',
      title: 'Re-forecast weekly. Pre-position inventory at +1.5σ of forecast.',
      actions: [
        { verb: 'Schedule',     target: 'a weekly re-forecast every Monday 02:00 UTC', reason: 'Weekly cadence halves error vs. monthly.' },
        { verb: 'Pre-position', target: 'inventory at forecast + 1.5σ',                reason: 'Stockout cost > carrying cost at this margin profile.' },
        { verb: 'Trigger',      target: 'a promo when 14-day forecast drops 15%+',     reason: 'Promo lift kicks in fast; lead time is real.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. 90-day MAPE 8.4%. Ship to ops.',
      items: [
        'Hand the dashboard to the inventory team — they own the order-quantity loop.',
        'Add SKU-level promo flags — current model treats promos as global.',
        'Re-evaluate the 52-week feature in 6 months once we have more annual data.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 4. FRAUD — imbalanced binary
  // ─────────────────────────────────────────────────────────────────────
  fraud: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '1.2M transactions, 0.34% are fraud.',
      stats: [
        { label: 'Rows',     value: '1.2M',  sub: '90 days · cards × merchants' },
        { label: 'Columns',  value: '18',    sub: '3 ratio + 4 z-score features added' },
        { label: 'Positive', value: '0.34%', sub: '4,116 fraud / 1.2M total' },
        { label: 'Quality',  value: 'HEALTHY', sub: 'temporal split · no leakage' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Catch 76% of fraud at a 0.1% false-positive rate.',
      subtitle: 'Amount z-score + merchant risk are the load-bearing signals.',
    },

    {
      kind: 'finding-with-chart',
      title: 'PR-AUC 0.847 on a 0.34% positive class.',
      chart: 'prImbalanced',
      bullets: [
        'PR is the right curve here — ROC inflates with class imbalance.',
        'Curve stays above 0.4 precision until 80% recall.',
        'Operating point at 0.1% FPR sits in the steep region.',
      ],
      source: 'Holdout · 600K transactions',
    },

    {
      kind: 'finding-with-chart',
      title: 'At our chosen 0.1% FPR, we recover 76.3% of fraud.',
      chart: 'recallAtFpr',
      bullets: [
        '1,204 false positives in 1.2M transactions — review-team scale.',
        'Doubling FPR to 0.2% recovers another 8 points of recall.',
        'Trade-off curve is monotone; tune by review-team capacity.',
      ],
      source: 'Holdout · operating points',
    },

    {
      kind: 'finding-with-chart',
      title: 'False positives concentrate at high-amount low-risk merchants.',
      chart: 'confusion',
      bullets: [
        'TN = 1.196M — model is correctly conservative on the bulk.',
        'FP = 1,204 — manageable manual review queue.',
        'FN = 973 — the 24% we miss skew toward low-amount card-not-present.',
      ],
      source: 'Confusion matrix at 0.1% FPR',
    },

    {
      kind: 'leaderboard',
      title: 'XGBoost (tuned) edges IsolationForest+XGB hybrid by 0.2 PR-AUC.',
      footnote: 'Hybrid not worth the operational complexity for the marginal lift.',
    },

    {
      kind: 'performance-hero',
      title: 'PR-AUC 0.847 · 395K pred/sec at 1.4ms p95.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'shap-deep-dive',
      title: 'Three signals — amount, merchant, geography — carry 77% of decisions.',
      narrative:
        'Extreme z-scored amounts at high-risk merchants drive most of the recall. Geographic velocity (distance from home) is the third-strongest signal. Device freshness mattered less than expected — fraudsters reuse devices more than the literature suggests.',
    },

    {
      kind: 'recommendation',
      title: 'Decline at threshold 0.50. Step-up auth at 0.30. Pass below.',
      actions: [
        { verb: 'Decline', target: 'transactions scoring ≥ 0.50',     reason: 'Captures 76% of fraud at 0.1% false-positives. SLA-friendly latency.' },
        { verb: 'Step-up', target: 'transactions scoring 0.30 – 0.50', reason: 'Recovers another 12 points of recall through 3DS challenge.' },
        { verb: 'Log',     target: 'decisions and outcomes for daily review', reason: 'Threshold and feature drift can move within hours during attacks.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. PR-AUC 0.847. Ready for the gate.',
      items: [
        'Wire predict_brahma() into the authorisation gateway with 5ms SLA.',
        'Stand up daily metric review with the fraud-ops team.',
        'Add device + biometric features in v2 — they will move the needle on CNP.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 5. SEGMENTATION — clustering (5 cluster-persona slides)
  // ─────────────────────────────────────────────────────────────────────
  segmentation: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '32,400 customers profiled across 18 behavioural features.',
      stats: [
        { label: 'Rows',    value: '32,400', sub: '90-day behavioural window' },
        { label: 'Columns', value: '18',     sub: 'RFM + ratios + breadth' },
        { label: 'Target',  value: '(none)', sub: 'unsupervised · no labels' },
        { label: 'Quality', value: 'HEALTHY', sub: 'log-scaled monetary · whitened features' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Five distinct customer segments emerge from RFM + breadth.',
      subtitle: 'Two clusters cover 60% of revenue but only 25% of customers.',
    },

    {
      kind: 'finding-with-chart',
      title: 'Mainstream Loyalists are 32% of base; VIPs are 7%.',
      chart: 'clusterDistribution',
      bullets: [
        'Cluster sizes match a long-tail revenue distribution.',
        'Premium + VIP together = 25% of base, ~60% of revenue.',
        'No tiny clusters — k-means converged on a stable carve.',
      ],
      source: 'Cluster assignments · n=32,400',
    },

    {
      kind: 'finding-with-chart',
      title: 'Silhouette ≥ 0.55 on every cluster — separation is real.',
      chart: 'silhouette',
      bullets: [
        'Mean silhouette 0.68 across the dataset.',
        'No cluster below 0.55 — every persona is internally coherent.',
        'Davies-Bouldin 0.74 confirms the carve is stable.',
      ],
      source: 'Silhouette samples per cluster',
    },

    {
      kind: 'finding-with-chart',
      title: 'k=5 wins on the elbow, silhouette, and stability checks.',
      chart: 'elbow',
      bullets: [
        'Inertia drops 64% between k=2 and k=5; flattens after.',
        'Silhouette peaks at k=5 (0.68) and drops at k=7.',
        'k-means and Gaussian Mixture both pick 5 independently.',
      ],
      source: 'k = 2..8 sweep',
    },

    { kind: 'cluster-persona', clusterId: 0 },
    { kind: 'cluster-persona', clusterId: 1 },
    { kind: 'cluster-persona', clusterId: 2 },
    { kind: 'cluster-persona', clusterId: 3 },
    { kind: 'cluster-persona', clusterId: 4 },

    {
      kind: 'leaderboard',
      title: 'KMeans (k=5) ties Gaussian Mixture; Brahma chose the simpler.',
      footnote: 'DBSCAN wandered on the long tail. Hierarchical clustering matched but at 4× the inference cost.',
    },

    {
      kind: 'performance-hero',
      title: 'Silhouette 0.68 · Davies-Bouldin 0.74 · 5 clusters.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'recommendation',
      title: 'Run a journey per persona. VIP gets concierge; Bargain gets bundles.',
      actions: [
        { verb: 'Stand up', target: 'persona-tagged customer events in CDP',   reason: 'Every downstream tool can branch on cluster id.' },
        { verb: 'Build',    target: 'a marketing journey per persona',          reason: 'One-size-fits-all underperforms persona-tuned by ~22% LTV in benchmark.' },
        { verb: 'Re-cluster', target: 'quarterly with the most recent 90 days', reason: 'RFM drifts; personas should not be hard-coded forever.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. 5 personas mapped. Hand off to growth.',
      items: [
        'Persona ids land in the marketing automation tool by next week.',
        'VIP retention KPI moves to the executive dashboard.',
        'Re-cluster quarterly — flag if any persona drifts more than 15% in size.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 6. ANOMALY — unsupervised outlier detection
  // ─────────────────────────────────────────────────────────────────────
  anomaly: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '2.4M unlabelled transactions screened for outliers.',
      stats: [
        { label: 'Rows',    value: '2.4M',   sub: 'unlabelled · 30-day window' },
        { label: 'Columns', value: '16',     sub: '4 z-score + 3 rarity features' },
        { label: 'Target',  value: '(none)', sub: 'unsupervised · contamination = 2.3%' },
        { label: 'Quality', value: 'HEALTHY', sub: 'whitened · no leakage' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Amount + merchant rarity isolate the top 2.3% of transactions.',
      subtitle: 'Two thirds of high-anomaly cases involve an extreme amount or a never-seen merchant.',
    },

    {
      kind: 'finding-with-chart',
      title: 'The score distribution is heavy-tailed — outliers stand out.',
      chart: 'anomalyHistogram',
      bullets: [
        'p99 cutoff lands at 0.84 — clean break from the mass.',
        'Below 0.3, the bulk of normal traffic clusters tightly.',
        'No second mode in the middle — the boundary is sharp.',
      ],
      source: 'Score distribution · n=2.4M',
    },

    {
      kind: 'finding-with-chart',
      title: 'Estimated contamination is 2.3% — review-team capacity fits.',
      chart: 'contamination',
      bullets: [
        'IsolationForest tuned with contamination = 0.023.',
        'Cross-validated against synthetic injected anomalies (AUC 0.913).',
        'Volume = ~55K flagged transactions / month — review-team OK.',
      ],
      source: 'Synthetic-label cross-validation',
    },

    {
      kind: 'shap-deep-dive',
      title: 'Amount z-score + merchant rarity carry 56% of the anomaly score.',
      narrative:
        'amount_zscore (32%) and merchant_rarity (25%) are the load-bearing pair. time-of-day oddness adds 16% — late-night transactions on accounts that never transact at night are flagged disproportionately. velocity_z and geo_distance_z complete the top five.',
    },

    {
      kind: 'leaderboard',
      title: 'IsolationForest (tuned) wins on Score-AUC. Autoencoder a close second.',
      footnote: 'Autoencoder catches a different slice — worth ensembling later, but not now.',
    },

    {
      kind: 'performance-hero',
      title: 'Score AUC 0.913 · contamination 2.3% · 320K scores/sec.',
      kpiIndex: 1,
      supportingKpis: [0, 2, 3],
    },

    {
      kind: 'recommendation',
      title: 'Block ≥ 0.84. Step-up between 0.40 and 0.84. Pass below.',
      actions: [
        { verb: 'Block',   target: 'transactions with anomaly score ≥ 0.84',     reason: 'p99 cutoff isolates the top 2.3% — fraud-ops capacity holds.' },
        { verb: 'Step-up', target: 'transactions in the 0.40 – 0.84 band',       reason: 'SUSPECT tier — surface friction without auto-blocking.' },
        { verb: 'Re-fit',  target: 'monthly on a rolling 90-day window',          reason: 'Concept drift in fraud is fast; merchant rarity especially.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. 2.3% contamination · approved for screening.',
      items: [
        'Stand up the anomaly-score feed in the fraud-ops dashboard.',
        'Compare against the supervised fraud model for overlap analysis.',
        'Re-fit monthly; trip an alarm if contamination shifts >0.5% in a week.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // 7. LOAN SEMI-SUPERVISED — self-training
  // ─────────────────────────────────────────────────────────────────────
  loanSemiSup: [
    { kind: 'cover' },

    {
      kind: 'data-overview',
      actionTitle: '210K loans, only 15% labelled, 85% sitting unused.',
      stats: [
        { label: 'Rows',         value: '210K',  sub: '24-month performance window' },
        { label: 'Columns',      value: '26',    sub: 'credit + employment + behavioural' },
        { label: 'Labelled',     value: '15%',   sub: '31,500 with default outcome' },
        { label: 'Quality',      value: 'HEALTHY', sub: 'no leakage between labelled and pseudo' },
      ],
    },

    {
      kind: 'action-title',
      title: 'Self-training lifts AUC by 6.8 points using the unlabelled pool.',
      subtitle: 'The 85% of loans without outcomes were doing nothing — until now.',
    },

    {
      kind: 'finding-with-chart',
      title: 'AUC climbs from 0.823 to 0.891 across 4 self-training iterations.',
      chart: 'selfTrainingAuc',
      bullets: [
        'Iter 0 (labelled-only) baseline = 0.823.',
        'Iter 4 (converged) = 0.891 — closes 65% of the gap to a fully-supervised oracle.',
        'Convergence: AUC delta < 0.005 between iter 3 and iter 4.',
      ],
      source: 'Held-out test set · same across iterations',
    },

    {
      kind: 'finding-with-chart',
      title: 'High-confidence pseudo-labels separate cleanly from labelled ones.',
      chart: 'confidenceDist',
      bullets: [
        'Pseudo-label confidence concentrates ≥ 0.85 — our threshold τ.',
        'Labelled-region confidence has a wider spread.',
        'No overlap suggests pseudo-labels are not contaminated.',
      ],
      source: 'Confidence histogram · final iteration',
    },

    {
      kind: 'finding-with-chart',
      title: 'Coverage climbs from 15% to 71% as confidence grows.',
      chart: 'coverage',
      bullets: [
        '47-point coverage lift over 4 iterations.',
        'No collapse — pseudo-labels add information without dominating.',
        'Remaining 29% are genuine edge cases — tagged for human review.',
      ],
      source: 'Pseudo-label coverage · per iter',
    },

    {
      kind: 'leaderboard',
      title: 'Self-Training (XGBoost) tops Co-Training by 0.9% AUC.',
      footnote: 'LabelPropagation hits higher coverage (0.74) but lower AUC — drift in the unlabelled pool.',
    },

    {
      kind: 'performance-hero',
      title: 'Final AUC 0.891 · pseudo coverage 0.71 · 4 iterations.',
      kpiIndex: 0,
      supportingKpis: [1, 2, 3],
    },

    {
      kind: 'shap-deep-dive',
      title: 'DTI and credit score carry 52% of default risk.',
      narrative:
        'Debt-to-income ratio (29%) and credit score (23%) drive most of the signal. Loan-to-income (17%), employment tenure (11%), and prior delinquencies (7%) round out the top five. Confidence drops sharply in the bottom credit-score quintile — that band remains a labelled-only region.',
    },

    {
      kind: 'recommendation',
      title: 'Manual underwrite ≥ 0.6. Auto-approve below 0.35. Watch the rest.',
      actions: [
        { verb: 'Underwrite', target: 'loans scoring ≥ 0.6 manually',         reason: 'High default risk — judgment call is cheaper than the loss.' },
        { verb: 'Auto-approve', target: 'loans scoring < 0.35 at default rate', reason: 'Confidence is high; manual review here is pure cost.' },
        { verb: 'Re-train', target: 'as new outcomes mature, monthly',          reason: 'Each cohort that matures becomes labelled — the loop tightens.' },
      ],
    },

    {
      kind: 'next-steps',
      title: 'Pipeline complete. AUC 0.891. Production with confidence chip.',
      items: [
        'Roll out predict_brahma() with the labelled-vs-pseudo confidence chip.',
        'Stand up monthly re-training as more loans mature.',
        'Plan a co-training v2 — a second view (transactional behaviour) is in scope.',
      ],
      stamp: 'APPROVED FOR DEPLOYMENT',
    },
  ],
};

export function getDeckForScenario(scenarioId) {
  return DECKS[scenarioId] || [];
}
