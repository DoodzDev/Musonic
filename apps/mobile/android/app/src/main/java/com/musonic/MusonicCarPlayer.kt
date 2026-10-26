package com.musonic

import android.content.Context
import android.content.Intent
import android.support.v4.media.session.MediaSessionCompat
import android.util.Log
import androidx.annotation.MainThread
import com.doublesymmetry.trackplayer.service.MediaSessionTokenHolder

/**
 * The player's session for the car (ADR-015, ADR-022): the token of whichever player runs
 * (track-player's or the native one), at once or once it is up. When Musonic is closed, the
 * player is started without a screen by the `MusonicAutoStart` JS task.
 *
 * @author DoodzProg
 */
@MainThread
object MusonicCarPlayer {
  private const val TAG = "MusonicAuto"

  /** Calls [onToken] once with the session token; the returned function stops waiting. */
  fun withToken(context: Context, onToken: (MediaSessionCompat.Token) -> Unit): () -> Unit {
    val ready = MediaSessionTokenHolder.token ?: MusonicPlayback.token
    if (ready != null) {
      onToken(ready)
      return {}
    }
    var done = false
    val listener: (MediaSessionCompat.Token) -> Unit = { token ->
      if (!done) {
        done = true
        onToken(token)
      }
    }
    MediaSessionTokenHolder.addListener(listener)
    MusonicPlayback.addTokenListener(listener)
    // Musonic is closed: start the player without a screen.
    MediaSessionTokenHolder.startedByCar = true
    try {
      context.startService(Intent(context, MusonicAutoStartService::class.java))
    } catch (error: IllegalStateException) {
      Log.w(TAG, "Player start not allowed now", error)
    }
    return {
      MediaSessionTokenHolder.removeListener(listener)
      MusonicPlayback.removeTokenListener(listener)
    }
  }
}
