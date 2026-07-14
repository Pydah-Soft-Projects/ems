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
        description: 'Subjects and mappings',
        icon: 'subjects',
      },
      {
        href: '/dashboard/organization',
        label: 'Organization',
        description: 'Colleges, programs, students (SDMS)',
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
        href: '/dashboard/settings',
        label: 'Settings',
        description: 'Payment gateway and portal config',
        icon: 'settings',
      },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  for (const group of navigation) {
    for (const item of group.items) {
      const match = item.exact
        ? pathname === item.href
        : pathname.startsWith(item.href);
      if (match) return item;
    }
  }
  return undefined;
}
