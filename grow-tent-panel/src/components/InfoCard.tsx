interface InfoCardProps {
  running: boolean;
  text: string;
}

export function InfoCard({ running, text }: InfoCardProps) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 10,
      background: running ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${running ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.08)'}`,
      color: running ? '#a5d6a7' : 'rgba(255,255,255,0.5)',
      fontSize: 14,
      lineHeight: '1.4',
    }}>
      {text}
    </div>
  );
}
