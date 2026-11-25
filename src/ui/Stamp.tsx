import { CLAIM_TEXT, VERDICT_TEXT, type ClaimLabel, type Source, type Tone, type Verdict } from '@/core/contracts';

export function Stamp({ tone, mark, children, land }: { tone: Tone; mark: string; children: React.ReactNode; land?: boolean }) {
  return (
    <span className={`stamp t-${tone}${land ? ' land' : ''}`}>
      <i aria-hidden="true">{mark}</i>
      {children}
    </span>
  );
}

export function VerdictStamp({ verdict, land }: { verdict: Verdict; land?: boolean }) {
  const t = VERDICT_TEXT[verdict];
  return (
    <Stamp tone={t.tone} mark={t.mark} {...(land ? { land } : {})}>
      {t.label}
    </Stamp>
  );
}

/** The label a source carries wherever it is shown. */
export function SourceStamp({ s }: { s: Source }) {
  if (s.check) return <VerdictStamp verdict={s.check.verdict} />;
  return (
    <Stamp tone="mute" mark="~">
      {s.origin === 'web' ? 'Web page, not checked' : 'Not checked'}
    </Stamp>
  );
}

/** For something nobody has looked up. Never a pass, and never "not found". */
export function NotVerified() {
  return (
    <Stamp tone="mute" mark="~">
      Not yet verified
    </Stamp>
  );
}

export function AiMark() {
  return (
    <Stamp tone="mute" mark="⌁">
      AI suggestion
    </Stamp>
  );
}

export function ClaimStamp({ label }: { label: ClaimLabel }) {
  const t = CLAIM_TEXT[label];
  return (
    <Stamp tone={t.tone} mark={t.mark}>
      {t.label}
    </Stamp>
  );
}
