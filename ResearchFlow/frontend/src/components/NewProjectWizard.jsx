import { useState } from 'react';

const QUALITATIVE_SUBTYPES = [
  'Phenomenology (Lived Experiences)',
  'Ethnography (Cultural/Social Observation)',
  'Grounded Theory (Theory Generation)',
  'Case Study (In-depth Contextual Analysis)',
  'Narrative Analysis (Story/Text Analysis)'
];

export default function NewProjectWizard({ isOpen, onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    reason: 'Academic Degree',
    targetJournal: '',
    budget: '',
    researchType: 'qualitative',
    qualitativeSubtype: QUALITATIVE_SUBTYPES[0],
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Project name is required.');
      return;
    }
    onCreate(formData);
    setStep(1);
    setFormData({ ...formData, name: '', targetJournal: '', budget: '' });
  };

  return (
    <div className="simple-modal active">
      <div className="export-card" style={{ width: '36rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--primary)', margin: 0 }}>Configure New Project</h3>
          <span className="badge progress">Step {step} of 2</span>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label>Project Name</label>
                <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g., ESG Adoption in Fintech" autoFocus />
              </div>
              <div>
                <label>Project Reason / Type</label>
                <select name="reason" value={formData.reason} onChange={handleChange}>
                  <option>Academic Degree (Masters/PhD)</option>
                  <option>Independent Journal Article</option>
                  <option>Funded Grant Research</option>
                  <option>Corporate / Applied Research</option>
                </select>
              </div>
              <div>
                <label>Target Journal (Optional)</label>
                <input name="targetJournal" value={formData.targetJournal} onChange={handleChange} placeholder="e.g., Journal of Business Research" />
              </div>
              <div>
                <label>Budget / Funding (Optional)</label>
                <input name="budget" value={formData.budget} onChange={handleChange} placeholder="e.g., $5,000" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label>Primary Methodology</label>
                <select name="researchType" value={formData.researchType} onChange={handleChange}>
                  <option value="qualitative">Qualitative</option>
                  <option value="quantitative">Quantitative</option>
                  <option value="mixed">Mixed Methods</option>
                </select>
              </div>

              {formData.researchType === 'qualitative' && (
                <div style={{ padding: '1rem', background: 'var(--light-blue)', borderLeft: '4px solid var(--secondary)', borderRadius: '8px' }}>
                  <label>Qualitative Subtype</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                    This configures the specialized LLM layer for your methodology and data analysis stages.
                  </p>
                  <select name="qualitativeSubtype" value={formData.qualitativeSubtype} onChange={handleChange}>
                    {QUALITATIVE_SUBTYPES.map(subtype => (
                      <option key={subtype} value={subtype}>{subtype}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <hr style={{ margin: '1.5rem 0 1rem' }} />
          
          <div className="flex-btns">
            <button type="button" onClick={onClose}>Cancel</button>
            {step === 1 ? (
              <button type="button" className="primary" onClick={handleNext}>Next: Methodology</button>
            ) : (
              <>
                <button type="button" onClick={handleBack}>Back</button>
                <button type="submit" className="primary">Initialize Project</button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}