import { useState } from 'react';
import { CLAIM_TEXT, VERDICT_TEXT, type ClaimLabel, type Verdict } from '@/core/contracts';
import css from './Legend.module.css';
import { AiMark, ClaimStamp, NotVerified, VerdictStamp } from './Stamp';

export const VERDICTS: Verdict[] = ['confirmed', 'one-registry', 'details-differ', 'wrong-paper', 'retracted', 'not-found', 'could-not-check'];
export const LABELS: ClaimLabel[] = ['verified', 'reported', 'disputed', 'ai-reasoning', 'not-found'];

/** Every trust label and what it means, one tap away on every page that shows one. Drawn only when open, so a closed box never holds a green label. */
export function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <details className={css.legend} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>What the labels mean</summary>
      {open && <div className={css.cols}>
        <section aria-label="Labels on a reference">
          <h2>On a reference</h2>
          <dl>
            {VERDICTS.map((v) => (
              <div key={v}>
                <dt>
                  <VerdictStamp verdict={v} />
                </dt>
                <dd>{VERDICT_TEXT[v].plain}</dd>
              </div>
            ))}
            <div>
              <dt>
                <NotVerified />
              </dt>
              <dd>Nothing has been looked up, so do not rely on it.</dd>
            </div>
          </dl>
        </section>
        <section aria-label="Labels on a claim">
          <h2>On a claim</h2>
          <dl>
            {LABELS.map((l) => (
              <div key={l}>
                <dt>
                  <ClaimStamp label={l} />
                </dt>
                <dd>{CLAIM_TEXT[l].plain}</dd>
              </div>
            ))}
            <div>
              <dt>
                <AiMark />
              </dt>
              <dd>An AI suggested it. It proves nothing until you and the checks agree.</dd>
            </div>
          </dl>
          <p className="soft">Green only ever means proven.</p>
        </section>
      </div>}
    </details>
  );
}
