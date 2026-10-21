export function RelativeTime({ date }: { date: Date | string | number }) {
  const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
  // eslint-disable-next-line react-hooks/purity -- relative time is inherently time-dependent; server-rendered once per request
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const [n, unit] =
    abs < 60
      ? [abs, 's']
      : abs < 3600
        ? [Math.round(abs / 60), 'm']
        : abs < 86400
          ? [Math.round(abs / 3600), 'h']
          : [Math.round(abs / 86400), 'd'];
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString('en-US')}>
      {diffSec <= 0 ? `${n}${unit} ago` : `in ${n}${unit}`}
    </time>
  );
}
