/**
 * Brahma scenarios — drives every KPI, chart, copy line, and layout decision.
 *
 * Each scenario carries:
 *   • problemType — picks the chart grid in ProblemCharts and the screen branch in LivePredict
 *   • agent       — which Brahma agent ran (supervised_learning_agent, unsupervised_learning_agent,
 *                   semi_supervised_agent, forecasting_agent)
 *   • features, kpis, models, finalModel, headline, narrative
 *   • liveInputs + scoreFn(inputs) → 0..1 for the Live Predictor
 *
 * The first 4 scenarios are ported verbatim from the Brahma Design System prototype.
 * The last 3 (segmentation, anomaly, loanSemiSup) cover unsupervised + semi-supervised
 * problem types so the UI exercises all four families from Brahma's taxonomy.
 */

export const SCENARIOS = {
  // ─────────────────────────────────────────────────────────────────────
  // 1. Supervised — Binary classification
  // ─────────────────────────────────────────────────────────────────────
  churn: {
    id: 'churn',
    name: 'Credit Card Churn',
    goal: 'Predict which credit card customers will churn next month',
    dataset: 'credit_card_customers.csv',
    dataSize: '10,127 rows · 21 cols · 5.2 MB',
    problemType: 'classification',
    subtype: 'Binary classification',
    agent: 'supervised_learning_agent',
    targetName: 'churn_flag',
    features: [
      { name: 'total_trans_ct',           v: 0.312 },
      { name: 'total_trans_amt',          v: 0.241 },
      { name: 'total_revolving_bal',      v: 0.178 },
      { name: 'months_inactive_12m',      v: 0.131 },
      { name: 'contacts_count_12m',       v: 0.098 },
      { name: 'total_relationship_count', v: 0.071 },
      { name: 'credit_limit',             v: 0.054 },
      { name: 'avg_utilization_ratio',    v: 0.042 },
    ],
    kpis: [
      { label: 'ROC-AUC',       value: 0.9931, fmt: '0.0000', sub: 'test set' },
      { label: 'F1',            value: 0.875,  fmt: '0.000',  sub: 'positive class' },
      { label: 'CV Gap',        value: 0.003,  fmt: '0.000',  sub: 'HEALTHY · no overfit' },
      { label: 'Predict Speed', value: 179000, fmt: 'int',    sub: 'pred/sec · p95 5.6ms', unit: '/s' },
    ],
    models: [
      { name: 'DummyClassifier',    auc: 0.5000, f1: 0.000, prec: 0.000, rec: 0.000 },
      { name: 'LogisticRegression', auc: 0.9121, f1: 0.742, prec: 0.788, rec: 0.701 },
      { name: 'RandomForest',       auc: 0.9812, f1: 0.851, prec: 0.869, rec: 0.834 },
      { name: 'XGBoost (default)',  auc: 0.9859, f1: 0.860, prec: 0.871, rec: 0.850 },
      { name: 'XGBoost (tuned)',    auc: 0.9931, f1: 0.875, prec: 0.884, rec: 0.867 },
      { name: 'LightGBM',           auc: 0.9901, f1: 0.870, prec: 0.876, rec: 0.864 },
    ],
    finalModel: 'XGBoost (tuned)',
    headline:  'Transaction frequency is the dominant churn signal.',
    narrative: 'Customers who transact less churn more. total_trans_ct and total_trans_amt together account for 55% of SHAP magnitude. Demographics appear nowhere in the top 20.',
    confusion: { tn: 1681, fp: 19, fn: 41, tp: 285, threshold: 0.50 },
    liveInputs: [
      { key: 'age',  label: 'Customer Age',               min: 20, max: 75, def: 46,   unit: 'yrs' },
      { key: 'txn',  label: 'Total Transactions (12 mo)', min: 5,  max: 80, def: 28,   unit: '' },
      { key: 'util', label: 'Credit Utilization Ratio',   min: 0,  max: 1,  def: 0.72, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: 'rel',  label: 'Relationship Length',        min: 3,  max: 60, def: 18,   unit: 'mo' },
    ],
    scoreFn: ({ age, txn, util, rel }) =>
      Math.max(0, Math.min(1,
        0.15 + util * 0.55 + (60 - txn) / 120 - (rel / 60) * 0.4 + (age - 40) / 200
      )),
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2. Supervised — Regression (continuous)
  // ─────────────────────────────────────────────────────────────────────
  ltv: {
    id: 'ltv',
    name: 'Customer Lifetime Value',
    goal: 'Estimate 24-month customer lifetime value in USD',
    dataset: 'customer_transactions.csv',
    dataSize: '48,302 rows · 14 cols · 12.4 MB',
    problemType: 'regression',
    subtype: 'Regression · continuous target',
    agent: 'supervised_learning_agent',
    targetName: 'ltv_24m_usd',
    displayMax: 5000,  // scoreFn returns 0..1 normalized; multiply by displayMax for $
    features: [
      { name: 'avg_order_value',    v: 0.288 },
      { name: 'purchase_frequency', v: 0.231 },
      { name: 'tenure_days',        v: 0.156 },
      { name: 'recency_days',       v: 0.134 },
      { name: 'return_rate',        v: 0.082 },
      { name: 'category_diversity', v: 0.047 },
      { name: 'promo_sensitivity',  v: 0.038 },
      { name: 'channel_web_share',  v: 0.024 },
    ],
    kpis: [
      { label: 'R²',            value: 0.812,  fmt: '0.000', sub: 'test set' },
      { label: 'MAE',           value: 142.30, fmt: '$0.00', sub: 'mean abs error' },
      { label: 'RMSE',          value: 218.90, fmt: '$0.00', sub: 'root mean sq error' },
      { label: 'Predict Speed', value: 84000,  fmt: 'int',   sub: 'pred/sec · p95 11ms', unit: '/s' },
    ],
    models: [
      { name: 'DummyRegressor',    r2: 0.000, mae: 412.0, rmse: 0 },
      { name: 'LinearRegression',  r2: 0.621, mae: 218.5, rmse: 312.4 },
      { name: 'RandomForest',      r2: 0.748, mae: 168.3, rmse: 251.6 },
      { name: 'XGBoost (default)', r2: 0.793, mae: 151.9, rmse: 229.0 },
      { name: 'XGBoost (tuned)',   r2: 0.812, mae: 142.3, rmse: 218.9 },
      { name: 'LightGBM',          r2: 0.806, mae: 144.8, rmse: 221.5 },
    ],
    finalModel: 'XGBoost (tuned)',
    headline:  'Order frequency and basket size drive 52% of lifetime value.',
    narrative: 'Average order value and purchase frequency together explain over half of LTV variance. Return rate is a moderate drag. Customers with tenure over 180 days show 2.4× higher LTV than 30-day cohorts.',
    liveInputs: [
      { key: 'aov',     label: 'Avg Order Value',    min: 10,  max: 500,  def: 120,  unit: '$' },
      { key: 'freq',    label: 'Purchase Frequency', min: 1,   max: 40,   def: 8,    unit: '/yr' },
      { key: 'tenure',  label: 'Tenure',             min: 30,  max: 1800, def: 540,  unit: 'days' },
      { key: 'returns', label: 'Return Rate',        min: 0,   max: 0.5,  def: 0.08, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' },
    ],
    scoreFn: ({ aov, freq, tenure, returns }) => {
      const ltv = aov * freq * (tenure / 365) * 2 * (1 - returns * 1.5);
      return Math.max(0, Math.min(1, ltv / 5000));
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3. Forecasting — Time series multi-horizon
  // ─────────────────────────────────────────────────────────────────────
  forecast: {
    id: 'forecast',
    name: 'Sales Forecast',
    goal: 'Forecast next-quarter sales for 42 SKUs',
    dataset: 'daily_sales_2022_2026.csv',
    dataSize: '61,320 rows · 8 cols · 7.8 MB',
    problemType: 'forecast',
    subtype: 'Time series · multi-horizon',
    agent: 'forecasting_agent',
    targetName: 'units_sold',
    displayMax: 200,
    features: [
      { name: 'lag_7',           v: 0.334 },
      { name: 'lag_30',          v: 0.287 },
      { name: 'seasonality_52w', v: 0.168 },
      { name: 'promo_active',    v: 0.089 },
      { name: 'price',           v: 0.058 },
      { name: 'day_of_week',     v: 0.031 },
      { name: 'stockout_prev',   v: 0.021 },
      { name: 'holiday_flag',    v: 0.012 },
    ],
    kpis: [
      { label: 'MAPE',          value: 8.4,    fmt: '0.0%', sub: '90-day horizon' },
      { label: 'SMAPE',         value: 7.9,    fmt: '0.0%', sub: 'symmetric error' },
      { label: 'Coverage 95',   value: 0.94,   fmt: '0.00', sub: 'prediction interval' },
      { label: 'Predict Speed', value: 212000, fmt: 'int',  sub: 'pred/sec · p95 3.1ms', unit: '/s' },
    ],
    models: [
      { name: 'SeasonalNaive',     r2: 0.000, mae: 0 },
      { name: 'ETS',               r2: 0.712, mae: 14.2 },
      { name: 'SARIMA',            r2: 0.741, mae: 12.8 },
      { name: 'Prophet',           r2: 0.768, mae: 11.4 },
      { name: 'LightGBM (direct)', r2: 0.842, mae: 8.9 },
      { name: 'N-BEATS',           r2: 0.851, mae: 8.4 },
    ],
    finalModel: 'N-BEATS',
    headline:  'Weekly lag dominates; holiday effects are negligible after lag terms.',
    narrative: 'Seven-day lag explains a third of next-day variance. Weekly seasonality and promos complete the top drivers. 52-week seasonality is modest — this business has limited annual rhythm.',
    liveInputs: [
      { key: 'lag7',  label: 'Last-Week Sales (lag 7)',   min: 0, max: 500, def: 120, unit: 'u' },
      { key: 'lag30', label: 'Last-Month Sales (lag 30)', min: 0, max: 500, def: 98,  unit: 'u' },
      { key: 'price', label: 'Unit Price',                min: 5, max: 50,  def: 24,  step: 0.5, unit: '$' },
      { key: 'promo', label: 'Promo Intensity',           min: 0, max: 1,   def: 0.3, step: 0.05, fmt: (v) => (v * 100).toFixed(0) + '%' },
    ],
    scoreFn: ({ lag7, lag30, price, promo }) => {
      const pred = lag7 * 0.55 + lag30 * 0.3 + promo * 30 - (price - 25) * 0.8;
      return Math.max(0, Math.min(1, pred / 200));
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4. Supervised — Imbalanced binary
  // ─────────────────────────────────────────────────────────────────────
  fraud: {
    id: 'fraud',
    name: 'Fraud Detection',
    goal: 'Flag fraudulent card transactions in real time',
    dataset: 'transactions_2026_q1.csv',
    dataSize: '1.2M rows · 18 cols · 284 MB',
    problemType: 'imbalanced',
    subtype: 'Imbalanced binary classification',
    agent: 'supervised_learning_agent',
    targetName: 'is_fraud',
    features: [
      { name: 'amount_zscore',       v: 0.342 },
      { name: 'merchant_risk_score', v: 0.251 },
      { name: 'distance_from_home',  v: 0.178 },
      { name: 'velocity_1h',         v: 0.094 },
      { name: 'time_since_prev',     v: 0.061 },
      { name: 'cnp_flag',            v: 0.038 },
      { name: 'device_new',          v: 0.024 },
      { name: 'cross_border',        v: 0.012 },
    ],
    kpis: [
      { label: 'PR-AUC',            value: 0.847,  fmt: '0.000', sub: 'class balance 0.34%' },
      { label: 'Recall @ 0.1% FPR', value: 0.763,  fmt: '0.000', sub: 'operating point' },
      { label: 'F1',                value: 0.702,  fmt: '0.000', sub: 'positive class' },
      { label: 'Predict Speed',     value: 395000, fmt: 'int',   sub: 'pred/sec · p95 1.4ms', unit: '/s' },
    ],
    models: [
      { name: 'DummyClassifier',     auc: 0.500, f1: 0.000 },
      { name: 'LogisticRegression',  auc: 0.891, f1: 0.412, prec: 0.388, rec: 0.438 },
      { name: 'RandomForest',        auc: 0.971, f1: 0.654, prec: 0.721, rec: 0.598 },
      { name: 'XGBoost (default)',   auc: 0.984, f1: 0.681, prec: 0.749, rec: 0.624 },
      { name: 'XGBoost (tuned)',     auc: 0.991, f1: 0.702, prec: 0.768, rec: 0.647 },
      { name: 'IsolationForest+XGB', auc: 0.989, f1: 0.695, prec: 0.758, rec: 0.641 },
    ],
    finalModel: 'XGBoost (tuned)',
    headline:  'Amount z-score + merchant risk catch 76% of fraud at 0.1% false positives.',
    narrative: 'Extreme-amount transactions at high-risk merchants account for the bulk of recall. Geographic velocity is the third-strongest signal. Device freshness matters less than expected.',
    confusion: { tn: 1196450, fp: 1204, fn: 973, tp: 3143, threshold: 0.50 },
    liveInputs: [
      { key: 'amt',      label: 'Amount (z-score)',    min: -2, max: 8,    def: 3.8, step: 0.1, fmt: (v) => v.toFixed(1) },
      { key: 'mrisk',    label: 'Merchant Risk Score', min: 0,  max: 100,  def: 68,  unit: '/100' },
      { key: 'dist',     label: 'Distance From Home',  min: 0,  max: 2000, def: 840, unit: 'km' },
      { key: 'velocity', label: 'Txns in Last Hour',   min: 0,  max: 20,   def: 6 },
    ],
    scoreFn: ({ amt, mrisk, dist, velocity }) => {
      const s = (amt / 8) * 0.45 + (mrisk / 100) * 0.25 + (dist / 2000) * 0.15 + (velocity / 20) * 0.15;
      return Math.max(0, Math.min(1, s));
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // 5. Unsupervised — Clustering (NEW)
  // ─────────────────────────────────────────────────────────────────────
  segmentation: {
    id: 'segmentation',
    name: 'Customer Segmentation',
    goal: 'Discover natural customer segments from behavioral features',
    dataset: 'customer_behavior_2026.csv',
    dataSize: '32,400 rows · 18 cols · 9.1 MB',
    problemType: 'clustering',
    subtype: 'Unsupervised · k-means',
    agent: 'unsupervised_learning_agent',
    targetName: '(none — unsupervised)',
    features: [
      { name: 'recency_days',      v: 0.298 },
      { name: 'monetary_total',    v: 0.241 },
      { name: 'frequency_90d',     v: 0.187 },
      { name: 'category_breadth',  v: 0.103 },
      { name: 'avg_basket_size',   v: 0.061 },
      { name: 'channel_diversity', v: 0.047 },
      { name: 'discount_uptake',   v: 0.038 },
      { name: 'session_count',     v: 0.025 },
    ],
    kpis: [
      { label: 'Silhouette',     value: 0.68,  fmt: '0.00',  sub: 'k=5 · cosine' },
      { label: 'Davies-Bouldin', value: 0.74,  fmt: '0.00',  sub: 'lower is better' },
      { label: 'Clusters (k)',   value: 5,     fmt: 'int',   sub: 'elbow + silhouette' },
      { label: 'Predict Speed',  value: 240000, fmt: 'int',  sub: 'assignments/sec', unit: '/s' },
    ],
    models: [
      { name: 'KMeans (k=3)',                silhouette: 0.51, db: 0.92 },
      { name: 'KMeans (k=5)',                silhouette: 0.68, db: 0.74 },
      { name: 'KMeans (k=7)',                silhouette: 0.61, db: 0.79 },
      { name: 'DBSCAN',                      silhouette: 0.49, db: 1.04 },
      { name: 'AgglomerativeHierarchical',   silhouette: 0.63, db: 0.81 },
      { name: 'GaussianMixture (k=5)',       silhouette: 0.66, db: 0.77 },
    ],
    finalModel: 'KMeans (k=5)',
    headline:  'Five distinct customer segments emerge from RFM + breadth.',
    narrative: 'Recency and monetary value drive most of the separation, with category breadth pulling apart loyalists from premium spenders. Two of the five clusters represent 60% of revenue but only 25% of customers — a clear focus zone for retention.',
    clusters: [
      { id: 0, name: 'Dormant Skeptics',      share: 0.15, color: '#9CA3AF', desc: 'Low recency, low spend, infrequent' },
      { id: 1, name: 'Bargain Hunters',       share: 0.28, color: '#D97706', desc: 'High discount uptake, low basket size' },
      { id: 2, name: 'Mainstream Loyalists',  share: 0.32, color: '#2563EB', desc: 'Steady cadence, average basket' },
      { id: 3, name: 'Premium Spenders',      share: 0.18, color: '#7C3AED', desc: 'High AOV, narrow categories' },
      { id: 4, name: 'VIP Champions',         share: 0.07, color: '#16A34A', desc: 'Top decile spend × frequency × breadth' },
    ],
    liveInputs: [
      { key: 'recency',   label: 'Recency',          min: 0,  max: 365, def: 28,  unit: 'days' },
      { key: 'frequency', label: 'Orders (90d)',     min: 0,  max: 40,  def: 6 },
      { key: 'monetary',  label: 'Spend (90d)',      min: 0,  max: 5000, def: 850, unit: '$' },
      { key: 'breadth',   label: 'Categories',       min: 1,  max: 12,  def: 4 },
    ],
    scoreFn: ({ recency, frequency, monetary, breadth }) => {
      // Heuristic that maps RFM-B to a 0..1 score the LivePredict will discretize into 5 clusters.
      const r = 1 - Math.min(1, recency / 365);
      const f = Math.min(1, frequency / 40);
      const m = Math.min(1, monetary / 5000);
      const b = Math.min(1, breadth / 12);
      return Math.max(0, Math.min(0.999, r * 0.30 + f * 0.30 + m * 0.30 + b * 0.10));
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // 6. Unsupervised — Anomaly detection (NEW)
  // ─────────────────────────────────────────────────────────────────────
  anomaly: {
    id: 'anomaly',
    name: 'Transaction Anomalies',
    goal: 'Surface anomalous transactions without labeled fraud examples',
    dataset: 'unlabeled_transactions_2026.csv',
    dataSize: '2.4M rows · 16 cols · 412 MB',
    problemType: 'anomaly',
    subtype: 'Unsupervised · isolation forest',
    agent: 'unsupervised_learning_agent',
    targetName: '(none — unsupervised)',
    features: [
      { name: 'amount_zscore',          v: 0.318 },
      { name: 'merchant_rarity',        v: 0.246 },
      { name: 'time_of_day_oddness',    v: 0.157 },
      { name: 'velocity_z',             v: 0.108 },
      { name: 'geo_distance_z',         v: 0.072 },
      { name: 'mcc_unusual_for_user',   v: 0.041 },
      { name: 'channel_first_time',     v: 0.031 },
      { name: 'currency_mismatch',      v: 0.027 },
    ],
    kpis: [
      { label: 'Contamination',  value: 2.3,    fmt: '0.0%',   sub: 'estimated outlier rate' },
      { label: 'Score AUC',      value: 0.913,  fmt: '0.000',  sub: 'vs synthetic labels' },
      { label: 'p99 Threshold',  value: 0.84,   fmt: '0.00',   sub: 'anomaly score cutoff' },
      { label: 'Predict Speed',  value: 320000, fmt: 'int',    sub: 'scores/sec', unit: '/s' },
    ],
    models: [
      { name: 'IsolationForest (default)', score: 0.872, contam: 0.024 },
      { name: 'IsolationForest (tuned)',   score: 0.913, contam: 0.023 },
      { name: 'LocalOutlierFactor',        score: 0.881, contam: 0.026 },
      { name: 'OneClassSVM (RBF)',         score: 0.842, contam: 0.029 },
      { name: 'Autoencoder (recon)',       score: 0.896, contam: 0.025 },
      { name: 'EllipticEnvelope',          score: 0.798, contam: 0.031 },
    ],
    finalModel: 'IsolationForest (tuned)',
    headline:  'Amount and merchant rarity isolate the top 2.3% of transactions.',
    narrative: 'Two thirds of high-anomaly transactions involve either an extreme z-scored amount or a merchant the user has never visited. Time-of-day oddness and velocity z-scores complete the top four signals.',
    // Anomaly tier thresholds applied in LivePredict — mirrored here so server can use them too
    anomalyTiers: { suspect: 0.4, anomaly: 0.7 },
    anomalyDisplayMax: 5,  // map 0..1 score → 0..5 display value
    liveInputs: [
      { key: 'amtZ',     label: 'Amount (z-score)',  min: -2, max: 8,  def: 0.4, step: 0.1, fmt: (v) => v.toFixed(1) },
      { key: 'merchant', label: 'Merchant Rarity',   min: 0,  max: 1,  def: 0.2, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' },
      { key: 'odd',      label: 'Time-of-Day Odd',   min: 0,  max: 1,  def: 0.3, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' },
      { key: 'vel',      label: 'Velocity (z)',      min: 0,  max: 6,  def: 1.2, step: 0.1, fmt: (v) => v.toFixed(1) },
    ],
    scoreFn: ({ amtZ, merchant, odd, vel }) => {
      const s = Math.max(0, amtZ / 8) * 0.40 + merchant * 0.30 + odd * 0.18 + (vel / 6) * 0.12;
      return Math.max(0, Math.min(1, s));
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // 7. Semi-supervised — Self-training with partial labels (NEW)
  // ─────────────────────────────────────────────────────────────────────
  loanSemiSup: {
    id: 'loanSemiSup',
    name: 'Loan Default (Partial Labels)',
    goal: 'Predict default risk when only 15% of historical loans are labeled',
    dataset: 'loans_partial_labels_2024_2026.csv',
    dataSize: '210,000 rows · 26 cols · 88 MB · 15% labeled',
    problemType: 'semisupervised',
    subtype: 'Semi-supervised · self-training',
    agent: 'semi_supervised_agent',
    targetName: 'default_flag',
    features: [
      { name: 'dti_ratio',              v: 0.287 },
      { name: 'credit_score',           v: 0.232 },
      { name: 'loan_to_income',         v: 0.171 },
      { name: 'months_employed',        v: 0.108 },
      { name: 'prior_delinquencies',    v: 0.072 },
      { name: 'revolving_utilization',  v: 0.051 },
      { name: 'inquiries_6mo',          v: 0.041 },
      { name: 'loan_purpose_consol',    v: 0.038 },
    ],
    kpis: [
      { label: 'Final AUC',          value: 0.891, fmt: '0.000', sub: 'after self-training' },
      { label: 'Labeled-Only AUC',   value: 0.823, fmt: '0.000', sub: 'baseline · labels only' },
      { label: 'Pseudo Coverage',    value: 0.71,  fmt: '0.00',  sub: 'fraction high-confidence' },
      { label: 'Iterations',         value: 4,     fmt: 'int',   sub: 'until convergence' },
    ],
    models: [
      { name: 'Supervised (labels only)', auc: 0.823, coverage: 0.15 },
      { name: 'Self-Training (Logistic)', auc: 0.851, coverage: 0.62 },
      { name: 'Self-Training (RF)',       auc: 0.874, coverage: 0.68 },
      { name: 'Self-Training (XGBoost)',  auc: 0.891, coverage: 0.71 },
      { name: 'Co-Training (2 views)',    auc: 0.882, coverage: 0.69 },
      { name: 'LabelPropagation',         auc: 0.866, coverage: 0.74 },
    ],
    finalModel: 'Self-Training (XGBoost)',
    headline:  'Self-training lifts AUC by 6.8 points using unlabeled loans.',
    narrative: 'Starting from 31,500 labeled loans, four self-training iterations confidently pseudo-labeled 71% of the unlabeled pool. The high-confidence pseudo-labels closed most of the AUC gap to a fully-supervised oracle. Confidence drops sharply in the bottom quintile of credit-score, where the labeled signal is weakest.',
    confusion: { tn: 38240, fp: 802, fn: 612, tp: 2346, threshold: 0.50 },
    selfTrainingCurve: [
      { iter: 0, auc: 0.823, coverage: 0.15 },
      { iter: 1, auc: 0.857, coverage: 0.42 },
      { iter: 2, auc: 0.876, coverage: 0.58 },
      { iter: 3, auc: 0.886, coverage: 0.66 },
      { iter: 4, auc: 0.891, coverage: 0.71 },
    ],
    liveInputs: [
      { key: 'dti',          label: 'DTI Ratio',           min: 0,    max: 0.6,  def: 0.32, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' },
      { key: 'creditScore',  label: 'Credit Score',        min: 500,  max: 850,  def: 680 },
      { key: 'loanToIncome', label: 'Loan / Income',       min: 0.5,  max: 8,    def: 3.4, step: 0.1, fmt: (v) => v.toFixed(1) + '×' },
      { key: 'employed',     label: 'Months Employed',     min: 0,    max: 240,  def: 36,  unit: 'mo' },
    ],
    scoreFn: ({ dti, creditScore, loanToIncome, employed }) => {
      const p =
        dti * 0.45 +
        (1 - (creditScore - 500) / 350) * 0.30 +
        Math.min(1, loanToIncome / 8) * 0.18 +
        (1 - Math.min(1, employed / 240)) * 0.07;
      return Math.max(0, Math.min(1, p));
    },
  },
};

// ════════════════════════════════════════════════════════════════════════
// PIPELINE STAGE SETS — picked per scenario by problemType
// ════════════════════════════════════════════════════════════════════════

// 13 stages — supervised classification, regression, forecast, imbalanced
// (source: agents/super_agent.md from the Brahma repo)
export const STAGES_SUPERVISED = [
  { n: '01', name: 'Data Ingestion',      detail: 'loading source · validating schema' },
  { n: '02', name: 'Data Quality',        detail: 'nulls · duplicates · type drift' },
  { n: '03', name: 'EDA',                 detail: 'distributions · correlations · outliers' },
  { n: '04', name: 'Feature Engineering', detail: 'derived features · multicollinearity' },
  { n: '05', name: 'Preprocessing',       detail: 'encode · scale · split' },
  { n: '06', name: 'Model Training',      detail: 'Optuna 50 trials · baseline vs candidates' },
  { n: '07', name: 'Evaluation',          detail: 'holdout metrics · SHAP · plots' },
  { n: '08', name: 'Validation',          detail: '10-fold CV · train/test gap · integrity' },
  { n: '09', name: 'Ensembling',          detail: "Occam's razor · final model selection" },
  { n: '10', name: 'UAT',                 detail: '6 pre-deployment checks' },
  { n: '11', name: 'Deployment',          detail: 'predict_brahma() · pred/sec' },
  { n: '12', name: 'Dashboard',           detail: 'generated Streamlit app' },
  { n: '13', name: 'Summary',             detail: 'CXO-ready executive report' },
];

// 11 stages — clustering, anomaly detection
export const STAGES_UNSUPERVISED = [
  { n: '01', name: 'Data Ingestion',         detail: 'loading source · validating schema' },
  { n: '02', name: 'Data Quality',           detail: 'nulls · duplicates · type drift' },
  { n: '03', name: 'EDA',                    detail: 'distributions · pairwise patterns' },
  { n: '04', name: 'Feature Engineering',    detail: 'RFM · ratios · log-transforms' },
  { n: '05', name: 'Preprocessing',          detail: 'scale · encode · whitening' },
  { n: '06', name: 'Clustering / Isolation', detail: 'k-means · DBSCAN · IsolationForest' },
  { n: '07', name: 'Cluster Profiling',      detail: 'persona description · share of base' },
  { n: '08', name: 'Dimensionality Reduction', detail: 'UMAP / t-SNE 2D layout' },
  { n: '09', name: 'Validation',             detail: 'silhouette · stability · contamination' },
  { n: '10', name: 'Dashboard',              detail: 'generated cluster explorer' },
  { n: '11', name: 'Summary',                detail: 'segment narrative + CXO summary' },
];

// 13 stages — semi-supervised self-training
export const STAGES_SEMISUPERVISED = [
  { n: '01', name: 'Data Ingestion',     detail: 'loading source · validating schema' },
  { n: '02', name: 'Data Quality',       detail: 'nulls · duplicates · label coverage' },
  { n: '03', name: 'EDA',                detail: 'labeled vs unlabeled distributions' },
  { n: '04', name: 'Feature Engineering', detail: 'derived features · multicollinearity' },
  { n: '05', name: 'Preprocessing',      detail: 'encode · scale · split labeled/unlabeled' },
  { n: '06', name: 'Supervised Seed',    detail: 'baseline classifier on labeled-only' },
  { n: '07', name: 'Pseudo-Labeling',    detail: 'high-confidence threshold τ=0.85' },
  { n: '08', name: 'Self-Training Loop', detail: 'iterate · expand labeled set · refit' },
  { n: '09', name: 'Evaluation',         detail: 'holdout metrics · SHAP · coverage' },
  { n: '10', name: 'Validation',         detail: 'CV · pseudo-label leakage check' },
  { n: '11', name: 'Deployment',         detail: 'predict_brahma() · confidence chip' },
  { n: '12', name: 'Dashboard',          detail: 'generated Streamlit app' },
  { n: '13', name: 'Summary',            detail: 'CXO-ready executive report' },
];

// Map a problemType to its stage set
const STAGE_MAP = {
  classification:  STAGES_SUPERVISED,
  regression:      STAGES_SUPERVISED,
  forecast:        STAGES_SUPERVISED,
  imbalanced:      STAGES_SUPERVISED,
  clustering:      STAGES_UNSUPERVISED,
  anomaly:         STAGES_UNSUPERVISED,
  semisupervised:  STAGES_SEMISUPERVISED,
};

export function getStagesForScenario(scenario) {
  if (!scenario) return STAGES_SUPERVISED;
  return STAGE_MAP[scenario.problemType] || STAGES_SUPERVISED;
}

// ════════════════════════════════════════════════════════════════════════
// LOG_FRAGMENTS — ambient streaming log noise for the Running screen
// Each entry is [class, text]; the screen renders them sequentially.
// Mix supervised + unsupervised + semi-sup flavored lines so all 7
// scenarios feel authentic when the Running screen is open.
// ════════════════════════════════════════════════════════════════════════
export const LOG_FRAGMENTS = [
  ['dim', '[stage_03]'], ['fg', ' EDA complete · '], ['ok', '6 charts'], ['fg', ' · transaction count is #1 predictor'],
  ['dim', '[stage_04]'], ['fg', ' engineered '], ['ok', '+5 features'], ['fg', ' · dropped 1 multicollinear (VIF > 8)'],
  ['dim', '[stage_06]'], ['fg', ' optuna · trial 23/50 · '], ['ok', 'AUC_val = 0.9917'],
  ['dim', '[stage_06]'], ['fg', ' optuna · trial 50/50 · '], ['ok', 'AUC_val = 0.9931'],
  ['dim', '[stage_07]'], ['fg', ' computing SHAP on 1,000 sampled rows…'],
  ['dim', '[stage_08]'], ['fg', ' 10-fold CV · '], ['ok', '0.985 ± 0.006'], ['fg', ' · gap 0.003 '], ['ok', 'HEALTHY'],
  ['dim', '[stage_09]'], ['fg', ' ensembling candidates rejected (Δ < 0.005 vs single) · '], ['ok', 'Occam: XGBoost_tuned'],
  ['dim', '[stage_10]'], ['fg', ' UAT · '], ['ok', '6/6 PASS'], ['fg', ' · APPROVED FOR DEPLOYMENT'],
  ['dim', '[stage_11]'], ['fg', ' deployment · predict_brahma() registered · '], ['ok', '179,243 pred/sec'],

  // Unsupervised flavor
  ['dim', '[stage_06]'], ['fg', ' KMeans · k=3..8 sweep · best k=5 · '], ['ok', 'silhouette = 0.68'],
  ['dim', '[stage_07]'], ['fg', ' profiling cluster 4 · '], ['ok', '7% of base · 23% of revenue'],
  ['dim', '[stage_08]'], ['fg', ' UMAP 2D · perplexity=30 · '], ['ok', 'separable layout'],
  ['dim', '[stage_06]'], ['fg', ' IsolationForest · 200 trees · '], ['ok', 'p99 score threshold = 0.84'],

  // Semi-supervised flavor
  ['dim', '[stage_06]'], ['fg', ' supervised seed (15% labeled) · '], ['ok', 'AUC = 0.823'],
  ['dim', '[stage_07]'], ['fg', ' pseudo-labeling · τ=0.85 · '], ['ok', '+47% coverage'],
  ['dim', '[stage_08]'], ['fg', ' self-training iter 4/4 · '], ['ok', 'AUC = 0.891 · converged'],
];
