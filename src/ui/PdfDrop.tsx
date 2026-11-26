import { useId, useState } from 'react';
import type { RawReference, ReferenceCheck } from '@/core/contracts';
import { registries } from '@/core/registries';
import { checkReference } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { addSource, editSource } from '@/store/actions';
import { VerdictStamp } from './Stamp';
import css from './PdfDrop.module.css';

interface Outcome {
  name: string;
  error?: string;
  check?: ReferenceCheck;
  pages?: number;
  extractedPages?: number;
  instructions?: string[];
}

/** Adds a PDF the student already has. It is read on this device and never uploaded. */
export function PdfDrop({ projectId, onBusy, onAdded }: { projectId: string; onBusy?: () => void; onAdded?: (id: string) => void }) {
  const id = useId();
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<Outcome[]>([]);

  async function take(files: FileList | null) {
    if (files?.length) onBusy?.();
    for (const file of [...(files ?? [])].slice(0, 10)) {
      setBusy(`Reading ${file.name}`);
      let out: Outcome = { name: file.name };
      try {
        const { readPdf } = await import('@/core/pdf/read');
        const pdf = await readPdf(file, (n, of) => setBusy(`Reading ${file.name}, page ${n} of ${of}`));
        const raw: RawReference = { raw: pdf.doi ?? pdf.title ?? file.name.replace(/\.pdf$/i, ''), ...(pdf.doi ? { doi: pdf.doi } : {}), ...(!pdf.doi && pdf.title ? { title: pdf.title } : {}) };
        setBusy(`Checking ${file.name}`);
        const check = await checkReference(raw, registries);
        const s = await addSource(projectId, 'pdf', { raw, check });
        await editSource(s.id, { text: pdf.text, textOrigin: 'pdf', pdfPages: pdf.pages });
        if (pdf.instructions.length) await log(projectId, 'code', 'pdf.instructions-found', `${file.name}: text aimed at an AI was found and ignored`);
        out = { ...out, check, pages: pdf.pages, extractedPages: pdf.extractedPages, instructions: pdf.instructions };
        onAdded?.(s.id);
      } catch (e) {
        out = { ...out, error: e instanceof Error ? e.message : 'This file could not be read.' };
      }
      setDone((d) => [out, ...d]);
    }
    setBusy('');
  }

  return (
    <section className="stack" aria-label="Add a PDF">
      <div
        className={css.drop}
        data-over={over}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
      >
        <label htmlFor={id}>
          <strong>Already have a PDF?</strong> <span className="soft">Drop it here or choose it. The file is read on this device and not uploaded.</span>
        </label>
        <input id={id} type="file" accept="application/pdf,.pdf" multiple disabled={!!busy} onChange={(e) => { void take(e.target.files); e.target.value = ''; }} />
        <p role="status" className="soft">{busy}</p>
      </div>
      {done.map((o, i) => (
        <div key={`${o.name}-${i}`} className={`card ${css.out}`}>
          <strong>{o.name}</strong>
          {o.error ? <p role="alert" className={css.bad}>{o.error}</p> : (
            <>
              <div className="row">
                <VerdictStamp verdict={o.check!.verdict} />
                <span className="soft">Text extracted from {o.extractedPages} of {o.pages} pages{o.extractedPages! < o.pages! ? ' (extraction stops after 80 pages)' : ''}. Added to your library, waiting for your approval.</span>
              </div>
              <p className="soft">A DOI found inside a PDF may cite a different work. Review the returned title before approving; a metadata match does not authenticate this file.</p>
              {o.instructions!.length > 0 && <p className={css.warn}>This file contains text aimed at an AI, such as “{o.instructions![0]}”. It was ignored.</p>}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
