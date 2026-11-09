package com.musonic

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.MainThread
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Crossfade on the native player (ADR-028): a second player loads the next track shortly before
 * the fade, rises while the current one falls, and takes over from it when it really ends, so
 * the notification, the car and the app stay on the current track until then. Timed here rather
 * than in JS, which Android throttles in the background (ADR-004). With the setting at 0 there
 * is no second player, no timer and audio offload stays on.
 *
 * When to fade is the shared rule E3, `crossfadeLength` in `packages/core`: keep them in step.
 *
 * @author DoodzProg
 */
@OptIn(UnstableApi::class)
@MainThread
class MusonicCrossfade(private val newDeck: () -> ExoPlayer, private val setOffload: (ExoPlayer, Boolean) -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private var current: ExoPlayer? = null

  /** The player that takes over: loaded and silent, then rising once [fadeStartedAt] is set. */
  private var deck: ExoPlayer? = null
  private var fadeLengthMs = 0L
  private var fadeStartedAt = 0L
  private var rampDone = false

  private val fading get() = fadeStartedAt > 0

  private val schedule = Runnable { check() }
  private val ramp = Runnable { stepRamp() }
  private val queueSettled = Runnable { checkNextUnchanged() }
  private val forceHandOver = Runnable { handOver() }

  private val currentEvents = object : Player.Listener {
    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      when {
        fading && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> handOver()
        // The next track is already at full volume: the pause applies to it, not to the old one.
        !playWhenReady && rampDone -> {
          handOver()
          current?.pause()
        }
        !playWhenReady -> drop()
      }
    }

    // A transient loss of audio focus (a call) keeps playWhenReady on.
    override fun onPlaybackSuppressionReasonChanged(reason: Int) {
      if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) drop()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (isPlaying && !fading) arm()
    }

    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
      if (reason == Player.DISCONTINUITY_REASON_SEEK) restart()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = restart()

    override fun onRepeatModeChanged(repeatMode: Int) = restart()

    override fun onPlayerError(error: PlaybackException) = drop()

    // The engine replaces what comes next in several calls: judge once they have landed.
    override fun onTimelineChanged(timeline: Timeline, reason: Int) {
      handler.removeCallbacks(queueSettled)
      handler.postDelayed(queueSettled, QUEUE_SETTLE_MS)
    }
  }

  private val deckEvents = object : Player.Listener {
    override fun onPlayerError(error: PlaybackException) = drop()
  }

  fun attach(player: ExoPlayer) {
    current = player
    player.addListener(currentEvents)
    setOffload(player, MusonicPlayback.crossfadeSeconds <= 0)
  }

  /** The setting or the end-of-track sleep timer changed. */
  fun settingsChanged() {
    current?.let { setOffload(it, MusonicPlayback.crossfadeSeconds <= 0) }
    restart()
  }

  fun release() {
    drop()
    current?.removeListener(currentEvents)
    current = null
  }

  private fun restart() {
    drop()
    arm()
  }

  private fun arm() {
    handler.removeCallbacks(schedule)
    if (MusonicPlayback.crossfadeSeconds > 0) check()
  }

  /** Runs when due: loads the next track, then starts the fade. Nothing polls before that. */
  private fun check() {
    val player = current ?: return
    val settingMs = MusonicPlayback.crossfadeSeconds * 1000L
    val durationMs = player.duration
    val next = nextOf(player)
    if (settingMs <= 0 || next == null || !player.isPlaying || MusonicPlayback.crossfadeHold ||
        player.repeatMode == Player.REPEAT_MODE_ONE || durationMs == C.TIME_UNSET || durationMs < 2 * settingMs ||
        noFade(player.currentMediaItem) || noFade(next)) {
      return
    }
    val speed = player.playbackParameters.speed
    val leftMs = ((durationMs - player.currentPosition) / speed).toLong()
    if (leftMs <= 0) return
    when {
      leftMs > settingMs + PRELOAD_MS -> handler.postDelayed(schedule, leftMs - settingMs - PRELOAD_MS)
      deck == null -> {
        loadDeck(next)
        handler.postDelayed(schedule, max(leftMs - settingMs, 0))
      }
      leftMs > settingMs -> handler.postDelayed(schedule, leftMs - settingMs)
      deck?.playbackState == Player.STATE_READY -> startFade(player, leftMs)
      // Still loading: a shorter fade if it comes in time, otherwise the usual change of track.
      leftMs > MIN_FADE_MS -> handler.postDelayed(schedule, DECK_WAIT_MS)
      else -> drop()
    }
  }

  private fun loadDeck(item: MediaItem) {
    deck = newDeck().apply {
      volume = 0f
      addListener(deckEvents)
      setMediaItem(item)
      prepare()
    }
  }

  private fun startFade(player: ExoPlayer, leftMs: Long) {
    val rising = deck ?: return
    fadeLengthMs = leftMs
    fadeStartedAt = SystemClock.elapsedRealtime()
    rampDone = false
    // The next track stays queued behind the current one: it must not start there as well.
    player.pauseAtEndOfMediaItems = true
    rising.playbackParameters = player.playbackParameters
    rising.play()
    stepRamp()
  }

  private fun stepRamp() {
    val player = current ?: return
    val rising = deck ?: return
    val progress = ((SystemClock.elapsedRealtime() - fadeStartedAt).toFloat() / fadeLengthMs).coerceIn(0f, 1f)
    val angle = progress * (PI / 2).toFloat()
    player.volume = cos(angle)
    rising.volume = sin(angle)
    // The current player only ends the fade by reaching its end; a stalled stream never would.
    if (progress < 1f) {
      handler.postDelayed(ramp, RAMP_STEP_MS)
    } else {
      rampDone = true
      handler.postDelayed(forceHandOver, STALL_GRACE_MS)
    }
  }

  /** What is queued changed under a loaded deck: it no longer plays what comes next. */
  private fun checkNextUnchanged() {
    val player = current ?: return
    val loaded = deck?.currentMediaItem
    if (loaded != null && nextOf(player)?.mediaId != loaded.mediaId) restart() else if (loaded == null) arm()
  }

  /** Back to the current player alone, at full volume. */
  private fun drop() {
    handler.removeCallbacks(schedule)
    handler.removeCallbacks(ramp)
    handler.removeCallbacks(forceHandOver)
    handler.removeCallbacks(queueSettled)
    val wasFading = fading
    fadeStartedAt = 0
    rampDone = false
    deck?.run {
      removeListener(deckEvents)
      release()
    }
    deck = null
    if (wasFading) {
      current?.run {
        pauseAtEndOfMediaItems = false
        volume = 1f
      }
    }
  }

  private fun handOver() {
    val outgoing = current ?: return
    val incoming = deck ?: return drop()
    val index = outgoing.currentMediaItemIndex
    val next = nextOf(outgoing)
    if (next?.mediaId != incoming.currentMediaItem?.mediaId) {
      // What comes next changed at the last moment: the current player moves on by itself.
      drop()
      if (next != null) outgoing.seekTo(index + 1, 0L)
      outgoing.play()
      return
    }
    handler.removeCallbacks(ramp)
    handler.removeCallbacks(forceHandOver)
    handler.removeCallbacks(queueSettled)
    fadeStartedAt = 0
    rampDone = false
    deck = null
    incoming.removeListener(deckEvents)
    outgoing.removeListener(currentEvents)

    // The same queue as after a usual change of track: the engine then removes the old track.
    incoming.addMediaItems(0, (0..index).map(outgoing::getMediaItemAt))
    incoming.addMediaItems(
        incoming.mediaItemCount,
        (index + 2 until outgoing.mediaItemCount).map(outgoing::getMediaItemAt),
    )
    incoming.repeatMode = outgoing.repeatMode
    incoming.volume = 1f
    // Two players holding audio focus take it from each other: one at a time.
    outgoing.setAudioAttributes(outgoing.audioAttributes, false)
    incoming.setAudioAttributes(incoming.audioAttributes, true)
    incoming.setHandleAudioBecomingNoisy(true)

    current = incoming
    incoming.addListener(currentEvents)
    MusonicPlayback.takeOver(incoming)
    // Not from inside its own listener call.
    handler.post { outgoing.release() }
    arm()
  }

  private fun nextOf(player: Player): MediaItem? {
    val index = player.currentMediaItemIndex + 1
    return if (index in 1 until player.mediaItemCount) player.getMediaItemAt(index) else null
  }

  /** Podcast episodes are listened to, and resume where they stopped: never faded. */
  private fun noFade(item: MediaItem?): Boolean = MusonicPlayback.trackOf(item)?.getBoolean("noFade") == true

  private companion object {
    /** Ahead of the fade, so the next track is ready when it starts. */
    const val PRELOAD_MS = 10_000L
    const val MIN_FADE_MS = 1_000L
    const val DECK_WAIT_MS = 250L
    const val RAMP_STEP_MS = 50L
    const val STALL_GRACE_MS = 2_000L
    const val QUEUE_SETTLE_MS = 300L
  }
}
