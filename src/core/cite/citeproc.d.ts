declare module 'citeproc' {
  interface Engine {
    updateItems(ids: string[]): void;
    makeBibliography(): false | [{ entry_ids: string[][] }, string[]];
    makeCitationCluster(items: { id: string }[]): string;
  }
  const CSL: { Engine: new (sys: { retrieveLocale(lang: string): string; retrieveItem(id: string): unknown }, style: string, lang?: string, force?: boolean) => Engine };
  export default CSL;
}
