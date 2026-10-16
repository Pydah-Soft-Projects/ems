import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const ssoToken = typeof sp.token === 'string' ? sp.token : undefined;

  if (ssoToken) {
    redirect(`/login?token=${encodeURIComponent(ssoToken)}`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('ems_token');

  redirect(token ? '/dashboard' : '/login');
}
