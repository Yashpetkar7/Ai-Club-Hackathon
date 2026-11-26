import { describe, expect, it } from 'vitest';
import { itemsFromList } from '@/core/import/import';

// Lines in the shape of the day-of test pack. They are only split and read here, never checked or saved.
const PACK = [
  'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539',
  'LECUN Y, BENGIO Y, HINTON G. Deep Learning. Nature 2015;521:436-44.',
  'Mental health. World Health Organization. https://www.who.int/health-topics/mental-health',
].join('\n');

describe('a pasted reference list', () => {
  it('keeps every line, so none is dropped without a status', () => {
    const items = itemsFromList(PACK);
    expect(items.map((i) => i.kind)).toEqual(['ref', 'ref', 'web']);
  });

  it('reads a web address with no DOI as a web page, with the organisation as author and no invented year', () => {
    const web = itemsFromList(PACK)[2]!;
    expect(web.kind).toBe('web');
    if (web.kind !== 'web') return;
    expect(web.page).toEqual({ url: 'https://www.who.int/health-topics/mental-health', title: 'Mental health', author: 'World Health Organization', year: '', site: '' });
  });

  it('reads an APA web reference with the author first and the year in brackets', () => {
    const [web] = itemsFromList('World Health Organization. (2022). Mental health: Strengthening our response. https://www.who.int/news-room/fact-sheets');
    expect(web?.kind).toBe('web');
    if (web?.kind !== 'web') return;
    expect(web.page.author).toBe('World Health Organization');
    expect(web.page.year).toBe('2022');
    expect(web.page.title).toBe('Mental health: Strengthening our response');
  });

  it('splits on blank lines when there are any, joining a reference that wraps', () => {
    const items = itemsFromList('Smith, J. (2020). A long title that\nwraps onto a second line. Journal, 1, 1–2.\n\nJones, K. (2019). Another title here. Journal, 2, 3–4.');
    expect(items).toHaveLength(2);
    expect(items[0]!.line).toContain('wraps onto a second line');
  });

  it('treats a line with a DOI link as a reference, not a web page', () => {
    expect(itemsFromList(PACK)[0]!.kind).toBe('ref');
  });

  it('treats a link to a paper host with no DOI as a paper to look up, not a web page', () => {
    const [item] = itemsFromList('Vaswani, A., Shazeer, N., & Parmar, N. (2017). Attention is all you need. arXiv. https://arxiv.org/abs/1706.03762');
    expect(item?.kind).toBe('ref');
  });
});
