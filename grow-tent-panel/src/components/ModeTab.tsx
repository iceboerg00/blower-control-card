interface Tab {
  id: string;
  label: string;
}

interface ModeTabProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function ModeTab({ tabs, active, onChange }: ModeTabProps) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1,
            padding: '8px 4px',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: active === t.id ? 700 : 400,
            cursor: 'pointer',
            background: active === t.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
            color: active === t.id ? '#f5f5f5' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
