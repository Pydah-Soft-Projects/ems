export type StudentNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: 'home' | 'exams' | 'applications' | 'documents' | 'profile';
};

export const studentNavigation: StudentNavItem[] = [
  { href: '/student', label: 'Home', exact: true, icon: 'home' },
  { href: '/student/exams', label: 'Exams', icon: 'exams' },
  { href: '/student/applications', label: 'Applications', icon: 'applications' },
  { href: '/student/documents', label: 'Documents', icon: 'documents' },
  { href: '/student/profile', label: 'Profile', icon: 'profile' },
];

export function isStudentNavActive(pathname: string, item: StudentNavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
