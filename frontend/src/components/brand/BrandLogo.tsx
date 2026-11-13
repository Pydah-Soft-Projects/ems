import Image from 'next/image';

const sizeMap = {
  sm: { box: 'h-10 w-10', px: 40 },
  md: { box: 'h-14 w-14', px: 56 },
  lg: { box: 'h-36 w-36', px: 144 },
} as const;

type BrandLogoProps = {
  size?: keyof typeof sizeMap;
  className?: string;
  src?: string;
};

export function BrandLogo({
  size = 'md',
  className = '',
  src = '/campo-logos/icon-512.png',
}: BrandLogoProps) {
  const { box, px } = sizeMap[size];
  return (
    <span
      className={`relative inline-flex ${box} shrink-0 items-center justify-center ${className}`}
    >
      <Image
        src={src}
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
  if (collapsed) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <BrandLogo size={size} src="/campo-logos/icon-512.png" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <div className="relative shrink-0 flex items-center">
        <Image
          src="/campo-logos/campo_logo_transparent_hq.png"
          alt="Campo"
          width={112}
          height={32}
          className="h-7 w-auto max-w-[115px] object-contain object-left"
          priority
        />
      </div>
      {title ? (
        <div className="min-w-0 leading-tight border-l border-[var(--border)] pl-2">
          <p className="truncate text-xs font-semibold text-[var(--sidebar-text)]">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[10px] text-[var(--sidebar-muted)]">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
