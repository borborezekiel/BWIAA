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
        src: '/icons/icon-72x72.png',
        sizes: '72x72',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-128x128.png',
        sizes: '128x128',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable any',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/desktop.png',
        sizes: '1280x720',
        type: 'image/png',
        // @ts-ignore
        form_factor: 'wide',
        label: 'BWIAA 2026 Desktop View',
      },
      {
        src: '/screenshots/mobile.png',
        sizes: '390x844',
        type: 'image/png',
        // @ts-ignore
        form_factor: 'narrow',
        label: 'BWIAA 2026 Mobile View',
      },
    ],
    shortcuts: [
      {
        name: 'Member Portal',
        short_name: 'Members',
        description: 'Access your member dashboard',
        url: '/members',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }],
      },
      {
        name: 'Vote Now',
        short_name: 'Vote',
        description: 'Cast your ballot',
        url: '/',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }],
      },
      {
        name: 'Election History',
        short_name: 'History',
        description: 'View past election results',
        url: '/history',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }],
      },
    ],
  };
}
