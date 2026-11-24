import { AGENTS, AI_LEVELS, POLICY } from '@/policy/policy';

/** Hemanth owns this page. This first version shows the live policy so it is never out of date. */
export function Rules() {
  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>House rules</h1>
        <p className="soft">This page reads the same policy file the checker uses.</p>
      </div>
      <section className="stack">
        <h2>Who does what</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead>
              <tr>
                {['Agent', 'Kind', 'Does', 'Cannot'].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: 'left', padding: '8px 14px 8px 0', color: 'var(--soft)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <th scope="row" style={{ textAlign: 'left', padding: '10px 14px 10px 0' }}>
                    {a.name}
                  </th>
                  <td style={{ padding: '10px 14px 10px 0' }}>{a.kind === 'code' ? 'Plain code' : `AI, level ${a.minLevel} and up`}</td>
                  <td style={{ padding: '10px 14px 10px 0' }}>{a.does}</td>
                  <td style={{ padding: '10px 0' }}>{a.cannot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="stack">
        <h2>AI permission levels</h2>
        <ol start={0} style={{ margin: 0, paddingLeft: '1.4em' }}>
          {AI_LEVELS.map((l) => (
            <li key={l.level}>
              <strong>{l.name}.</strong> {l.means}
            </li>
          ))}
        </ol>
      </section>
      <section className="stack">
        <h2>Limits in force</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
          <li>A title must match at least {Math.round(POLICY.thresholds.titleMatch * 100)}% of its words.</li>
          <li>A year may differ by {POLICY.thresholds.yearTolerance}, because online and print dates differ.</li>
          <li>Keeping a flagged source needs a written reason of at least {POLICY.overrideReasonMinChars} characters.</li>
          <li>At most {POLICY.maxAiCallsPerProject} AI calls per project.</li>
        </ul>
      </section>
    </main>
  );
}
