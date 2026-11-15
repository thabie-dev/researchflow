export default function TopicExtractionResults({ extraction }) {
  return (
    <section className="topic-extraction-results">
      <div className="topic-output-header">
        <div>
          <span className="engine-badge">{extraction.engine}</span>
          <h3>Extracted research topics</h3>
          <p>Transformer-based topics after cleaning and stopword removal.</p>
        </div>
        <div className="pipeline-steps" aria-label="Topic preprocessing pipeline">
          {extraction.preprocessing.map((step) => <span key={step}>{step}</span>)}
        </div>
      </div>

      <div className="global-topics">
        <h4>Topics across the journal collection</h4>
        <div className="global-topic-grid">
          {extraction.global_topics.map((topic, index) => (
            <article key={topic.topic_id}>
              <span className="topic-rank">{index + 1}</span>
              <div>
                <strong>{topic.label}</strong>
                <div className="topic-keywords">
                  {topic.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
              </div>
              <span className="topic-share">{Math.round(topic.score * 100)}%</span>
            </article>
          ))}
        </div>
      </div>

      <div className="journal-topic-output">
        <h4>Topics by journal</h4>
        <div className="journal-topic-grid">
          {extraction.journals.map((journal) => (
            <article key={journal.filename}>
              <h5 title={journal.filename}>{journal.filename}</h5>
              {journal.topics.length ? (
                <div className="journal-topic-list">
                  {journal.topics.map((topic) => (
                    <div key={topic.topic_id}>
                      <span>{topic.label}</span>
                      <strong>{Math.round(topic.score * 100)}%</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No stable topic was assigned.</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
