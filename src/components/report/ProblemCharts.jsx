import React from 'react';
import {
  ChartCard, SHAPPanel,
  ROCChart, PRChart, ConfusionMatrix,
  ResidualsChart, ActualVsPredicted,
  ForecastChart, MAPEByHorizonBars,
  PRCurveImbalanced, RecallAtFPRBars,
  ClusterDistributionBar, SilhouetteBars, ElbowCurve,
  AnomalyHistogram, ContaminationDonut,
  SelfTrainingAUCCurve, ConfidenceDistribution, CoverageVsIterations,
} from '../primitives';

/**
 * Problem-type-aware chart grid — one of seven branches based on
 * `scenario.problemType`. Used inside every Report layout.
 *
 *   classification    → ROC + PR + Confusion Matrix
 *   regression        → Residuals (wide) + Actual-vs-Predicted (narrow)
 *   forecast          → 90-day forecast (wide) + MAPE-by-horizon (narrow)
 *   imbalanced        → PR + Recall@FPR + Confusion Matrix
 *   clustering        → Distribution + Silhouette + Elbow
 *   anomaly           → Histogram + Contamination gauge + Anomaly SHAP
 *   semisupervised    → Self-Training AUC + Confidence Dist + Coverage
 */
export default function ProblemCharts({ scenario, theme }) {
  switch (scenario.problemType) {
    case 'classification':
      return (
        <div style={grid3}>
          <ChartCard title="ROC Curve" subtitle={`AUC = ${scenario.kpis[0].value.toFixed(4)}`} theme={theme}>
            <ROCChart theme={theme} />
          </ChartCard>
          <ChartCard title="Precision–Recall" subtitle="positive class · AP = 0.961" theme={theme}>
            <PRChart theme={theme} />
          </ChartCard>
          <ChartCard
            title="Confusion Matrix"
            subtitle={`threshold = ${scenario.confusion.threshold.toFixed(2)}`}
            theme={theme}
          >
            <ConfusionMatrix theme={theme} c={scenario.confusion} />
          </ChartCard>
        </div>
      );

    case 'regression':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <ChartCard
            title="Residuals vs Predicted"
            subtitle="looking for heteroscedasticity — none visible"
            theme={theme}
          >
            <ResidualsChart theme={theme} />
          </ChartCard>
          <ChartCard
            title="Actual vs Predicted"
            subtitle={`R² = ${scenario.kpis[0].value.toFixed(3)}`}
            theme={theme}
          >
            <ActualVsPredicted theme={theme} />
          </ChartCard>
        </div>
      );

    case 'forecast':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <ChartCard title="90-Day Forecast" subtitle="actual + forecast + 95% PI" theme={theme}>
            <ForecastChart theme={theme} />
          </ChartCard>
          <ChartCard title="MAPE by Horizon" subtitle="degrades gracefully" theme={theme}>
            <MAPEByHorizonBars theme={theme} />
          </ChartCard>
        </div>
      );

    case 'imbalanced':
      return (
        <div style={grid3}>
          <ChartCard
            title="Precision–Recall Curve"
            subtitle={`PR-AUC = ${scenario.kpis[0].value.toFixed(3)}`}
            theme={theme}
          >
            <PRCurveImbalanced theme={theme} />
          </ChartCard>
          <ChartCard title="Recall at FPR" subtitle="operating-point sweep" theme={theme}>
            <RecallAtFPRBars theme={theme} />
          </ChartCard>
          <ChartCard
            title="Confusion Matrix"
            subtitle={`threshold = ${scenario.confusion.threshold.toFixed(2)}`}
            theme={theme}
          >
            <ConfusionMatrix theme={theme} c={scenario.confusion} />
          </ChartCard>
        </div>
      );

    case 'clustering':
      return (
        <div style={grid3}>
          <ChartCard
            title="Cluster Distribution"
            subtitle={`k = ${scenario.clusters.length} · share of base`}
            theme={theme}
          >
            <ClusterDistributionBar clusters={scenario.clusters} theme={theme} />
          </ChartCard>
          <ChartCard title="Silhouette by Cluster" subtitle="higher = tighter cluster" theme={theme}>
            <SilhouetteBars clusters={scenario.clusters} theme={theme} />
          </ChartCard>
          <ChartCard title="Elbow / k Selection" subtitle="inertia drop · marker = chosen k" theme={theme}>
            <ElbowCurve theme={theme} />
          </ChartCard>
        </div>
      );

    case 'anomaly':
      return (
        <div style={grid3}>
          <ChartCard
            title="Anomaly Score Distribution"
            subtitle="bins above p99 → anomaly"
            theme={theme}
          >
            <AnomalyHistogram theme={theme} />
          </ChartCard>
          <ChartCard title="Contamination" subtitle="estimated outlier share" theme={theme}>
            <ContaminationDonut theme={theme} contaminationPct={scenario.kpis[0].value} />
          </ChartCard>
          {/* SHAPPanel already renders its own card chrome — drop into the grid directly */}
          <SHAPPanel
            features={scenario.features.slice(0, 5)}
            theme={theme}
            title="Top anomaly drivers"
          />
        </div>
      );

    case 'semisupervised':
      return (
        <div style={grid3}>
          <ChartCard title="Self-Training AUC" subtitle="lift across iterations" theme={theme}>
            <SelfTrainingAUCCurve curve={scenario.selfTrainingCurve} theme={theme} />
          </ChartCard>
          <ChartCard title="Confidence Distribution" subtitle="labeled vs pseudo" theme={theme}>
            <ConfidenceDistribution theme={theme} />
          </ChartCard>
          <ChartCard title="Pseudo-Label Coverage" subtitle="% high-confidence per iter" theme={theme}>
            <CoverageVsIterations curve={scenario.selfTrainingCurve} theme={theme} />
          </ChartCard>
        </div>
      );

    default:
      return null;
  }
}

const grid3 = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 14,
};
