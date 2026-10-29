package com.musonic

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.MainThread
import androidx.media3.common.MediaItem
import androidx.media3.common.Player

/**
 * Lyrics mode of the car (ADR-025): the line sung shows in place of the artist on the car's own
 * playback screen (cover, blurred background), following the music. Synced lyrics only, from
 * the same sources as the app's player (JS, `lyrics:<track id>`). Native player only.
 *
 * @author DoodzProg
 */
@MainThread
object MusonicCarLyrics {
  private val handler = Handler(Looper.getMainLooper())
  private val tick = Runnable { show() }
  private var context: Context? = null
  private var player: Player? = null
  private var trackId: String? = null
  /** Start (ms) and text of each line of the track playing. */
  private var lines: List<Pair<Long, String>> = emptyList()

  var on = false
    private set

  private val events = object : Player.Listener {
    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = load()

    override fun onIsPlayingChanged(isPlaying: Boolean) = show()

    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) = show()
  }

  fun toggle(context: Context) = if (on) stop() else start(context)

  fun start(context: Context) {
    if (on) return
    on = true
    this.context = context.applicationContext
    MusonicPlayback.withPlayer { player ->
      if (!on) return@withPlayer
      this.player = player
      player.addListener(events)
      load()
    }
  }

  /** Back to the artist (also when the car goes: the phone would keep showing lyrics). */
  fun stop() {
    on = false
    handler.removeCallbacks(tick)
    player?.removeListener(events)
    player = null
    trackId = null
    lines = emptyList()
    MusonicPlayback.showLine(null)
  }

  private fun load() {
    val context = context ?: return
    val id = player?.currentMediaItem?.mediaId ?: return
    if (id == trackId) return
    trackId = id
    lines = emptyList()
    handler.removeCallbacks(tick)
    MusonicPlayback.showLine(SUNG_NOTHING)
    MusonicAutoBridge.entries(context, "lyrics:$id") { entries ->
      if (!on || trackId != id) return@entries
      lines = entries.mapNotNull { entry -> entry.id.removePrefix("line:").toLongOrNull()?.let { it to entry.title } }
      if (lines.isEmpty()) MusonicPlayback.showLine(context.getString(R.string.car_lyrics_none)) else show()
    }
  }

  /** The line sung now, then a redraw when the next one starts. */
  private fun show() {
    handler.removeCallbacks(tick)
    val player = player ?: return
    if (!on || lines.isEmpty()) return
    val position = player.currentPosition
    val current = lines.indexOfLast { it.first <= position }
    MusonicPlayback.showLine(if (current < 0) SUNG_NOTHING else lines[current].second)
    val next = lines.getOrNull(current + 1) ?: return
    if (player.isPlaying) handler.postDelayed(tick, (next.first - position).coerceAtLeast(MIN_DELAY_MS))
  }

  /** Before the first line, or while the lyrics load. */
  private const val SUNG_NOTHING = "♪"
  private const val MIN_DELAY_MS = 100L
}
