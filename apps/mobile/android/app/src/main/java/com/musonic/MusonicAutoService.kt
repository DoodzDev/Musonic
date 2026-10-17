package com.musonic

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.session.MediaSessionCompat
import androidx.media.MediaBrowserServiceCompat
import com.doublesymmetry.trackplayer.service.MediaSessionTokenHolder

/**
 * Makes Musonic visible to Android Auto as a media app. The car controls the track player's
 * own session, so the queue stays driven by the JS playback engine. The browse tree comes
 * from JS through [MusonicAutoBridge] (ADR-015).
 *
 * @author DoodzProg
 */
class MusonicAutoService : MediaBrowserServiceCompat() {

  private val onToken: (MediaSessionCompat.Token) -> Unit = { token ->
    if (sessionToken == null) sessionToken = token
  }

  override fun onCreate() {
    super.onCreate()
    // The player may not exist yet: the car's connection waits until the token is set.
    val token = MediaSessionTokenHolder.token
    if (token != null) sessionToken = token else MediaSessionTokenHolder.addListener(onToken)
  }

  override fun onDestroy() {
    MediaSessionTokenHolder.removeListener(onToken)
    super.onDestroy()
  }

  // Only the car, the system media controls and Musonic itself may browse the library.
  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot? {
    if (clientPackageName != packageName && clientPackageName !in ALLOWED_CLIENTS) return null
    return BrowserRoot(ROOT_ID, Bundle().apply {
      putBoolean(MusonicAutoModule.CONTENT_STYLE_SUPPORTED, true)
    })
  }

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaItem>>) {
    if (!MusonicAutoBridge.loadChildren(parentId, result)) result.sendResult(mutableListOf())
  }

  private companion object {
    const val ROOT_ID = "root"
    val ALLOWED_CLIENTS = setOf(
        "com.google.android.projection.gearhead", // Android Auto
        "com.android.systemui", // media controls (resume)
    )
  }
}
