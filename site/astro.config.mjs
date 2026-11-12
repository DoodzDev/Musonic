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
            { slug: 'docs', label: 'Overview', translations: { fr: 'Vue d’ensemble' } },
            { slug: 'docs/start/how-it-works', label: 'How Musonic works', translations: { fr: 'Comment marche Musonic' } },
            { slug: 'docs/start/compatibility', label: 'What works with which server', translations: { fr: 'Ce qui marche avec quel serveur' } },
            { slug: 'docs/install/docker', label: 'Install with Docker', translations: { fr: 'Installer avec Docker' } },
            { slug: 'docs/install/binary', label: 'Install without Docker', translations: { fr: 'Installer sans Docker' } },
            { slug: 'docs/install/first-start', label: 'First start', translations: { fr: 'Premier démarrage' } },
            { slug: 'docs/install/https', label: 'Reach it from outside (HTTPS)', translations: { fr: 'Y accéder de l’extérieur (HTTPS)' } },
            { slug: 'docs/install/update', label: 'Update the server', translations: { fr: 'Mettre à jour le serveur' } },
          ],
        },
        {
          label: 'Apps',
          translations: { fr: 'Applications' },
          items: [
            { slug: 'docs/apps/android', label: 'Install the Android app', translations: { fr: 'Installer l’appli Android' } },
            { slug: 'docs/apps/sign-in', label: 'Sign in to a server', translations: { fr: 'Se connecter à un serveur' } },
            { slug: 'docs/apps/iphone', label: 'On iPhone and iPad', translations: { fr: 'Sur iPhone et iPad' } },
            { slug: 'docs/apps/web', label: 'The web player', translations: { fr: 'Le lecteur web' } },
            { slug: 'docs/apps/listening', label: 'Listen to music', translations: { fr: 'Écouter de la musique' } },
            { slug: 'docs/apps/import-playlists', label: 'Import your playlists', translations: { fr: 'Importer vos playlists' } },
            { slug: 'docs/apps/podcasts', label: 'Podcasts', translations: { fr: 'Podcasts' } },
            { slug: 'docs/apps/offline', label: 'Offline and data usage', translations: { fr: 'Hors ligne et données mobiles' } },
            { slug: 'docs/apps/android-auto', label: 'Android Auto', translations: { fr: 'Android Auto' } },
            { slug: 'docs/apps/other-clients', label: 'Other Subsonic apps', translations: { fr: 'Autres applis Subsonic' } },
            { slug: 'docs/apps/troubleshooting', label: 'Problems in the app', translations: { fr: 'Problèmes dans l’appli' } },
          ],
        },
        {
          label: 'Music library',
          translations: { fr: 'Bibliothèque musicale' },
          items: [
            { slug: 'docs/library/organize', label: 'Organise your files', translations: { fr: 'Organiser vos fichiers' } },
            { slug: 'docs/library/scan', label: 'Scan and updates', translations: { fr: 'Analyse et mises à jour' } },
            { slug: 'docs/library/online-catalogue', label: 'Online catalogue and imports', translations: { fr: 'Catalogue en ligne et imports' } },
            { slug: 'docs/library/podcasts', label: 'Podcasts on the server', translations: { fr: 'Podcasts sur le serveur' } },
          ],
        },
        {
          label: 'Administration',
          translations: { fr: 'Administration' },
          items: [
            { slug: 'docs/admin/console', label: 'The console', translations: { fr: 'La console' } },
            { slug: 'docs/admin/accounts', label: 'Accounts, rights and devices', translations: { fr: 'Comptes, droits et appareils' } },
            { slug: 'docs/admin/configuration', label: 'Configuration reference', translations: { fr: 'Référence de configuration' } },
            { slug: 'docs/admin/backups', label: 'Backups and restore', translations: { fr: 'Sauvegarde et restauration' } },
            { slug: 'docs/admin/troubleshooting', label: 'Troubleshooting', translations: { fr: 'Dépannage' } },
          ],
        },
        {
          label: 'Coming from Navidrome',
          translations: { fr: 'Venir de Navidrome' },
          items: [
            { slug: 'docs/migration/navidrome', label: 'Migration guide', translations: { fr: 'Guide de migration' } },
          ],
        },
        {
          label: 'Reference',
          translations: { fr: 'Référence' },
          items: [
            { slug: 'docs/reference/audio-quality', label: 'Audio quality', translations: { fr: 'Qualité audio' } },
            { slug: 'docs/reference/privacy', label: 'Privacy and network', translations: { fr: 'Vie privée et réseau' } },
            { slug: 'docs/reference/api', label: 'API', translations: { fr: 'API' } },
            { slug: 'docs/reference/cli', label: 'Command line', translations: { fr: 'Ligne de commande' } },
            { slug: 'docs/reference/architecture', label: 'Architecture', translations: { fr: 'Architecture' } },
          ],
        },
        {
          label: 'About',
          translations: { fr: 'À propos' },
          items: [
            { slug: 'docs/about/benchmark', label: 'Benchmark', translations: { fr: 'Benchmark' } },
            { slug: 'docs/about/benchmark-method', label: 'Benchmark method', translations: { fr: 'Méthode du benchmark' } },
            { slug: 'docs/about/faq', label: 'FAQ', translations: { fr: 'FAQ' } },
            { slug: 'docs/about/license', label: 'Licence', translations: { fr: 'Licence' } },
            { slug: 'docs/about/changelog', label: 'Versions and changes', translations: { fr: 'Versions et changements' } },
          ],
        },
      ],
      // Dark code blocks only, like the rest of the site.
      expressiveCode: { themes: ['github-dark'], styleOverrides: { borderRadius: '10px' } },
      head: [],
    }),
  ],
});
