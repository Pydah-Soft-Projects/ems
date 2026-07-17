export function AcademicScopeSummary({
  collegeName,
  programmeName,
  branchNames,
  batchYear,
  year,
  semester,
  className = '',
}: {
  collegeName?: string | null;
  programmeName?: string | null;
  branchNames?: string[] | string | null;
  batchYear?: number | string | null;
  year?: number | string | null;
  semester?: number | string | null;
  className?: string;
}) {
  const branches = Array.isArray(branchNames)
    ? branchNames.filter(Boolean).join(', ')
    : branchNames || '';

  const items = [
    collegeName,
    programmeName,
    branches,
    batchYear != null && batchYear !== '' ? `Batch ${batchYear}` : null,
    year != null && year !== '' ? `Y${year}` : null,
    semester != null && semester !== '' ? `S${semester}` : null,
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <p className={`text-sm text-[var(--muted)] ${className}`}>{items.join(' · ')}</p>
  );
}
