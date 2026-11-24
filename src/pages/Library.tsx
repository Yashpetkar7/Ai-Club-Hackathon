import type { StepProps } from '@/app/ProjectShell';
import { Stub } from '@/ui/Stub';

export function Library(_: StepProps) {
  return <Stub title="Library" owner="Siddal" brief="docs/team/SIDDAL.md" will={['Folders, tags, notes, search and filter by label', 'Add by DOI, BibTeX, RIS, web page and PDF', 'Approve, or keep a flagged source with a written reason']} />;
}
