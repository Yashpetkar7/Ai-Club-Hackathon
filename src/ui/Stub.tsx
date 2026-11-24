/** Marks a page a teammate is building. No Stub may remain on 26 November; a test checks for it. */
export function Stub({ title, owner, will, brief }: { title: string; owner: string; will: string[]; brief: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card" style={{ padding: '22px 24px', display: 'grid', gap: 10 }}>
        <p>
          <span className="sample">NOT BUILT YET</span> {owner} is building this page. The brief is in <span className="mono">{brief}</span>.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
          {will.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
