import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { StepProps } from '@/app/ProjectShell';
import { statementLines } from '@/core/report/statement';
import { record, verifyChain } from '@/log/log';
import { db } from '@/store/db';
import css from './AiStatement.module.css';

const WHO = { student: 'You', code: 'Code', ai: 'AI' } as const;

export function AiStatement({ project }: StepProps) {
  const log = useLiveQuery(() => db.log.where('projectId').equals(project.id).sortBy('seq'), [project.id]);
  const [said, setSaid] = useState('');
  const [result, setResult] = useState<{ snapshot: string; value: Awaited<ReturnType<typeof verifyChain>> } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sections, setSections] = useState('');
  const [incorporation, setIncorporation] = useState('');
  const [saving, setSaving] = useState(false);
  if (!log) return <p className="soft">Reading the log…</p>;
  const lines = statementLines(log, project);
  const snapshot = JSON.stringify(log);
  const verified = result?.snapshot === snapshot ? result.value : null;
  return (
    <>
      <section className="stack" aria-label="AI-use statement">
        <h2>AI-use statement</h2>
        <p className="soft">Written from the log below and nothing else. If it is not in the log, it is not here. Check it against what your assessment asks for before you hand it in.</p>
        <div className={css.sheet}>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() =>
              void (navigator.clipboard?.writeText(lines.join('\n\n')) ?? Promise.reject(new Error('Clipboard unavailable'))).then(
                () => setSaid('Copied.'),
                () => setSaid('Your browser did not allow copying. Select the text instead.'),
              )
            }
          >
            Copy statement
          </button>
          <span role="status" className="soft">
            {said}
          </span>
        </div>
      </section>
      <section className="stack" aria-label="Complete your disclosure">
        <h2>Complete your disclosure</h2>
        <p className="soft">The <a href="https://apastyle.apa.org/instructional-aids/ai-contribution-statement.pdf" target="_blank" rel="noreferrer">APA contribution statement guide</a> asks for dates, prompts or tasks, affected paper sections, and how AI ideas were incorporated. Your instructor’s requirements come first. Dates and recorded prompts appear above; paper sections need your own account.</p>
        <label className="stack">Sections affected<input className="field" maxLength={500} value={sections} onChange={(e) => setSections(e.target.value)} placeholder="For example: literature-search planning; no generated text in the paper" /></label>
        <label className="stack">How I used the ideas<textarea className="field" rows={3} maxLength={2000} value={incorporation} onChange={(e) => setIncorporation(e.target.value)} /></label>
        <button className="btn" type="button" disabled={saving || !sections.trim() || !incorporation.trim()} onClick={() => {
          setSaving(true);
          void record(project.id, 'student', 'ai.disclosure', JSON.stringify({ sections: sections.trim(), incorporation: incorporation.trim() })).then(() => { setSaid('Your disclosure was recorded.'); setSections(''); setIncorporation(''); }, () => setSaid('Could not save your disclosure. Your text is still here.')).finally(() => setSaving(false));
        }}>Record my disclosure</button>
      </section>
      <section className="stack" aria-label="Evidence log">
        <h2>Evidence log</h2>
        <p className="soft">Each entry carries the hash of the one before it. Edits inside the available chain can be detected. Removing the end of a log or rebuilding the whole chain can go undetected without an external checkpoint. This is tamper-evident, not tamper-proof, and does not prove that every action was recorded.</p>
        <div className="row">
          <button className="btn" type="button" disabled={verifying} onClick={() => { setVerifying(true); void verifyChain(log).then((value) => setResult({ snapshot, value }), () => setSaid('Your browser could not verify the log. Try again.')).finally(() => setVerifying(false)); }}>
            Verify log
          </button>
          <span role="status">{verified ? verified.ok ? `${verified.count} entries. Each one matches the entry before it.` : `Entry ${verified.brokenAt} of ${verified.count} does not match. The log was changed or is incomplete.` : result ? 'The log changed. Verify it again.' : ''}</span>
        </div>
        <details>
          <summary>Show the log ({log.length})</summary>
          <div className={css.scroll} role="region" aria-label="Evidence log entries" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Detail</th>
                  <th scope="col">Hash</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.seq}>
                    <td>{new Date(e.at).toLocaleString()}</td>
                    <td>{WHO[e.actor]}</td>
                    <td>{e.action}</td>
                    <td>
                      {e.detail.slice(0, 220)}
                      {e.model ? ` (${e.model})` : ''}
                    </td>
                    <td className="mono">{e.hash.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
