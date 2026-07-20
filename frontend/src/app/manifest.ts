import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Examination Management System',
    short_name: 'EMS',
    description: 'Examination management portal',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/favicon-32.png',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon-64.png',
        sizes: '64x64',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-monochrome-48.png',
        sizes: '48x48',
        type: 'image/png',
        purpose: 'monochrome',
      },
      {
        src: '/icon-monochrome-96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'monochrome',
      },
      {
        src: '/icon-monochrome-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'monochrome',
      },
      {
        src: '/icon-monochrome.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
  };
}
