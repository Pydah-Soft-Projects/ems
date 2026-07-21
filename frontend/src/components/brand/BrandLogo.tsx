import Image from 'next/image';

const sizeMap = {
  sm: { box: 'h-10 w-10', px: 40 },
  md: { box: 'h-14 w-14', px: 56 },
  lg: { box: 'h-36 w-36', px: 144 },
} as const;

type BrandLogoProps = {
  size?: keyof typeof sizeMap;
  className?: string;
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const { box, px } = sizeMap[size];
  return (
    <span
      className={`relative inline-flex ${box} shrink-0 items-center justify-center ${className}`}
    >
      <Image
        src="/logo.png"
        alt="EMS"
        width={px}
        height={px}
        className="h-full w-full object-contain"
        priority
      />
    </span>
  );
}

type BrandLockupProps = {
  title: string;
  subtitle?: string;
  size?: keyof typeof sizeMap;
  className?: string;
  collapsed?: boolean;
};

/** Logo + title/subtitle row, vertically centered. */
export function BrandLockup({
  title,
  subtitle,
  size = 'md',
  className = '',
  collapsed = false,
}: BrandLockupProps) {
  return (
    <div
      className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} ${className}`}
    >
      <BrandLogo size={size} />
      {!collapsed ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-slate-900">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
