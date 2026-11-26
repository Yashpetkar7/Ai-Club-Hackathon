import { Link } from '@/app/router';
import { SUPPORT_MB } from '@/core/claims/support';
import { CLAIM_TEXT } from '@/core/contracts';
import { MEANING_MB } from '@/core/semantic/models';
import { POLICY } from '@/policy/policy';
import css from './HowChecksWork.module.css';

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const { verified, reported, disputed } = CLAIM_TEXT;

/** How it works: the checks on what a sentence says, in plain words. The numbers come from the code, never typed in. */
export function HowChecksWork() {
  const t = POLICY.thresholds;
  return (
    <section className="stack" aria-labelledby="guide-claims">
      <h2 id="guide-claims">Checking what a sentence says</h2>
      <p className="soft">A real reference can still be cited for something it does not say. These pages check the sentence, not only the reference.</p>
      <div className={css.grid}>
        <article className={`card ${css.part}`}>
          <h3>Audit a paragraph</h3>
          <p>Paste a paragraph with its reference list, for example text an AI tool has polished. We look up every reference first. Then plain code cuts the paragraph into claims, finds what each claim cites, and compares it with the text of that reference, usually its abstract.</p>
          <p className="soft">Nothing is saved, and no AI gives a label.</p>
          <p>
            <Link to="/audit">Audit a paragraph</Link>
          </p>
        </article>
        <article className={`card ${css.part}`}>
          <h3>Find by meaning</h3>
          <p>A small model on your device puts a source’s sentences in order, closest in meaning first, next to the words they share. That is all it does: it never gives a label.</p>
          <p>Every label comes from the same plain-code checks, <span className="mono">judge()</span> in our code, with the meaning model on or off.</p>
          <p className="soft">It downloads about {MEANING_MB} MB once, then loads from this browser. Your words stay on this device.</p>
        </article>
        <article className={`card ${css.part}`}>
          <h3>The claim scorecard</h3>
          <p>Evidence and Audit show, for each claim, the closest sentence and the checks behind its label: are your words in the source, do the numbers match, is the direction the same, does the claim go further than the sentence.</p>
          <p>If you turn on Compare the meaning, a second model on your device ({SUPPORT_MB} MB) scores how far the sentence supports or contradicts your claim. Each bar has a line:</p>
          <ul className={css.list}>
            <li>
              <strong>Support line, {pct(t.supportVerified)}.</strong> {verified.label} needs support at or above it, or your exact words in the sentence. Every other check must pass too, and two registries must have confirmed the source.
            </li>
            <li>
              <strong>Contradiction line, {pct(t.contradiction)}.</strong> At or above it the label is {disputed.label}. A different number or the opposite direction, in a sentence about the same thing, is {disputed.label} too.
            </li>
            <li>Anything in between, or a claim in your own words with the model off, stays {reported.label}.</li>
          </ul>
          <p className="soft">A bar shows how one sentence relates to your claim. It is not the chance that your claim is true.</p>
        </article>
        <article className={`card ${css.part}`}>
          <h3>Reading the Lab’s accuracy numbers</h3>
          <p>The Integrity Lab runs our own checkers on claims and references where the right answer is already known, and counts every mistake.</p>
          <ul className={css.list}>
            <li>Read “False claims labelled {verified.label}” first. It is the mistake that matters most, and lower is better.</li>
            <li>Each number is a count of cases, how many out of how many, with a 95% range. With few cases the range is wide, so read the range as well as the middle.</li>
            <li>Every miss is listed, so you can see what went wrong.</li>
          </ul>
          <p>Its limits, which the Lab states too: the team wrote the claims against real abstracts, so they are not student writing. The claim rules were tuned on these claims, so it is a development set, not a fresh test. The model scores were recorded once and are replayed. The reference numbers come from a recorded replay, not live registries. It is not a comparison with any other product.</p>
          <p>
            <Link to="/lab">Open the Integrity Lab</Link>
          </p>
        </article>
      </div>
    </section>
  );
}
