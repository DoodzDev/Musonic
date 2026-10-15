/**
 * @file fr.ts
 * @description French UI strings — single source of truth for all user-visible text.
 *   Add keys here first, then mirror them in en.ts. The i18n/index.ts hook
 *   selects the active locale based on settingsStore.language.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
// French UI strings — single source of truth for all user-visible text.
// Swap this import for another locale file to add a new language.
export const t = {

  // ─── Common ────────────────────────────────────────────────────────────────
  common: {
    retry: 'Réessayer',
    back: 'Retour',
  },

  // ─── Design v2 components ──────────────────────────────────────────────────
  ui: {
    seeAll: 'Tout voir',
    clearSearch: 'Effacer la recherche',
    badgeOnline: 'En ligne',
    badgeMagic: 'Magique',
    badgeDownloaded: 'Téléchargé',
    badgeLossless: 'Lossless',
    like: 'Ajouter aux titres likés',
    unlike: 'Retirer des titres likés',
    addToPlaylist: 'Ajouter à une playlist',
    download: 'Télécharger',
    downloading: 'Téléchargement en cours',
    nowPlaying: 'En cours de lecture',
    unavailableOffline: 'Indisponible hors ligne',
    open: 'Ouvrir',
    close: 'Fermer',
    play: 'Lecture',
    pause: 'Pause',
    nextTrack: 'Titre suivant',
    previousTrack: 'Titre précédent',
    openPlayer: 'Ouvre le lecteur',
    searchTab: 'Recherche',
    profile: 'Profil',
    accounts: 'Comptes',
    addAccount: 'Ajouter un compte',
    offlineMode: 'Mode hors ligne',
    storage: 'Stockage',
    about: 'À propos',
    website: 'Site de Musonic',
  },

  // ─── Server Setup ──────────────────────────────────────────────────────────
  serverSetup: {
    appName: 'Musonic',
    subtitle: 'Connecte ton serveur Subsonic',
    serverNameLabel: 'Nom du serveur',
    serverNamePlaceholder: 'Mon serveur',
    serverUrlLabel: 'URL du serveur',
    serverUrlPlaceholder: 'https://music.exemple.com',
    usernameLabel: 'Identifiant',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Mot de passe',
    connectButton: 'Se connecter',
    savedAccounts: 'Comptes enregistrés',
    successMessage: '✓ Connecté ! Chargement...',
    missingFieldsTitle: 'Champs manquants',
    missingFieldsBody: 'URL, identifiant et mot de passe requis.',
    errors: {
      wrongCredentials: 'Identifiant ou mot de passe incorrect',
      clientError: (code: number) => `Erreur serveur (${code}) — vérifie l'URL`,
      serverError: (code: number) => `Erreur serveur (${code}) — le serveur est en panne`,
      timeout: "Connexion trop lente — délai dépassé",
      unreachable: "Serveur introuvable — vérifie l'URL",
      generic: 'Connexion impossible',
    },
    httpWarning: 'HTTP au lieu de HTTPS — tes identifiants peuvent transiter en clair.',
  },

  // ─── Tab Bar ───────────────────────────────────────────────────────────────
  tabs: {
    home: 'Accueil',
    search: 'Recherche',
    library: 'Bibliothèque',
    libraryShort: 'Biblio.',
  },

  // ─── Drawer / Navigation ───────────────────────────────────────────────────
  drawer: {
    settings: 'Réglages',
    logout: 'Se déconnecter',
    logoutTitle: 'Se déconnecter',
    logoutMessage: (name: string, url: string) =>
      `Voulez-vous vous déconnecter de :\n\n${name}\n${url}`,
    logoutConfirm: 'Déconnecter',
    cancelButton: 'Annuler',
    goOffline: 'Passer hors-ligne',
    goOnline: 'Repasser en ligne',
    offlineActive: 'Actif',
    pingFailed: 'Connexion impossible',
    pingFailedMessage: "Nous n'arrivons pas à joindre le serveur. Vérifiez vos paramètres réseau ou l'état de votre connexion. Ou tentez de fermer et relancer l'application.",
    storageLabel: 'Espace musiques téléchargées',
  },

  // ─── Home ──────────────────────────────────────────────────────────────────
  home: {
    title: 'Accueil',
    likedSongs: 'Titres likés',
    myMusic: 'Ma Musique',
    unknownTitle: 'Titre inconnu',
    unknownArtist: 'Artiste inconnu',
    loadError: "Impossible de charger la page d'accueil",
    offlineEmptyState: 'Contenu non disponible hors-ligne',
    offlineSaved: 'Hors ligne : dernier accueil chargé',
    typeSingle: 'Titre',
    typeAlbum: 'Album',
    typePlaylist: 'Playlist',
    typeArtist: 'Artiste',
    /** Card subtitle: the kind, then the artist when known. */
    kindLine: (kind: string, artist?: string) => (artist ? `${kind} · ${artist}` : kind),
    mixSubtitle: (count: number) => `Mix Magique · ${count} titre${count > 1 ? 's' : ''}`,
    playAlbum: (title: string) => `Lire l'album ${title}`,
    date: (d: Date) => {
      const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
    },
    filters: {
      all: 'Tout',
      playlists: 'Playlists',
      albums: 'Albums',
      artists: 'Artistes',
    },
    sections: {
      recent: 'Écoutés récemment',
      forYou: 'Pour vous',
      forYouFrom: (names: string) => `D'après ${names}`,
      discover: 'Artistes à découvrir',
      favoriteArtists: 'Tes artistes préférés',
      moreLike: (name: string) => `Plus dans le style de ${name}`,
      likedAlbums: 'Albums de tes titres likés',
      becauseLiked: (title: string) => `Parce que tu as aimé « ${title} »`,
      magicMixes: 'Mix Magiques',
      magicMixesSubtitle: 'Tes titres et des découvertes, par ambiance',
      rediscover: 'À redécouvrir',
      newest: 'Nouveautés dans ta bibliothèque',
      random: 'Au hasard',
    },
    playMix: (genre: string) => `Écouter le Mix Magique ${genre}`,
  },

  // ─── Search ────────────────────────────────────────────────────────────────
  search: {
    headerTitle: 'Rechercher',
    placeholder: 'Que souhaitez-vous écouter ?',
    browseAll: 'Parcourir tout',
    trackType: 'Titre',
    artistType: 'Artiste',
    albumType: 'Album',
    noResults: (q: string) => `Aucun résultat pour "${q}"`,
    sections: {
      songs: 'Titres',
      artists: 'Artistes',
      albums: 'Albums',
    },
    history: {
      title: 'Recherches récentes',
      clear: 'Effacer',
    },
    offlineEmptyState: 'Recherche non disponible hors-ligne',
    discover: {
      sectionTitle: 'Découvrir',
      loading: 'Chargement des recommandations...',
      empty: 'Likez des titres pour obtenir des recommandations',
      basedOnLikes: 'Selon vos titres likés',
      albumsBasedOnLikes: 'Albums basés sur vos titres likés',
      tracksBasedOnLikes: 'Titres basés sur vos titres likés',
      basedOnRecent: 'Selon vos dernières écoutes',
      sameStyle: (artist: string) => `Dans le même style que ${artist}`,
      sameStyleTitle: 'Dans le même style que…',
    },
  },

  // ─── Library ───────────────────────────────────────────────────────────────
  library: {
    title: 'Bibliothèque',
    sortTitle: 'Trier par',
    emptyState: 'Aucun élément',
    loadError: 'Impossible de charger la bibliothèque',
    offlineEmptyState: 'Aucun contenu téléchargé',
    offlineDownloadTitle: 'Télécharger la playlist ?',
    offlineDownloadMessage: (name: string, n: number) =>
      `Télécharger "${name}" pour une écoute hors-ligne ? (${n} titre${n !== 1 ? 's' : ''})`,
    offlineDownloadComplete: (name: string) => `"${name}" disponible hors-ligne`,
    likedTrackCount: (n: number) =>
      `${n} titre${n !== 1 ? 's' : ''} aimé${n !== 1 ? 's' : ''}`,
    createPlaylistTitle: 'Nouvelle playlist',
    searchLibrary: 'Rechercher dans la bibliothèque',
    searchCancel: 'Annuler',
    searchNoResult: 'Aucune playlist trouvée',
    createPlaylistPlaceholder: 'Nom de la playlist',
    createPlaylistCancel: 'Annuler',
    createPlaylistConfirm: 'Créer',
    createPlaylistError: 'Impossible de créer la playlist',
    sort: {
      recent: 'Récents',
      added: 'Ajoutés récemment',
      alpha: 'Alphabétique',
      custom: 'Personnalisé',
    },
  },

  // ─── Liked Songs ───────────────────────────────────────────────────────────
  likedSongs: {
    title: 'Titres likés',
    emptyState: "Aucun titre liké pour l'instant",
    trackCount: (n: number) => `${n} titre${n !== 1 ? 's' : ''}`,
    recommendedButton: 'Titres recommandés',
    searchPlaceholder: 'Rechercher dans les titres likés',
  },

  // ─── Liked Recommendations ─────────────────────────────────────────────────
  likedRecommendations: {
    title: 'Recommandé pour vous',
    subtitle: 'Basé sur vos titres likés',
    loading: 'Recherche de recommandations…',
    emptyState: 'Aucune recommandation disponible pour le moment',
  },

  // ─── Ma Musique (bibliothèque complète) ────────────────────────────────────
  allSongs: {
    title: 'Ma Musique',
    tileSubtitle: 'Toute votre bibliothèque',
    trackCount: (n: number) => `${n} titre${n !== 1 ? 's' : ''}`,
    searchPlaceholder: 'Rechercher dans ma musique',
    searchEmpty: 'Aucun titre trouvé',
    loadingLibrary: 'Chargement de toute votre bibliothèque…',
  },

  // ─── Playlist Detail ───────────────────────────────────────────────────────
  playlistDetail: {
    trackCount: (n: number) => `${n} titre${n !== 1 ? 's' : ''}`,
    contextLabel: 'LECTURE À PARTIR DE PLAYLIST',
    searchPlaceholder: 'Rechercher sur cette page',
    pills: {
      edit: 'Modifier',
      sort: 'Trier',
      info: 'Nom et informations',
    },
    comingSoon: 'Bientôt disponible',
    noDownloadedSongs: 'Aucun titre téléchargé dans cette playlist',
    offlineRecoLabel: 'Suggestions basées sur vos téléchargements',
    editHeader: 'Modifier la playlist',
    saveButton: 'Sauvegarder',
    savedToast: 'Playlist mise à jour',
    saveError: 'Erreur lors de la sauvegarde',
    recommendations: {
      title: 'Titres recommandés',
      subtitle: 'Basée sur les titres de cette playlist',
      loading: 'Chargement des recommandations...',
      added: 'Ajouté à la playlist',
      notOnServer: 'Titre pas encore sur ton serveur',
    },
  },

  // ─── Song Options Sheet ────────────────────────────────────────────────────
  songOptions: {
    download: 'Télécharger',
    downloadQueued: 'Téléchargement ajouté',
    addToPlaylist: 'Ajouter à la playlist',
    removeFromPlaylist: 'Supprimer de cette playlist',
    addToQueue: "Ajouter à la file d'attente",
    goToAlbum: "Accéder à l'album",
    goToArtist: "Accéder à l'artiste",
    addedToQueue: "Ajouté à la file d'attente",
    removedFromPlaylist: 'Titre supprimé de la playlist',
    addToLiked: 'Ajouter aux titres likés',
    removeFromLiked: 'Supprimer des titres likés',
    manageInPlaylists: 'Gérer dans mes playlists',
    addError: "Erreur lors de l'ajout",
    removeError: 'Erreur lors de la suppression',
  },

  // ─── Playlist Options Sheet ────────────────────────────────────────────────
  playlistOptions: {
    addToQueue: "Ajouter à la file d'attente",
    download: 'Télécharger',
    pin: 'Épingler la playlist',
    unpin: 'Désépingler la playlist',
    rename: 'Renommer la playlist',
    delete: 'Supprimer la playlist',
    pinnedToast: 'Playlist épinglée',
    unpinnedToast: 'Playlist désépinglée',
    renamedToast: 'Playlist renommée',
    deletedToast: 'Playlist supprimée',
    queuedToast: (n: number) =>
      `${n} titre${n !== 1 ? 's' : ''} ajouté${n !== 1 ? 's' : ''} à la file d'attente`,
    deleteTitle: 'Supprimer la playlist',
    deleteMessage: (name: string) => `Supprimer "${name}" définitivement ?`,
    deleteConfirm: 'Supprimer',
    cancelButton: 'Annuler',
    byYou: 'par Vous',
    trackCount: (n: number) => `${n} titre${n !== 1 ? 's' : ''}`,
    queueError: "Erreur lors de l'ajout à la file d'attente",
    renameError: 'Erreur lors du renommage',
    deleteError: 'Erreur lors de la suppression',
    comingSoon: 'Bientôt disponible',
    editPlaylist: 'Modifier la playlist',
    nameAndInfo: 'Nom et informations',
    editCover: 'Modifier la pochette',
    addAllToPlaylist: 'Ajouter à une autre playlist',
    addedAllToPlaylist: (n: number, name: string) => `${n} titre${n !== 1 ? 's' : ''} ajouté${n !== 1 ? 's' : ''} dans ${name}`,
    addToPlaylistError: "Erreur lors de l'ajout à la playlist",
  },

  // ─── Rename Modal ──────────────────────────────────────────────────────────
  renameModal: {
    title: 'Renommer la playlist',
    cancelButton: 'Annuler',
    confirmButton: 'Renommer',
  },

  // ─── Playlist Info Modal ──────────────────────────────────────────────────
  playlistInfo: {
    title: 'Nom et informations',
    cancel: 'Annuler',
    save: 'Sauvegarder',
    nameLabel: 'Titre de la playlist',
    namePlaceholder: 'Nom de la playlist',
    descriptionPlaceholder: 'Description (optionnelle)',
    deletePlaylist: 'Supprimer la playlist',
    deleteTitle: 'Supprimer la playlist ?',
    deleteMessage: (name: string) => `Voulez-vous vraiment supprimer "${name}" ?`,
    deleteConfirm: 'Supprimer',
    deleteCancel: 'Annuler',
    saved: 'Informations sauvegardées',
    saveError: 'Erreur lors de la sauvegarde',
    coverTitle: 'Pochette',
    resetCover: 'Remettre par défaut',
    editCover: 'Modifier la pochette',
    coverChanged: 'Pochette modifiée',
    coverReset: 'Pochette réinitialisée',
  },

  // ─── Add to Playlist Sheet ─────────────────────────────────────────────────
  addToPlaylist: {
    searchPlaceholder: 'Trouver une playlist',
    sortButton: 'Trier',
    newPlaylist: 'Nouvelle playlist',
    savedIn: 'Enregistrée dans',
    addedTo: (title: string, name: string) => { const shortTitle = title.length > 15 ? title.slice(0, 15) + '…' : title; const n = name.length > 15 ? name.slice(0, 15) + '…' : name; return `Titre « ${shortTitle} » ajouté à la playlist « ${n} ».`; },
    removedFrom: (name: string) => `Supprimé de ${name}.`,
    queuedTracks: (n: number) => `${n} titres ajoutés à la file d'attente`,
    queueError: "Erreur lors de l'ajout à la file d'attente",
    trackCount: (n: number) => `${n} titre${n !== 1 ? 's' : ''}`,
    unavailableTrack: 'Titre non disponible localement',
  },

  // ─── Create Playlist Modal ─────────────────────────────────────────────────
  createPlaylist: {
    title: 'Donnez un nom à votre playlist',
    placeholder: 'Ma playlist',
    cancelButton: 'Annuler',
    createButton: 'Créer',
  },

  // ─── Queue Sheet ───────────────────────────────────────────────────────────
  queue: {
    title: "File d'attente",
    close: "Fermer la file d'attente",
    backToPlayer: 'Revenir au lecteur',
    upNext: 'À suivre',
    from: (name: string) => `Depuis ${name}`,
    fallbackName: 'Musique',
    shuffleOn: 'Aléatoire',
    shuffleMagic: 'Aléatoire magique',
    modifyButton: 'Modifier',
    done: 'Terminé',
    select: (title: string) => `Sélectionner ${title}`,
    deselect: (title: string) => `Désélectionner ${title}`,
    reorder: (title: string) => `Déplacer ${title}`,
    magicSuggestion: 'Suggestion magique',
    empty: 'Rien à suivre',
    playNext: 'Lire ensuite',
    removeCount: (count: number) => `Retirer (${count})`,
    clearAll: 'Tout effacer',
    clearedToast: 'File vidée',
    unreadableToast: 'Titre illisible, passage au suivant',
    playbackFailedToast: 'Lecture impossible. Vérifie ta connexion.',
    magicOfflineToast: 'Magique indisponible hors ligne',
    undo: 'Annuler',
    shuffleTile: 'Aléatoire',
    repeatTile: 'Répéter',
    autoplayTile: 'Lecture auto',
    autoplayTitle: 'Lecture automatique',
    autoplaySubtitle: 'Titres similaires après la fin de la file',
  },

  // ─── Like Retry Manager ────────────────────────────────────────────────────
  likes: {
    addedToLiked: 'Ajouté aux titres likés',
    addedToLikedNamed: (title: string) => `« ${title} » ajouté aux titres likés`,
    removedFromLiked: 'Supprimé des titres likés',
    indexError: "Impossible d'ajouter : titre non indexé sur le serveur",
    unavailableTrack: 'Titre non disponible localement',
    sendingToServer: 'Envoi vers votre serveur…',
    stillImporting: 'Import en cours, veuillez patienter…',
    sendError: "Impossible d'importer le titre",
  },

  // ─── Offline Banner ────────────────────────────────────────────────────────
  offline: {
    noInternet: 'Pas de connexion internet',
    serverUnreachable: 'Serveur injoignable',
    offlineModeActive: 'Mode hors-ligne',
    goOffline: 'Mode hors-ligne',
  },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    title: 'Réglages',
    language: {
      sectionTitle: 'Langue',
    },
    sections: {
      player: 'Lecteur',
      transitions: 'Transitions entre les titres',
      playback: "Contrôles d'écoute",
      downloads: 'Téléchargements',
      display: 'Affichage',
      offline: 'Mode hors-ligne',
    },
    player: {
      progressLabel: 'Style de la barre de progression',
      progressDesc:
        "Choisissez comment visualiser l'avancement de la musique dans le lecteur complet.",
      classic: 'Classique',
      waveform: 'Onde Sonore',
    },
    transitions: {
      crossfadeLabel: 'Fondu entre les titres',
      crossfadeDesc: 'Baisse le volume en fin de titre et remonte en début du suivant.',
    },
    playback: {
      monoLabel: 'Contenu audio mono',
      monoDesc: 'Les enceintes gauche et droite diffusent le même contenu audio.',
      autoplayLabel: 'Lecture automatique',
      autoplayDesc: "Lance automatiquement des titres similaires à la fin de la file d'attente.",
      alwaysPreviousLabel: "Précédent revient toujours au titre d'avant",
      alwaysPreviousDesc: 'Sinon, après 3 secondes, Précédent redémarre le titre.',
      autoDownloadLabel: 'Téléchargement auto.',
      autoDownloadDesc: "Télécharge les titres sur l'appareil pour une écoute hors-ligne.",
      autoDownloadAlertTitle: 'Téléchargement automatique',
      autoDownloadAlertMessage: "Attention : L'auto-téléchargement consomme de l'espace de stockage sur votre téléphone ET de la bande passante sur votre serveur (Navidrome). Voulez-vous vraiment l'activer ?",
      autoDownloadAlertConfirm: 'Activer',
      autoDownloadAlertCancel: 'Annuler',
    },
    display: {
      lockRotationLabel: "Verrouiller la rotation de l'écran",
      lockRotationDesc:
        "Force l'affichage en portrait, même si le téléphone est penché.",
      navBarPositionLabel: 'Barre de navigation (mode paysage)',
      navBarLeft: 'Gauche',
      navBarRight: 'Droite',
      fullscreenLabel: 'Mode plein écran',
      fullscreenDesc: "Masquer l'heure, le wifi, la batterie et les notifications en haut de l'écran.",
      fullPlayerLayoutLabel: 'Disposition du lecteur (horizontal)',
      fullPlayerLayoutDesc: "Choisir de quel côté afficher la pochette quand le lecteur plein écran est en mode horizontal.",
      fullPlayerCoverLeft: 'Pochette à gauche',
      fullPlayerCoverRight: 'Pochette à droite',
    },
    offline: {
      autoOnlineLabel: 'Reconnexion automatique',
      autoOnlineDesc: "Repasse en ligne automatiquement quand le serveur est de nouveau accessible.",
    },
    updates: {
      sectionTitle: 'Informations',
      checkButton: 'Vérifier les mises à jour',
      upToDateTitle: 'Vous êtes à jour',
      upToDateMessage: (local: string, remote: string) =>
        `Vous êtes actuellement sur la dernière version disponible.\nVotre version : v${local}\nDernière version en ligne : v${remote}`,
      newVersionTitle: 'Mise à jour disponible',
      newVersionMessage: (v: string) => `La version ${v} est disponible sur GitHub.`,
      viewRelease: 'Voir la release',
      error: 'Vérification impossible. Vérifiez votre connexion.',
    },
  },

  // ─── Downloads ────────────────────────────────────────────────────────────────
  downloads: {
    deleteSongTitle: 'Supprimer ce téléchargement',
    deleteSongMessage: (title: string) => `Supprimer « ${title} » de vos téléchargements ?`,
    deletePlaylistTitle: 'Supprimer les téléchargements',
    deletePlaylistMessage: (name: string, n: number) =>
      `Supprimer la playlist « ${name} » (${n} musique${n !== 1 ? 's' : ''}) de vos téléchargements ?`,
    deleteConfirm: 'Supprimer',
    cancelButton: 'Annuler',
  },

  // ─── Full Screen Player ────────────────────────────────────────────────────
  fullScreenPlayer: {
    lyricsTitle: 'Paroles',
    close: 'Réduire le lecteur',
    options: 'Options du titre',
    addToPlaylist: 'Ajouter à une playlist',
    like: 'Ajouter aux titres likés',
    unlike: 'Retirer des titres likés',
    downloaded: 'Téléchargé',
    position: 'Position de lecture',
    quality: (q: string) => `Qualité : ${q}`,
    play: 'Lecture',
    pause: 'Pause',
    previous: 'Titre précédent',
    next: 'Titre suivant',
    queue: "File d'attente",
    shuffleOff: 'Lecture aléatoire désactivée',
    shuffleOn: 'Lecture aléatoire activée',
    shuffleMagic: 'Lecture aléatoire magique',
    repeatOff: 'Répétition désactivée',
    repeatAll: 'Répéter la file',
    repeatOne: 'Répéter le titre',
  },

  // ─── Lyrics Screen ─────────────────────────────────────────────────────────
  lyricsScreen: {
    noLyrics: 'Paroles non disponibles',
  },

  // ─── Artist Detail ─────────────────────────────────────────────────────────
  artistDetail: {
    unknownArtist: 'Artiste inconnu',
    loading: 'Chargement...',
    popularSongs: 'Populaires',
    popularReleases: 'Sorties populaires',
    similarRecommendations: 'Dans le même style',
  },

  // ─── Album Detail ──────────────────────────────────────────────────────────
  albumDetail: {
    unknownYear: 'Année inconnue',
    unknownAlbum: 'Album inconnu',
    addedToLibrary: 'Album ajouté à la bibliothèque',
    removedFromLibrary: 'Album retiré de la bibliothèque',
    addToLibrary: 'Ajouter à la bibliothèque',
    removeFromLibraryAction: 'Retirer de la bibliothèque',
    importingAlbum: 'Import de l’album vers votre serveur…',
    stillImportingAlbum: 'Import toujours en cours, veuillez patienter…',
    importError: 'Échec de l’import de l’album',
  },

} as const;

export type Translations = typeof t;
