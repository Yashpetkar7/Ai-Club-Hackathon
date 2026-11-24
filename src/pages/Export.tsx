import type { StepProps } from '@/app/ProjectShell';
import { AiStatement } from '@/pages/AiStatement';
import { Stub } from '@/ui/Stub';

export function Export({ project }: StepProps) {
  return (
    <>
      <Stub title="Export" owner="Siddal" brief="docs/team/SIDDAL.md" will={['Pre-flight check', 'Reference list in APA 7 and other styles', 'Word, BibTeX and RIS files']} />
      <AiStatement project={project} />
    </>
  );
}
