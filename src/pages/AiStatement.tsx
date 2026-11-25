import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { StepProps } from '@/app/ProjectShell';
import { statementLines } from '@/core/report/statement';
import { verifyChain } from '@/log/log';
import { db } from '@/store/db';
import css from './AiStatement.module.css';

const WHO = { student: 'You', code: 'Code', ai: 'AI' } as const;

export function AiStatement({ project }: StepProps) {
  const log = useLiveQuery(() => db.log.where('projectId').equals(project.id).sortBy('seq'), [project.id]);
  const [said, setSaid] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyChain>> | null>(null);
  if (!log) return <p className="soft">Reading the log…</p>;
  const lines = statementLines(log, project);
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
              void navigator.clipboard.writeText(lines.join('\n\n')).then(
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
      <section className="stack" aria-label="Evidence log">
        <h2>Evidence log</h2>
        <p className="soft">Each entry carries the hash of the one before it, so an edit or a missing entry shows. That makes it tamper-evident, not tamper-proof: someone who rebuilt the whole log could hide a change.</p>
        <div className="row">
          <button className="btn" type="button" onClick={() => void verifyChain(log).then(setResult)}>
            Verify log
          </button>
          <span role="status">{result && (result.ok ? `${result.count} entries. Each one matches the entry before it.` : `Entry ${result.brokenAt} of ${result.count} does not match. The log was changed or is incomplete.`)}</span>
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
