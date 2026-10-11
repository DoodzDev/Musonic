/**
 * @file en.ts
 * @description English UI strings. Mirrors the structure of fr.ts exactly.
 *   Swap the active locale in i18n/index.ts to enable English.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
export const en = {

  // ─── Common ────────────────────────────────────────────────────────────────
  common: {
    retry: 'Retry',
  },

  // ─── Design v2 components ──────────────────────────────────────────────────
  ui: {
    seeAll: 'See all',
    clearSearch: 'Clear search',
    badgeOnline: 'Online',
    badgeMagic: 'Magic',
    badgeDownloaded: 'Downloaded',
    badgeLossless: 'Lossless',
    like: 'Add to liked songs',
    unlike: 'Remove from liked songs',
    addToPlaylist: 'Add to a playlist',
    download: 'Download',
    downloading: 'Downloading',
    nowPlaying: 'Now playing',
    unavailableOffline: 'Unavailable offline',
    open: 'Open',
    close: 'Close',
    play: 'Play',
    pause: 'Pause',
    nextTrack: 'Next track',
    previousTrack: 'Previous track',
    openPlayer: 'Opens the player',
    searchTab: 'Search',
    profile: 'Profile',
    accounts: 'Accounts',
    addAccount: 'Add an account',
    offlineMode: 'Offline mode',
    storage: 'Storage',
    about: 'About',
    website: 'Musonic website',
  },

  // ─── Server Setup ──────────────────────────────────────────────────────────
  serverSetup: {
    appName: 'Musonic',
    subtitle: 'Connect your Subsonic server',
    serverNameLabel: 'Server name',
    serverNamePlaceholder: 'My server',
    serverUrlLabel: 'Server URL',
    serverUrlPlaceholder: 'https://music.example.com',
    usernameLabel: 'Username',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Password',
    connectButton: 'Connect',
    savedAccounts: 'Saved accounts',
    successMessage: '✓ Connected! Loading...',
    missingFieldsTitle: 'Missing fields',
    missingFieldsBody: 'URL, username and password are required.',
    errors: {
      wrongCredentials: 'Wrong username or password',
      clientError: (code: number) => `Client error (${code}) — check the URL`,
      serverError: (code: number) => `Server error (${code}) — server is down`,
      timeout: 'Connection timed out',
      unreachable: 'Server not found — check the URL',
      generic: 'Unable to connect',
    },
    httpWarning: 'Using HTTP instead of HTTPS. Your credentials may be sent in plaintext.',
  },

  // ─── Tab Bar ───────────────────────────────────────────────────────────────
  tabs: {
    home: 'Home',
    search: 'Search',
    library: 'Library',
    libraryShort: 'Library',
  },

  // ─── Drawer / Navigation ───────────────────────────────────────────────────
  drawer: {
    settings: 'Settings',
    logout: 'Log out',
    logoutTitle: 'Log out',
    logoutMessage: (name: string, url: string) =>
      `Log out of:\n\n${name}\n${url}`,
    logoutConfirm: 'Log out',
    cancelButton: 'Cancel',
    goOffline: 'Go offline',
    goOnline: 'Back online',
    offlineActive: 'Active',
    pingFailed: 'Cannot connect to server',
    pingFailedMessage: 'Unable to reach the server. Check your network settings or your connection status, or try closing and reopening the app.',
    storageLabel: 'Downloaded music storage',
  },

  // ─── Home ──────────────────────────────────────────────────────────────────
  home: {
    likedSongs: 'Liked Songs',
    unknownTitle: 'Unknown title',
    unknownArtist: 'Unknown artist',
    loadError: 'Could not load home',
    offlineEmptyState: 'Content not available offline',
    typeSingle: 'Single',
    typeAlbum: 'Album',
    filters: {
      all: 'All',
      recent: 'Recent',
      frequent: 'Frequent',
      reco: 'Picks',
      discover: 'Discover',
    },
    sections: {
      recentlyPlayed: 'Recently played',
      frequentlyPlayed: 'Played often',
      recommendations: 'Recommendations',
      discover: 'Discover',
    },
  },

  // ─── Search ────────────────────────────────────────────────────────────────
  search: {
    headerTitle: 'Search',
    placeholder: 'What do you want to listen to?',
    browseAll: 'Browse all',
    trackType: 'Track',
    artistType: 'Artist',
    albumType: 'Album',
    noResults: (q: string) => `No results for "${q}"`,
    sections: {
      songs: 'Songs',
      artists: 'Artists',
      albums: 'Albums',
    },
    history: {
      title: 'Recent searches',
      clear: 'Clear',
    },
    offlineEmptyState: 'Search not available offline',
    discover: {
      sectionTitle: 'Discover',
      loading: 'Loading recommendations...',
      empty: 'Like some tracks to get recommendations',
      basedOnLikes: 'Based on your liked songs',
      albumsBasedOnLikes: 'Albums based on your liked songs',
      tracksBasedOnLikes: 'Tracks based on your liked songs',
      basedOnRecent: 'Based on recent listens',
      sameStyle: (artist: string) => `In the same style as ${artist}`,
      sameStyleTitle: 'In the same style as…',
    },
  },

  // ─── Library ───────────────────────────────────────────────────────────────
  library: {
    title: 'Library',
    sortTitle: 'Sort by',
    emptyState: 'Nothing here yet',
    loadError: 'Could not load library',
    offlineEmptyState: 'No downloaded content',
    offlineDownloadTitle: 'Download playlist?',
    offlineDownloadMessage: (name: string, n: number) =>
      `Download "${name}" for offline playback? (${n} song${n !== 1 ? 's' : ''})`,
    offlineDownloadComplete: (name: string) => `"${name}" available offline`,
    likedTrackCount: (n: number) => `${n} liked song${n !== 1 ? 's' : ''}`,
    createPlaylistTitle: 'New playlist',
    createPlaylistPlaceholder: 'Playlist name',
    createPlaylistCancel: 'Cancel',
    createPlaylistConfirm: 'Create',
    createPlaylistError: 'Could not create playlist',
    sort: {
      recent: 'Recent',
      added: 'Recently added',
      alpha: 'Alphabetical',
      custom: 'Custom',
    },
  },

  // ─── Liked Songs ───────────────────────────────────────────────────────────
  likedSongs: {
    title: 'Liked Songs',
    emptyState: 'No liked songs yet',
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    recommendedButton: 'Recommended tracks',
    searchPlaceholder: 'Search in Liked Songs',
  },

  // ─── Liked Recommendations ─────────────────────────────────────────────────
  likedRecommendations: {
    title: 'Recommended for you',
    subtitle: 'Based on your liked songs',
    loading: 'Finding recommendations…',
    emptyState: 'No recommendations available right now',
  },

  // ─── All Songs (full library) ──────────────────────────────────────────────
  allSongs: {
    title: 'My Music',
    tileSubtitle: 'Your entire library',
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    searchPlaceholder: 'Search your music',
    searchEmpty: 'No matching tracks',
    loadingLibrary: 'Loading your whole library…',
  },

  // ─── Playlist Detail ───────────────────────────────────────────────────────
  playlistDetail: {
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    contextLabel: 'PLAYING FROM PLAYLIST',
    searchPlaceholder: 'Search this page',
    pills: {
      edit: 'Edit',
      sort: 'Sort',
      info: 'Name & info',
    },
    comingSoon: 'Coming soon',
    noDownloadedSongs: 'No downloaded songs in this playlist',
    offlineRecoLabel: 'Suggestions from your downloads',
    editHeader: 'Edit playlist',
    saveButton: 'Save',
    savedToast: 'Playlist updated',
    saveError: 'Error saving playlist',
    recommendations: {
      title: 'Suggested tracks',
      subtitle: 'Based on this playlist',
      loading: 'Loading recommendations...',
      added: 'Added to playlist',
      notOnServer: 'Track not on your server yet',
    },
  },

  // ─── Song Options Sheet ────────────────────────────────────────────────────
  songOptions: {
    addToPlaylist: 'Add to playlist',
    removeFromPlaylist: 'Remove from playlist',
    addToQueue: 'Add to queue',
    goToAlbum: 'Go to album',
    goToArtist: 'Go to artist',
    addedToQueue: 'Added to queue',
    removedFromPlaylist: 'Removed from playlist',
    addToLiked: 'Add to Liked Songs',
    removeFromLiked: 'Remove from Liked Songs',
    manageInPlaylists: 'Manage in playlists',
    addError: 'Error adding track',
    removeError: 'Error removing track',
    download: 'Download',
    downloadQueued: 'Download queued',
  },

  // ─── Playlist Options Sheet ────────────────────────────────────────────────
  playlistOptions: {
    addToQueue: 'Add to queue',
    download: 'Download',
    pin: 'Pin playlist',
    unpin: 'Unpin playlist',
    rename: 'Rename playlist',
    delete: 'Delete playlist',
    pinnedToast: 'Playlist pinned',
    unpinnedToast: 'Playlist unpinned',
    renamedToast: 'Playlist renamed',
    deletedToast: 'Playlist deleted',
    queuedToast: (n: number) => `${n} song${n !== 1 ? 's' : ''} added to queue`,
    deleteTitle: 'Delete playlist',
    deleteMessage: (name: string) => `Delete "${name}" permanently?`,
    deleteConfirm: 'Delete',
    cancelButton: 'Cancel',
    byYou: 'by You',
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    queueError: 'Error adding to queue',
    renameError: 'Error renaming playlist',
    deleteError: 'Error deleting playlist',
    comingSoon: 'Coming soon',
    editPlaylist: 'Edit playlist',
    nameAndInfo: 'Name & info',
    editCover: 'Edit cover',
    addAllToPlaylist: 'Add to another playlist',
    addedAllToPlaylist: (n: number, name: string) => `${n} song${n !== 1 ? 's' : ''} added to ${name}`,
    addToPlaylistError: 'Error adding to playlist',
  },

  // ─── Rename Modal ──────────────────────────────────────────────────────────
  renameModal: {
    title: 'Rename playlist',
    cancelButton: 'Cancel',
    confirmButton: 'Rename',
  },

  // ─── Playlist Info Modal ──────────────────────────────────────────────────
  playlistInfo: {
    title: 'Name & info',
    cancel: 'Cancel',
    save: 'Save',
    nameLabel: 'Playlist title',
    namePlaceholder: 'Playlist name',
    descriptionPlaceholder: 'Description (optional)',
    deletePlaylist: 'Delete playlist',
    deleteTitle: 'Delete playlist?',
    deleteMessage: (name: string) => `Delete "${name}" permanently?`,
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    saved: 'Info saved',
    saveError: 'Error saving info',
    coverTitle: 'Cover',
    resetCover: 'Reset to default',
    editCover: 'Edit cover',
    coverChanged: 'Cover updated',
    coverReset: 'Cover reset',
  },

  // ─── Add to Playlist Sheet ─────────────────────────────────────────────────
  addToPlaylist: {
    searchPlaceholder: 'Find a playlist',
    sortButton: 'Sort',
    newPlaylist: 'New playlist',
    savedIn: 'Saved in',
    addedTo: (title: string, name: string) => { const t = title.length > 15 ? title.slice(0, 15) + '…' : title; const n = name.length > 15 ? name.slice(0, 15) + '…' : name; return `"${t}" added to "${n}".`; },
    removedFrom: (name: string) => `Removed from ${name}.`,
    queuedTracks: (n: number) => `${n} tracks added to queue`,
    queueError: 'Error adding to queue',
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    unavailableTrack: 'Track not available locally',
  },

  // ─── Create Playlist Modal ─────────────────────────────────────────────────
  createPlaylist: {
    title: 'Name your playlist',
    placeholder: 'My playlist',
    cancelButton: 'Cancel',
    createButton: 'Create',
  },

  // ─── Queue Sheet ───────────────────────────────────────────────────────────
  queue: {
    title: 'Queue',
    editTitle: (count: number) => `Edit queue (${count})`,
    modifyButton: 'Edit',
    nowPlaying: (name: string) => `Now playing: ${name}`,
    fallbackName: 'Music',
    moveToTop: 'Move to top',
    removeButton: 'Remove',
    clearAll: 'Clear all',
    clearedToast: 'Queue cleared',
    undo: 'Undo',
    shuffle: 'Shuffle',
    repeat: 'Repeat',
    timer: 'Sleep timer',
  },

  // ─── Like Retry Manager ────────────────────────────────────────────────────
  likes: {
    addedToLiked: 'Added to Liked Songs',
    addedToLikedNamed: (title: string) => `"${title}" added to Liked Songs`,
    removedFromLiked: 'Removed from Liked Songs',
    indexError: 'Cannot add: track not indexed on server',
    unavailableTrack: 'Track not available locally',
    sendingToServer: 'Sending to your server…',
    stillImporting: 'Still importing, please wait…',
    sendError: 'Failed to import track',
  },

  // ─── Offline Banner ────────────────────────────────────────────────────────
  offline: {
    noInternet: 'No internet connection',
    serverUnreachable: 'Server unreachable',
    offlineModeActive: 'Offline mode',
    goOffline: 'Offline mode',
  },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    title: 'Settings',
    language: {
      sectionTitle: 'Language',
    },
    sections: {
      player: 'Player',
      transitions: 'Track transitions',
      playback: 'Playback controls',
      downloads: 'Downloads',
      display: 'Display',
      offline: 'Offline mode',
    },
    player: {
      progressLabel: 'Progress bar style',
      progressDesc: 'Choose how playback progress is shown in the full player.',
      classic: 'Classic',
      waveform: 'Waveform',
    },
    transitions: {
      crossfadeLabel: 'Track fade',
      crossfadeDesc: 'Fades out the ending track and fades in the next one.',
    },
    playback: {
      monoLabel: 'Mono audio content',
      monoDesc: 'Left and right speakers output identical audio.',
      autoplayLabel: 'Autoplay',
      autoplayDesc: 'Automatically plays similar tracks when the queue ends.',
      autoDownloadLabel: 'Auto-download',
      autoDownloadDesc: 'Downloads tracks to your device for offline playback.',
      autoDownloadAlertTitle: 'Enable auto-download',
      autoDownloadAlertMessage: 'Warning: Auto-download consumes storage on your device AND bandwidth on your server (Navidrome). Do you really want to enable it?',
      autoDownloadAlertConfirm: 'Enable',
      autoDownloadAlertCancel: 'Cancel',
    },
    display: {
      lockRotationLabel: 'Lock screen rotation',
      lockRotationDesc: 'Force portrait mode, even when the phone is tilted.',
      navBarPositionLabel: 'Navigation bar (landscape mode)',
      navBarLeft: 'Left',
      navBarRight: 'Right',
      fullscreenLabel: 'Fullscreen mode',
      fullscreenDesc: 'Hide the clock, Wi-Fi, battery and notifications at the top of the screen.',
      fullPlayerLayoutLabel: 'Full player layout (landscape)',
      fullPlayerLayoutDesc: 'Choose which side shows the cover art when the full player is in landscape.',
      fullPlayerCoverLeft: 'Cover left',
      fullPlayerCoverRight: 'Cover right',
    },
    offline: {
      autoOnlineLabel: 'Automatic reconnection',
      autoOnlineDesc: 'Automatically returns to online mode when the server is reachable again.',
    },
    updates: {
      sectionTitle: 'About',
      checkButton: 'Check for updates',
      upToDateTitle: "You're up to date",
      upToDateMessage: (local: string, remote: string) =>
        `You are currently on the latest available version.\nYour version: v${local}\nLatest online: v${remote}`,
      newVersionTitle: 'Update available',
      newVersionMessage: (v: string) => `Version ${v} is available on GitHub.`,
      viewRelease: 'View release',
      error: 'Check failed. Verify your connection.',
    },
  },

  // ─── Downloads ────────────────────────────────────────────────────────────────
  downloads: {
    deleteSongTitle: 'Remove download',
    deleteSongMessage: (title: string) => `Remove "${title}" from your downloads?`,
    deletePlaylistTitle: 'Remove downloads',
    deletePlaylistMessage: (name: string, n: number) =>
      `Remove playlist "${name}" (${n} song${n !== 1 ? 's' : ''}) from your downloads?`,
    deleteConfirm: 'Remove',
    cancelButton: 'Cancel',
  },

  // ─── Full Screen Player ────────────────────────────────────────────────────
  fullScreenPlayer: {
    lyricsTitle: 'Lyrics',
  },

  // ─── Lyrics Screen ─────────────────────────────────────────────────────────
  lyricsScreen: {
    noLyrics: 'No lyrics available',
  },

  // ─── Artist Detail ─────────────────────────────────────────────────────────
  artistDetail: {
    unknownArtist: 'Unknown artist',
    loading: 'Loading...',
    popularSongs: 'Popular',
    popularReleases: 'Popular releases',
    similarRecommendations: 'Similar artists',
  },

  // ─── Album Detail ──────────────────────────────────────────────────────────
  albumDetail: {
    unknownYear: 'Unknown year',
    unknownAlbum: 'Unknown album',
    addedToLibrary: 'Album added to library',
    removedFromLibrary: 'Album removed from library',
    addToLibrary: 'Add to library',
    removeFromLibraryAction: 'Remove from library',
    importingAlbum: 'Importing album to your server…',
    stillImportingAlbum: 'Still importing, please wait…',
    importError: 'Failed to import album',
  },

};
