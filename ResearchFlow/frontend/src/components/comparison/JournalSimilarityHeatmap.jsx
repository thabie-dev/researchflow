import Plot from 'react-plotly.js';

const HEATMAP_COLORS = [
  [0, '#2166ac'],
  [0.5, '#f7f7f7'],
  [1, '#b2182b'],
];

export default function JournalSimilarityHeatmap({ result }) {
  const cellText = [];
  for (const row of result.matrix) {
    const formattedRow = [];
    for (const value of row) {
      formattedRow.push(value.toFixed(2));
    }
    cellText.push(formattedRow);
  }

  const chartHeight = Math.max(560, result.labels.length * 48);
  const showCellLabels = result.labels.length <= 20;
  const data = [{
    type: 'heatmap',
    x: result.labels,
    y: result.labels,
    z: result.matrix,
    zmin: 0,
    zmax: 1,
    colorscale: HEATMAP_COLORS,
    text: cellText,
    texttemplate: showCellLabels ? '%{text}' : '',
    textfont: { size: result.labels.length <= 12 ? 12 : 9, color: '#111827' },
    hovertemplate: '<b>%{y}</b><br>vs<br><b>%{x}</b><br>Cosine similarity: %{z:.3f}<extra></extra>',
    colorbar: {
      title: { text: 'Cosine<br>similarity' },
      thickness: 16,
      len: 0.82,
    },
    xgap: 2,
    ygap: 2,
  }];

  const layout = {
    title: { text: `Journal Similarity Matrix (${result.labels.length} documents)`, font: { size: 17 } },
    autosize: true,
    height: chartHeight,
    margin: { l: 180, r: 100, t: 70, b: 170 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    xaxis: { tickangle: -42, automargin: true, side: 'bottom' },
    yaxis: { autorange: 'reversed', automargin: true },
  };

  const config = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: { format: 'png', filename: 'journal-similarity-matrix', scale: 2 },
  };

  return (
    <div className="journal-heatmap" data-testid="journal-similarity-heatmap">
      <Plot data={data} layout={layout} config={config} useResizeHandler style={{ width: '100%' }} />
    </div>
  );
}
