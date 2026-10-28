import { useState } from 'react';
import { inviteUrl } from '../lib/site';
import { useToast } from '../lib/toast';

export function InviteCard({ code, gameName }: { code: string; gameName: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const url = inviteUrl(code);

  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast('Could not copy — select it manually.', 'error');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `Join my ${gameName} game`, text: `Join my ${gameName} game! Code: ${code}`, url });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="panel panel-pad stack invite-card">
      <span className="tiny muted">Invite friends</span>
      <button className="invite-code" onClick={() => copy('code')} title="Copy code">
        {code.split('').map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </button>
      <div className="invite-link row">
        <span className="grow small muted invite-url">{url.replace(/^https?:\/\//, '')}</span>
        <button className="btn btn-sm btn-primary" onClick={() => copy('link')}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
      </div>
      {'share' in navigator && (
        <button className="btn btn-sm" onClick={share}>Share…</button>
      )}
      {copied === 'code' && <span className="small" style={{ color: 'var(--good)' }}>Code copied</span>}
    </div>
  );
}
