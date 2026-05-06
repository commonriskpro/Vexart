import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://vexart.dev',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'Vexart',
      description: 'Pixel-native, GPU-accelerated terminal UI engine. Write JSX, get browser-quality UI in your terminal.',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/commonriskpro/Vexart' },
      ],
      customCss: [
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-sans/700.css',
        '@fontsource/jetbrains-mono/400.css',
        '@fontsource/jetbrains-mono/500.css',
        './src/styles/custom.css',
      ],
      expressiveCode: {
        themes: ['github-dark'],
        styleOverrides: { borderRadius: '0.75rem' },
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { slug: 'guides/introduction' },
            { slug: 'guides/installation' },
            { slug: 'guides/first-app' },
            { slug: 'guides/examples' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { slug: 'concepts/architecture' },
            { slug: 'concepts/layout' },
            { slug: 'concepts/visual-effects' },
            { slug: 'concepts/interactivity' },
            { slug: 'concepts/animations' },
            { slug: 'concepts/data-fetching' },
          ],
        },
        {
          label: 'Components',
          items: [
            { slug: 'components/overview' },
            { slug: 'components/primitives' },
            { slug: 'components/headless' },
            { slug: 'components/styled' },
          ],
        },
        {
          label: 'Theming',
          items: [
            { slug: 'theming/tokens' },
            { slug: 'theming/custom-themes' },
          ],
        },
        {
          label: 'Reference',
          collapsed: true,
          items: [
            { slug: 'reference/engine-api' },
            { slug: 'reference/ffi-exports' },
            { slug: 'reference/terminal-support' },
            { slug: 'reference/licensing' },
          ],
        },
      ],
    }),
    react(),
  ],
})
