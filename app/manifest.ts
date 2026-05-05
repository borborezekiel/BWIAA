import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BWIAA 2026 — National Alumni Portal',
    short_name: 'BWIAA 2026',
    description: 'The official home of the Booker Washington Institute Alumni Association. Vote, connect, and make an impact.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a00',
    theme_color: '#D4A017',
    orientation: 'portrait-primary',
    scope: '/',
    lang: 'en',
    categories: ['education', 'social', 'utilities'],
    icons: [
      {
        src: '/icons/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Member Portal',
        short_name: 'Members',
        description: 'Access your member dashboard',
        url: '/members',
        icons: [{ src: '/icons/web-app-manifest-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Vote Now',
        short_name: 'Vote',
        description: 'Cast your ballot',
        url: '/',
        icons: [{ src: '/icons/web-app-manifest-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Election History',
        short_name: 'History',
        description: 'View past election results',
        url: '/history',
        icons: [{ src: '/icons/web-app-manifest-192x192.png', sizes: '192x192' }],
      },
    ],
  };
}
