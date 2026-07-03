import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Briscas',
  description: 'OO/SOLID Briscas game built with Vite, TypeScript, React, and Firebase.',
  base: process.env.GITHUB_PAGES === 'true' ? '/briscas/docs/' : '/',
  themeConfig: {
    nav: [
      { text: 'Overview', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Diagrams', link: '/diagrams/' },
      { text: 'Deployment', link: '/deployment' },
    ],
    sidebar: [
      { text: 'Overview', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Domain Model', link: '/domain-model' },
      { text: 'SOLID Principles', link: '/solid-principles' },
      { text: 'Firestore Multiplayer', link: '/multiplayer-firestore' },
      { text: 'Deployment', link: '/deployment' },
      { text: 'API Reference', link: '/api/' },
      { text: 'UML Diagrams', link: '/diagrams/' },
    ],
    search: {
      provider: 'local',
    },
  },
});
