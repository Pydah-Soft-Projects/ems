export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function moneyPlain(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
