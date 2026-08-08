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
    | 'reports'
    | 'remuneration'
    | 'settings'
    | 'users';
  /** Any of these privileges unlocks the nav item. */
  privilege?: string | string[];
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
        privilege: 'dashboard:view',
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
        privilege: 'regulations:read',
      },
      {
        href: '/dashboard/subjects',
        label: 'Subjects',
        description: 'Subjects catalog and academic scope mappings',
        icon: 'subjects',
        privilege: ['subjects:read', 'mappings:read'],
      },
      {
        href: '/dashboard/organization',
        label: 'Organization',
        description: 'Colleges, programmes, and students (SDMS)',
        icon: 'organization',
        privilege: ['organization:read', 'students:read'],
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
        privilege: 'exams:read',
      },
      {
        href: '/dashboard/exam-calendar',
        label: 'Exam Calendar',
        description: 'Admin view of exam + late-fee timeline',
        icon: 'exams',
        privilege: 'exams:read',
      },
      {
        href: '/dashboard/reports/subject-wise',
        label: 'Subject-wise Reports',
        description: 'Paid PIN numbers by timetable subject and exam date',
        icon: 'reports',
        privilege: 'exams:read',
      },
      {
        href: '/dashboard/remuneration',
        label: 'Remuneration',
        description: 'Bills for external setters, evaluators & examiners',
        icon: 'remuneration',
        privilege: 'remuneration:read',
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
        privilege: ['fees:read', 'fees:collect'],
      },
      {
        href: '/dashboard/fees/self-online',
        label: 'Self Online reconcile',
        description: 'College UPI statements & verification',
        icon: 'fees',
        privilege: ['fees:reconcile', 'fees:read'],
      },
      {
        href: '/dashboard/professionals',
        label: 'Professionals',
        description: 'External paper setters & examiners directory',
        icon: 'organization',
        privilege: 'professionals:read',
      },
      {
        href: '/dashboard/settings',
        label: 'Settings',
        description: 'Payment gateway and portal config',
        icon: 'settings',
        privilege: 'settings:payments',
      },
      {
        href: '/dashboard/reports',
        label: 'Payment Reports',
        description: 'Day / month wise paid students report',
        icon: 'fees',
        privilege: ['fees:read'],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        href: '/dashboard/user-management',
        label: 'User management',
        description: 'EMS roles, privileges, and HRMS-linked users',
        icon: 'users',
        privilege: ['users:read', 'roles:read', 'users:write', 'roles:write'],
      },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const flat = navigation.flatMap((g) => g.items);
  const matches = flat.filter((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0];
}
