export function Money({ amount, currency = 'usd' }: { amount: number; currency?: string }) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
  return <span className="tabular-nums">{formatted}</span>;
}
