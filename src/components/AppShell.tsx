import { Link } from 'react-router-dom';
import { useIdentity } from '../lib/identity';
import { SITE_NAME } from '../lib/site';
import type { ReactNode } from 'react';
import './AppShell.css';

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [identity] = useIdentity();
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
            <span className="chip user-chip">
              <span style={{ fontSize: 15 }}>{identity.avatar}</span> {identity.name}
            </span>
          )}
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
