export type NavItem = {
  href: string;
  label: string;
  description?: string;
  exact?: boolean;
  icon:
    | 'dashboard'
    | 'regulations'
    | 'subjects'
    | 'organization'
    | 'exams'
    | 'fees'
    | 'remuneration'
    | 'settings';
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description: 'Portal overview and statistics',
        exact: true,
        icon: 'dashboard',
      },
    ],
  },
  {
    title: 'Academic Setup',
    items: [
      {
        href: '/dashboard/regulations',
        label: 'Regulations',
        description: 'Manage academic regulations',
        icon: 'regulations',
      },
      {
        href: '/dashboard/subjects',
        label: 'Subjects',
        description: 'Subjects catalog and academic scope mappings',
        icon: 'subjects',
      },
      {
        href: '/dashboard/organization',
        label: 'Organization',
        description: 'Colleges, programmes, and students (SDMS)',
        icon: 'organization',
      },
    ],
  },
  {
    title: 'Examination',
    items: [
      {
        href: '/dashboard/exams',
        label: 'Examinations',
        description: 'Create and manage exams',
        icon: 'exams',
      },
      {
        href: '/dashboard/remuneration',
        label: 'Remuneration',
        description: 'Bills for external setters, evaluators & examiners',
        icon: 'remuneration',
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        href: '/dashboard/fees',
        label: 'Fees & Payments',
        description: 'Fee records and collections',
        icon: 'fees',
      },
      {
        href: '/dashboard/professionals',
        label: 'Professionals',
        description: 'External paper setters & examiners directory',
        icon: 'organization',
      },
      {
        href: '/dashboard/settings',
        label: 'Settings',
        description: 'Payment gateway and portal config',
        icon: 'settings',
      },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const flat = navigation.flatMap((g) => g.items);
  // Prefer longest href match so nested routes highlight correctly
  const matches = flat.filter((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0];
}
