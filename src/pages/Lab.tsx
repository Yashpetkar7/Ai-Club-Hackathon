import { Stub } from '@/ui/Stub';

export function Lab() {
  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <Stub title="Integrity Lab" owner="Hemanth" brief="docs/team/HEMANTH.md" will={['Runs the real checker on real and corrupted references, live', 'Shows our own hits and misses by failure type']} />
    </main>
  );
}
