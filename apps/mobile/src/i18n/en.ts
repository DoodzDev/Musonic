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
    back: 'Back',
    loadError: 'Couldn’t load',
    loadErrorMessage: 'Check your connection, then try again.',
    offlineUnavailable: 'Unavailable offline',
    offlineUnavailableMessage: 'This page comes back as soon as you’re online.',
  },

  // ─── Design v2 components ──────────────────────────────────────────────────
  ui: {
    seeAll: 'See all',
    clearSearch: 'Clear search',
    badgeOnline: 'Online',
    badgeMagic: 'Magic',
    badgeDownloaded: 'Downloaded',
    badgeLossless: 'Lossless',
    like: 'Add to Liked Songs',
    unlike: 'Remove from Liked Songs',
    addToPlaylist: 'Add to a playlist',
    addToQueue: 'Queue',
    addedToQueue: (title: string) => `"${title}" added to the queue`,
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
    successMessage: 'Connected! Loading…',
    missingFieldsTitle: 'Missing fields',
    missingFieldsBody: 'URL, username and password are required.',
    errors: {
      wrongCredentials: 'Wrong username or password',
      clientError: (code: number) => `Client error (${code}) — check the URL`,
      serverError: (code: number) => `Server error (${code}) — server is down`,
      timeout: 'Connection timed out',
      unreachable: 'Server not found — check the URL',
      notSubsonic: 'No Subsonic server at this address — check the URL',
      generic: 'Unable to connect',
      revoked: 'This device was signed out of your account. Please sign in again.',
      suspended: "Your account has been suspended. Ask the server's administrator.",
      credentials: 'Did your password change? Please sign in with the new one.',
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
      `Log out of:\n\n${name}\n${url}\n\nYou will need to enter your password again.`,
    logoutConfirm: 'Log out',
    cancelButton: 'Cancel',
    goOffline: 'Go offline',
    goOnline: 'Back online',
    offlineActive: 'Active',
    pingFailed: 'Cannot connect to server',
    pingFailedMessage: 'Can’t reach the server. Check your connection, or close and reopen the app.',
    storageLabel: 'Downloaded music storage',
  },

  // ─── Home ──────────────────────────────────────────────────────────────────
  home: {
    title: 'Home',
    likedSongs: 'Liked Songs',
    myMusic: 'My Music',
    unknownTitle: 'Unknown title',
    unknownArtist: 'Unknown artist',
    loadError: 'Could not load home',
    offlineEmptyState: 'Content not available offline',
    offlineSaved: 'Offline: last loaded home',
    typeSingle: 'Single',
    typeAlbum: 'Album',
    typePlaylist: 'Playlist',
    typeArtist: 'Artist',
    /** Card subtitle: the kind, then the artist when known. */
    kindLine: (kind: string, artist?: string) => (artist ? `${kind} · ${artist}` : kind),
    mixSubtitle: (count: number) => `Magic Mix · ${count} track${count > 1 ? 's' : ''}`,
    playAlbum: (title: string) => `Play the album ${title}`,
    date: (d: Date) => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
    },
    filters: {
      all: 'All',
      playlists: 'Playlists',
      albums: 'Albums',
      artists: 'Artists',
    },
    sections: {
      recent: 'Recently played',
      forYou: 'For you',
      forYouFrom: (names: string) => `Based on ${names}`,
      discover: 'Artists to discover',
      favoriteArtists: 'Your favorite artists',
      moreLike: (name: string) => `More like ${name}`,
      likedAlbums: 'Albums of your liked songs',
      becauseLiked: (title: string) => `Because you liked "${title}"`,
      magicMixes: 'Magic Mixes',
      magicMixesSubtitle: 'Your songs and discoveries, by genre',
      rediscover: 'Rediscover',
      newest: 'New in your library',
      random: 'At random',
    },
    playMix: (genre: string) => `Play the ${genre} Magic Mix`,
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
    browse: 'Browse',
    bestResult: 'Top result',
    scope: {all: 'All', library: 'My library', online: 'Online'},
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
      empty: 'Like some tracks to get recommendations',
      albumsBasedOnLikes: 'Albums based on your liked songs',
      tracksBasedOnLikes: 'Tracks based on your liked songs',
      basedOnRecent: 'Based on recent listens',
      sameStyle: (artist: string) => `In the same style as ${artist}`,
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
    searchLibrary: 'Search the library',
    searchCancel: 'Cancel',
    searchNoResult: 'No results',
    createPlaylistPlaceholder: 'Playlist name',
    createPlaylistCancel: 'Cancel',
    createPlaylistConfirm: 'Create',
    createPlaylistError: 'Could not create playlist',
    tabs: {playlists: 'Playlists', albums: 'Albums', artists: 'Artists', downloads: 'Downloaded'},
    itemCount: (n: number) => `${n} item${n !== 1 ? 's' : ''}`,
    downloadedCount: (n: number) => `${n} song${n !== 1 ? 's' : ''} downloaded`,
    showGrid: 'Show as grid',
    showList: 'Show as list',
    staleNote: 'Offline: last saved version',
    empty: {
      playlists: {title: 'No playlists', message: 'Create a playlist to keep your songs together.'},
      albums: {title: 'No albums', message: 'Albums you add to your library show up here.'},
      artists: {title: 'No artists', message: 'Artists from your albums and liked songs show up here.'},
      downloads: {title: 'No downloads', message: 'Download a playlist to listen offline.'},
      offline: {title: 'Unavailable offline', message: 'Albums and artists come back once you are online.'},
    },
    pin: 'Pin',
    unpin: 'Unpin',
    pinnedToast: 'Pinned to the top of your library',
    unpinnedToast: 'Unpinned',
    removeFromLibrary: 'Remove from library',
    removedToast: 'Removed from library',
    removeError: 'Could not remove this item',
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
    recoTitle: 'Recommended for you',
    recoSubtitle: 'Songs close to the ones you love',
    downloadAll: 'Download all',
    allDownloaded: 'All liked songs are downloaded',
    downloadAllMessage: (n: number) => `Download ${n} liked song${n !== 1 ? 's' : ''} to listen offline?`,
  },

  // ─── Liked Recommendations ─────────────────────────────────────────────────
  likedRecommendations: {
    title: 'Recommended for you',
    subtitle: 'Based on your liked songs',
    loading: 'Finding recommendations…',
    emptyState: 'No recommendations available right now',
    eyebrow: 'Based on your liked songs',
    heading: 'For you',
    intro: (n: number, artists: string[]) => {
      const names = artists.length > 1 ? `${artists.slice(0, -1).join(', ')} and ${artists[artists.length - 1]}` : artists[0] ?? '';
      return `${n} song${n !== 1 ? 's' : ''} close to ${names}.`;
    },
    playAll: 'Play all',
    refresh: 'New suggestions',
  },

  // ─── All Songs (full library) ──────────────────────────────────────────────
  allSongs: {
    title: 'My Music',
    tileSubtitle: 'Your entire library',
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    searchPlaceholder: 'Search your music',
    searchEmpty: 'No matching tracks',
    sort: {az: 'Title (A-Z)', artist: 'Artist', recent: 'Recently added'},
    jumpTitle: 'Jump to letter',
    jumpHint: 'Tap a letter to jump to it',
    loadingLibrary: 'Loading your whole library…',
  },

  // ─── Playlist Detail ───────────────────────────────────────────────────────
  playlistDetail: {
    byOwner: (owner: string) => `By ${owner}`,
    options: 'Playlist options',
    edit: 'Edit playlist',
    editTitle: 'Edit',
    editHint: 'Drag the handle to reorder. The red circle removes the song from the playlist.',
    cancel: 'Cancel',
    searchInPlaylist: 'Search in playlist',
    searchEmpty: 'No songs found',
    empty: {title: 'Empty playlist', message: 'Add songs with + from an album, a search or the recommendations.'},
    loadError: 'Could not load this playlist',
    addReco: (title: string) => `Add ${title} to the playlist`,
    trackCount: (n: number) => `${n} song${n !== 1 ? 's' : ''}`,
    contextLabel: 'PLAYING FROM PLAYLIST',
    searchPlaceholder: 'Search this page',
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
    },
  },

  // ─── Song Options Sheet ────────────────────────────────────────────────────
  sleepTimer: {
    title: 'Sleep timer',
    menu: 'Sleep timer',
    menuActive: (left: string) => `Sleep timer · ${left}`,
    /** "1 h 05 min", "12 min", "45 s". */
    duration: (seconds: number) => {
      if (seconds < 60) return `${seconds} s`;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h} h${m || s ? ` ${String(m).padStart(2, '0')} min` : ''}${s ? ` ${s} s` : ''}`;
      return `${m} min${s ? ` ${s} s` : ''}`;
    },
    hoursUnit: 'h',
    minutesUnit: 'min',
    secondsUnit: 's',
    start: (d: string) => `Stop in ${d}`,
    pickDuration: 'Pick a duration',
    endOfTrack: 'End of track',
    off: 'Turn off timer',
    stopsIn: (d: string) => `Playback stops in ${d}.`,
    stopsAtEnd: 'Playback stops at the end of the track.',
    shortEnd: 'end of track',
  },
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
    removeDownloads: 'Delete downloads',
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
    byYou: 'by you',
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
    close: 'Close the queue',
    backToPlayer: 'Back to the player',
    upNext: 'Up next',
    from: (name: string) => `From ${name}`,
    fallbackName: 'Music',
    shuffleOn: 'Shuffle',
    shuffleMagic: 'Magic shuffle',
    modifyButton: 'Edit',
    done: 'Done',
    select: (title: string) => `Select ${title}`,
    deselect: (title: string) => `Deselect ${title}`,
    reorder: (title: string) => `Move ${title}`,
    magicSuggestion: 'Magic suggestion',
    empty: 'Nothing up next',
    playNext: 'Play next',
    removeCount: (count: number) => `Remove (${count})`,
    clearAll: 'Clear all',
    clearedToast: 'Queue cleared',
    unreadableToast: 'Track unavailable, skipping to the next one',
    playbackFailedToast: 'Playback failed. Check your connection.',
    magicOfflineToast: 'Magic is unavailable offline',
    undo: 'Undo',
    shuffleTile: 'Shuffle',
    repeatTile: 'Repeat',
    autoplayTile: 'Autoplay',
    autoplayTitle: 'Autoplay',
    autoplaySubtitle: 'Similar tracks after the end of the queue',
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
      system: 'Phone',
    },
    mode: {
      label: 'Advanced settings',
      desc: 'Also shows the fine-grained settings: crossfade, landscape layout, storage limit.',
    },
    account: {
      sectionTitle: 'Account',
      note: 'Accounts and servers are managed from your profile.',
    },
    musonicApi: {
      sectionTitle: 'Musonic API',
      note: 'Optional. Deezer tracks start faster through your Musonic API. When the API does not answer, playback goes through the usual server.',
      urlLabel: 'Address',
      urlPlaceholder: 'https://api.example.com',
      keyLabel: 'API key',
      save: 'Check and save',
      remove: 'Stop using it',
      checking: 'Checking…',
      status: {
        ok: 'Connected: Deezer tracks go through the API.',
        unauthorized: 'The API rejected the key.',
        unreachable: 'API unreachable. Check the address and your connection.',
        notConfigured: 'Fill in the address and the key.',
      },
      off: 'Not used',
    },
    sections: {
      player: 'Playback',
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
      crossfadeLabel: 'Crossfade',
      crossfadeDesc: 'Fades out the ending track and fades in the next one.',
    },
    playback: {
      autoplayLabel: 'Autoplay',
      autoplayDesc: 'Automatically plays similar tracks when the queue ends.',
      alwaysPreviousLabel: 'Previous always goes back',
      alwaysPreviousDesc: 'Otherwise, after 3 seconds, Previous restarts the track.',
      autoDownloadLabel: 'Automatic download',
      autoDownloadDesc: 'Downloads the tracks you play, so you have them offline.',
      autoDownloadAlertTitle: 'Enable auto-download',
      autoDownloadAlertMessage: 'Auto-download uses space on your phone and bandwidth on your server (Navidrome). Turn it on?',
      autoDownloadAlertConfirm: 'Enable',
      autoDownloadAlertCancel: 'Cancel',
      wifiOnlyLabel: 'Wi-Fi only',
      wifiOnlyDesc: 'On mobile data, Musonic asks before downloading.',
      qualityWifiLabel: 'Quality on Wi-Fi',
      qualityMobileLabel: 'Quality on mobile data',
      qualityDesc: 'In kbit/s. Downloads always keep the original quality.',
      qualityOriginal: 'Original',
      storageLimitLabel: 'Storage limit',
      storageLimitDesc: (used: string) => `Used: ${used}. Beyond it, new downloads are refused.`,
      storageLimitNone: 'None',
      storageLimitGB: (n: number) => `${n} GB`,
    },
    display: {
      lockRotationLabel: 'Lock screen rotation',
      lockRotationDesc: 'Forces portrait mode, even when the phone is tilted.',
      navBarPositionLabel: 'Navigation bar (landscape mode)',
      navBarLeft: 'Left',
      navBarRight: 'Right',
      fullscreenLabel: 'Fullscreen mode',
      fullscreenDesc: 'Hides the clock, Wi-Fi, battery and notifications at the top of the screen.',
      fullPlayerLayoutLabel: 'Full player layout (landscape)',
      fullPlayerLayoutDesc: 'Side of the cover when the full player is in landscape.',
      fullPlayerCoverLeft: 'Cover left',
      fullPlayerCoverRight: 'Cover right',
      homeDateLabel: 'Date on Home',
      homeDateDesc: 'Shows the date above the Home title.',
      startTabLabel: 'Start tab',
      startTabDesc: 'Applies the next time the app starts.',
      hapticsLabel: 'Haptic feedback',
      hapticsDesc: 'Light vibrations when you tap buttons.',
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
      error: 'Couldn’t check. Check your connection.',
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
    mobileDataTitle: 'You’re on mobile data',
    mobileDataMessage: (n: number) =>
      `Downloads use Wi-Fi only. Download ${n > 1 ? `these ${n} tracks` : 'this track'} with your mobile data anyway?`,
    mobileDataConfirm: 'Download',
    storageFull: 'Storage limit reached: download refused.',
  },

  // ─── Full Screen Player ────────────────────────────────────────────────────
  fullScreenPlayer: {
    lyricsTitle: 'Lyrics',
    close: 'Minimize player',
    options: 'Track options',
    addToPlaylist: 'Add to a playlist',
    like: 'Add to Liked Songs',
    unlike: 'Remove from Liked Songs',
    downloaded: 'Downloaded',
    position: 'Playback position',
    quality: (q: string) => `Quality: ${q}`,
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous track',
    next: 'Next track',
    queue: 'Queue',
    shuffleOff: 'Shuffle off',
    shuffleOn: 'Shuffle on',
    shuffleMagic: 'Magic shuffle',
    repeatOff: 'Repeat off',
    repeatAll: 'Repeat queue',
    repeatOne: 'Repeat track',
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
    albums: 'Albums',
    similarArtists: 'Similar artists',
    inLibrary: (albums: number, songs: number) =>
      `${albums} album${albums !== 1 ? 's' : ''} · ${songs} song${songs !== 1 ? 's' : ''} in your library`,
    onlineArtist: 'Artist · Online',
    empty: 'Nothing to play for this artist yet.',
  },

  // ─── Album Detail ──────────────────────────────────────────────────────────
  mixDetail: {
    loadError: 'Could not load these songs',
    empty: 'No songs here yet',
  },

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
    add: 'Add',
    added: 'Added',
    download: 'Download',
    downloaded: 'Downloaded',
    more: 'More',
    options: 'Album options',
    loadError: 'Could not load this album',
    released: (year: number | string) => `Released in ${year}`,
  },

  // ─── Detail pages (album, playlist, artist, mix) ────────────────────────────
  detail: {
    summary: (n: number, seconds: number) => {
      const min = Math.round(seconds / 60);
      const h = Math.floor(min / 60);
      const length = h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} minute${min !== 1 ? 's' : ''}`;
      return `${n} song${n !== 1 ? 's' : ''}, ${length}`;
    },
  },

};
