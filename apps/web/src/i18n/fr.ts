/**
 * @file fr.ts
 * @description French strings of the web client (source of truth for translations).
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

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
  sidebar: {
    home: 'Accueil',
    playlists: 'Playlists',
    logout: 'Se déconnecter',
    titles: (n: number) => `${n} titre${n > 1 ? 's' : ''}`,
  },
  playlist: {
    kind: 'Playlist',
    play: 'Lecture',
    columns: { index: '#', title: 'Titre', album: 'Album', duration: 'Durée' },
    playTrack: (title: string) => `Lire ${title}`,
    loading: 'Chargement…',
    empty: 'Cette playlist est vide.',
    error: 'Impossible de charger la playlist.',
    nowPlaying: 'En cours de lecture',
    pick: 'Choisis une playlist dans la barre latérale.',
    meta: (owner: string | undefined, count: number, duration: string) =>
      [owner, `${count} titre${count > 1 ? 's' : ''}`, duration].filter(Boolean).join(' · '),
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
