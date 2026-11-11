/**
 * @file astro.config.mjs
 * @description Musonic website: hand-made showcase pages (src/pages) and the documentation
 *   under /docs/ (Starlight, src/content/docs). English at the root, French under /fr/.
 *   The web client is built separately and copied under /app/ by the Pages workflow.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://musonic.doodz.dev',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Musonic',
      logo: { src: './src/assets/logo.svg' },
      favicon: '/assets/img/logo.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/DoodzDev/Musonic' }],
      customCss: ['@fontsource-variable/inter', './src/styles/tokens.css', './src/styles/docs.css'],
      sidebar: [
        {
          label: 'Get started',
          translations: { fr: 'Commencer' },
          items: [
            { slug: 'docs', label: 'Overview', translations: { fr: 'Vue d\'ensemble' } },
            { slug: 'docs/install/docker', label: 'Install with Docker', translations: { fr: 'Installer avec Docker' } },
          ],
        },
      ],
      // Dark code blocks only, like the rest of the site.
      expressiveCode: { themes: ['github-dark'], styleOverrides: { borderRadius: '10px' } },
      head: [],
    }),
  ],
});
