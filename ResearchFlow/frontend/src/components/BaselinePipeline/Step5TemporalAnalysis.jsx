import React, { useState } from 'react';

export default function Step5TemporalAnalysis({ status, onComplete }) {
  const [timePeriods, setTimePeriods] = useState([{ id: 1, start: '2020-01', end: '2024-01' }]);
  const [heatmapsGenerated, setHeatmapsGenerated] = useState(false);

  const addTimePeriod = () => { setTimePeriods([...timePeriods, { id: Date.now(), start: '', end: '' }]); setHeatmapsGenerated(false); };
  const updateTimePeriod = (id, field, value) => { setTimePeriods(timePeriods.map(tp => tp.id === id ? { ...tp, [field]: value } : tp)); setHeatmapsGenerated(false); };
  const removeTimePeriod = (id) => { setTimePeriods(timePeriods.filter(tp => tp.id !== id)); setHeatmapsGenerated(false); };
  const confirmAnalysis = () => { setHeatmapsGenerated(true); if(onComplete) onComplete(); };

  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Temporal Analysis</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1.5rem 0' }}>Analyse shifts in ecosystem structure across multiple time periods.</p>
      
      <div style={{ background: 'var(--cream)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>Time Periods</strong>
          <button className="tool-btn" style={{ color: 'var(--secondary)' }} onClick={addTimePeriod}>+ Add Period</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {timePeriods.map((tp) => (
            <div key={tp.id} className="form-grid" style={{ position: 'relative', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--muted)' }}>Start Date</label><input type="month" value={tp.start} onChange={(e) => updateTimePeriod(tp.id, 'start', e.target.value)} /></div>
              <div><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--muted)' }}>End Date</label><input type="month" value={tp.end} onChange={(e) => updateTimePeriod(tp.id, 'end', e.target.value)} /></div>
              {timePeriods.length > 1 && (<button onClick={() => removeTimePeriod(tp.id)} style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>)}
            </div>
          ))}
        </div>
      </div>

      {heatmapsGenerated && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {timePeriods.map((tp) => (
            <div key={`heatmap-${tp.id}`} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', background: '#fff' }}>
              <h4 style={{ textAlign: 'center', marginBottom: '20px', color: 'var(--primary)' }}>Analysis: {tp.start || 'YYYY-MM'} to {tp.end || 'YYYY-MM'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--cream)', padding: '10px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>Historical Heatmap</div>
                  <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', width: '150px', height: '150px' }}>
                      {Array.from({length: 25}).map((_, i) => ( <div key={i} style={{ background: 'var(--secondary)', borderRadius: '2px', opacity: Math.max(0.2, Math.random()) }}></div> ))}
                    </div>
                  </div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--light-blue)', padding: '10px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--secondary)', borderBottom: '1px solid var(--border)' }}>Predictive Trajectory</div>
                  <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', width: '150px', height: '150px' }}>
                      {Array.from({length: 25}).map((_, i) => { const val = Math.random(); return <div key={i} style={{ background: val > 0.6 ? 'var(--orange)' : 'var(--secondary)', borderRadius: '2px', opacity: Math.max(0.3, val) }}></div> })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {status === 'Active' && (
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button className="primary" onClick={confirmAnalysis}>Confirm & Generate Heatmaps</button>
        </div>
      )}
    </div>
  );
}