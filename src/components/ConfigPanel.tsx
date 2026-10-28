import type { GameMeta } from '../../shared/catalog';
import type { GameConfig } from '../../shared/types';
import { request } from '../lib/socket';

export function ConfigPanel({ meta, config, editable }: { meta: GameMeta; config: GameConfig; editable: boolean }) {
  if (!meta.config?.length) return null;
  return (
    <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
      <span className="tiny muted">Settings</span>
      {meta.config.map((opt) => (
        <label key={opt.key} className="config-row">
          <span className="small">{opt.label}</span>
          {editable ? (
            <div className="segmented">
              {opt.options.map((o) => (
                <button
                  key={String(o.value)}
                  className={config[opt.key] === o.value ? 'on' : ''}
                  onClick={() => request('room:config', { config: { [opt.key]: o.value } })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="chip">{opt.options.find((o) => o.value === config[opt.key])?.label ?? String(config[opt.key])}</span>
          )}
        </label>
      ))}
    </div>
  );
}
