import { Badge } from './Badge';

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'default'}>
      {status}
    </Badge>
  );
}
