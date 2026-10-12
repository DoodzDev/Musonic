/**
 * @file fr.ts
 * @description French strings of the web client (source of truth for translations).
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export const fr = {
  login: {
    tagline: 'Connecte ton serveur de musique',
    server: 'Adresse du serveur',
    serverPlaceholder: 'https://music.exemple.com',
    username: 'Identifiant',
    usernamePlaceholder: 'Ton identifiant',
    password: 'Mot de passe',
    passwordPlaceholder: 'Ton mot de passe',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    footnote: 'Fonctionne avec Navidrome et les serveurs compatibles Subsonic. Ton mot de passe n’est jamais envoyé en clair.',
    errors: {
      auth: 'Identifiant ou mot de passe incorrect.',
      unreachable: 'Serveur injoignable. Vérifie l’adresse et ta connexion.',
      invalidUrl: 'Adresse invalide. Exemple : https://music.exemple.com',
      generic: 'La connexion a échoué.',
    },
  },
  nav: {
    main: 'Navigation principale',
    home: 'Accueil',
    playlists: 'Playlists',
    likedSongs: 'Titres likés',
    logout: 'Se déconnecter',
    titles: (n: number) => plural(n, 'titre', 'titres'),
  },
  home: {
    title: 'Accueil',
    filters: { all: 'Tout', playlists: 'Playlists', albums: 'Albums', artists: 'Artistes' },
    filtersLabel: 'Filtres',
    quickAccess: 'Accès rapide',
    shelves: {
      recent: () => 'Écoutés récemment',
      favoriteArtists: () => 'Vos artistes préférés',
      moreLike: (name?: string) => `Plus dans le style de ${name ?? ''}`,
      likedAlbums: () => 'Albums avec des titres que vous aimez',
      becauseLiked: (title?: string) => `Parce que vous avez aimé « ${title ?? ''} »`,
      magicMixes: () => 'Mix Magiques',
      rediscover: () => 'À redécouvrir',
      newest: () => 'Nouveautés dans ta bibliothèque',
      random: () => 'Au hasard',
    },
    subtitles: {
      magicMixes: 'Tes titres et des découvertes, par ambiance',
      rediscover: 'Des albums que tu as beaucoup écoutés',
    } as Partial<Record<string, string>>,
    error: 'Impossible de charger l’accueil.',
    empty: 'Ta bibliothèque est encore vide : écoute quelques titres et l’accueil se remplira.',
  },
  card: {
    play: (name: string) => `Lire ${name}`,
    artist: 'Artiste',
    mix: (genre: string) => `Mix ${genre}`,
    mixSub: 'Mix Magique',
    magic: 'Magique',
    likedSub: (n: number) => plural(n, 'titre', 'titres'),
    playlistSub: (n: number) => `Playlist · ${plural(n, 'titre', 'titres')}`,
  },
  page: {
    loading: 'Chargement…',
    error: 'Impossible de charger cette page.',
    play: 'Lecture',
    playlist: 'Playlist',
    album: 'Album',
    artist: 'Artiste',
    likedSongs: 'Titres likés',
    meta: (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · '),
    titles: (n: number) => plural(n, 'titre', 'titres'),
    albums: (n: number) => plural(n, 'album', 'albums'),
    empty: 'Aucun titre pour l’instant.',
    moreBy: (artist: string) => `Plus de ${artist}`,
    popular: 'Titres populaires',
    discography: 'Discographie',
    similarArtists: 'Artistes similaires',
  },
  table: {
    index: '#',
    title: 'Titre',
    album: 'Album',
    duration: 'Durée',
    playTrack: (title: string) => `Lire ${title}`,
    nowPlaying: 'En cours de lecture',
  },
  crash: {
    message: 'Un problème est survenu à l’affichage.',
    reload: 'Recharger',
  },
  player: {
    play: 'Lecture',
    pause: 'Pause',
    previous: 'Titre précédent',
    next: 'Titre suivant',
    position: 'Position de lecture',
    volume: 'Volume',
    mute: 'Couper le son',
    unmute: 'Réactiver le son',
    idle: 'Aucun titre en lecture',
    error: 'Lecture impossible pour ce titre.',
  },
};
