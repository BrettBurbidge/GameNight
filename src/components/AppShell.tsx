import { Link } from 'react-router-dom';
import { useIdentity } from '../lib/identity';
import { useEditProfile } from './ProfileEditor';
import { SITE_NAME } from '../lib/site';
import type { ReactNode } from 'react';
import './AppShell.css';

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [identity] = useIdentity();
  const editProfile = useEditProfile();
  return (
    <div className="shell">
      <header className="shell-header container">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <i /><i /><i /><i />
          </span>
          <span className="brand-name">{SITE_NAME}</span>
        </Link>
        <div className="row">
          {right}
          {identity.name && (
            <button className="chip user-chip" onClick={editProfile} title="Edit your name and avatar">
              <span style={{ fontSize: 15 }}>{identity.avatar}</span>
              <span className="user-chip-name">{identity.name}</span>
              <span className="user-chip-edit">✎</span>
            </button>
          )}
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
