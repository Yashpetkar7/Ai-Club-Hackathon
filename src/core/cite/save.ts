/** Hands the student a file. Nothing is sent anywhere. */
export function saveFile(name: string, data: Blob | string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
