import type { StepProps } from '@/app/ProjectShell';
import { Stub } from '@/ui/Stub';

export function Evidence(_: StepProps) {
  return <Stub title="Evidence" owner="Nihal" brief="docs/team/NIHAL.md" will={['Claim cards with the exact sentence highlighted in the source', 'Labels set by code: verified, reported, disputed, AI reasoning, not found', 'Accept, rewrite or reject each claim']} />;
}
