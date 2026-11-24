import { CLAIM_TEXT, VERDICT_TEXT, type ClaimLabel, type Tone, type Verdict } from '@/core/contracts';

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

export function ClaimStamp({ label }: { label: ClaimLabel }) {
  const t = CLAIM_TEXT[label];
  return (
    <Stamp tone={t.tone} mark={t.mark}>
      {t.label}
    </Stamp>
  );
}
