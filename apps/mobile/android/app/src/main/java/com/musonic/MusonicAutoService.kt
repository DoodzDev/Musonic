package com.musonic

import android.os.Bundle
import android.util.Log
import android.support.v4.media.MediaBrowserCompat.MediaItem
import androidx.media.MediaBrowserServiceCompat
import androidx.media.utils.MediaConstants

/**
 * Makes Musonic visible to Android Auto as a media app. The car controls the player's own
 * session (track-player's, or the native player's: ADR-022), so the queue stays driven by the
 * JS playback engine. The browse tree comes from JS through [MusonicAutoBridge] (ADR-015).
 *
 * @author DoodzProg
 */
class MusonicAutoService : MediaBrowserServiceCompat() {

  private var stopWaiting: () -> Unit = {}

  override fun onCreate() {
    super.onCreate()
    current = this
    // The player may not exist yet: the car's connection waits until the token is set.
    stopWaiting = MusonicCarPlayer.withToken(this) { token -> if (sessionToken == null) sessionToken = token }
  }

  override fun onDestroy() {
    if (current === this) current = null
    stopWaiting()
    super.onDestroy()
  }

  // Only the car, the system media controls and Musonic itself may browse the library.
  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot? {
    if (clientPackageName != packageName && clientPackageName !in ALLOWED_CLIENTS) return null
    MusonicAutoBridge.connected()
    return BrowserRoot(ROOT_ID, Bundle().apply {
      putBoolean(MusonicAutoModule.CONTENT_STYLE_SUPPORTED, true)
      val limit = rootHints?.getInt(MediaConstants.BROWSER_ROOT_HINTS_KEY_CUSTOM_BROWSER_ACTION_LIMIT, 0) ?: 0
      Log.i(TAG, "$clientPackageName: tabs ${rootHints?.getInt(MediaConstants.BROWSER_ROOT_HINTS_KEY_ROOT_CHILDREN_LIMIT, -1)}, item buttons $limit")
      if (limit > 0) putParcelableArrayList(MediaConstants.BROWSER_SERVICE_EXTRAS_KEY_CUSTOM_BROWSER_ACTION_ROOT_LIST, browseActions())
    })
  }

  /** Play and Shuffle, shown on playlists and albums (ADR-022 step 2). */
  private fun browseActions(): ArrayList<Bundle> = arrayListOf(
      browseAction(BROWSE_PLAY, R.string.auto_action_play, MusonicArtwork.PLAY_ICON),
      browseAction(BROWSE_SHUFFLE, R.string.auto_action_shuffle, MusonicArtwork.SHUFFLE_ICON),
  )

  private fun browseAction(id: String, label: Int, icon: String) = Bundle().apply {
    putString(MediaConstants.EXTRAS_KEY_CUSTOM_BROWSER_ACTION_ID, id)
    putString(MediaConstants.EXTRAS_KEY_CUSTOM_BROWSER_ACTION_LABEL, getString(label))
    putString(MediaConstants.EXTRAS_KEY_CUSTOM_BROWSER_ACTION_ICON_URI, MusonicArtwork.uriOf(this@MusonicAutoService, icon).toString())
  }

  override fun onCustomAction(action: String, extras: Bundle?, result: Result<Bundle>) {
    val mediaId = extras?.getString(MediaConstants.EXTRAS_KEY_CUSTOM_BROWSER_ACTION_MEDIA_ITEM_ID)
    val kind = when (action) {
      BROWSE_PLAY -> "play"
      BROWSE_SHUFFLE -> "shuffle"
      else -> null
    }
    if (kind == null || mediaId == null || !MusonicAutoBridge.browseAction(kind, mediaId)) {
      result.sendError(null)
      return
    }
    // The car then shows the playback screen.
    result.sendResult(Bundle().apply {
      putBoolean(MediaConstants.EXTRAS_KEY_CUSTOM_BROWSER_ACTION_RESULT_SHOW_PLAYING_ITEM, true)
    })
  }

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaItem>>) {
    if (!MusonicAutoBridge.loadChildren(this, parentId, result)) result.sendResult(mutableListOf())
  }

  companion object {
    private const val BROWSE_PLAY = "musonic.browse.play"
    private const val BROWSE_SHUFFLE = "musonic.browse.shuffle"

    /** The car's id of a browse action sent by JS (`play`, `shuffle`). */
    fun browseActionId(action: String): String? = when (action) {
      "play" -> BROWSE_PLAY
      "shuffle" -> BROWSE_SHUFFLE
      else -> null
    }

    /** The running service, told when lists of the snapshot change. */
    var current: MusonicAutoService? = null
      private set

    private const val ROOT_ID = "root"
    private const val TAG = "MusonicAuto"
    private val ALLOWED_CLIENTS = setOf(
        "com.google.android.projection.gearhead", // Android Auto
        "com.android.systemui", // media controls (resume)
    )
  }
}
