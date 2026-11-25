import { useSession } from './accounts';
import { useSave } from './cloud';
import css from './SaveMark.module.css';

const at = (iso: string): string => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

/** One short word about where the work is, beside the account. */
export function SaveMark() {
  const session = useSession();
  const s = useSave();
  if (session.kind !== 'account') return null;
  const [word, tone, title] =
    s.at === 'saved' ? ['Saved', 'ok', `A locked copy is on our server${s.when ? ` since ${at(s.when)}` : ''}. Only your passphrase opens it.`]
    : s.at === 'saving' ? ['Saving…', 'mute', 'Locking your work and saving it.']
    : s.at === 'offline' ? ['Not online', 'warn', 'The server did not answer. Your work is safe on this device and will be saved when it does.']
    : s.at === 'conflict' ? ['Choose a copy', 'bad', 'Another computer saved newer work. Open your account to choose.']
    : s.at === 'changed' ? ['Sign in again', 'bad', 'Your passphrase was changed on another computer.']
    : s.at === 'toobig' ? ['Too large', 'warn', 'This library is too large for the server. It stays on this device.']
    : ['This device', 'mute', 'This account is only on this device.'];
  return (
    <a className={css.mark} data-tone={tone} href="#/account" title={title} role="status">
      <i aria-hidden="true" />
      {word}
    </a>
  );
}
