import type { StepProps } from '@/app/ProjectShell';
import { Stub } from '@/ui/Stub';

export function Ask(_: StepProps) {
  return <Stub title="Ask your library" owner="Nihal" brief="docs/team/NIHAL.md" will={['Answers built only from sources you kept', 'Every sentence carries its source', 'An honest Not found when your library does not say']} />;
}
