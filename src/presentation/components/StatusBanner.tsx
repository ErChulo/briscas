interface StatusBannerProps {
  readonly message?: string | null;
  readonly tone?: 'info' | 'error' | 'success';
}

export function StatusBanner({ message, tone = 'info' }: StatusBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <div className={`status-banner status-banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}
