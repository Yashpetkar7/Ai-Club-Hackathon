import type { StepProps } from '@/app/ProjectShell';
import { Stub } from '@/ui/Stub';

export function Write(_: StepProps) {
  return <Stub title="Write" owner="Siddal" brief="docs/team/SIDDAL.md" will={['An editor where you write in your own words', 'Insert a citation from your library only', 'Margin checks for citations that are not in the library']} />;
}
