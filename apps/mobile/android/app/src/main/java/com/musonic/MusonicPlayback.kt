package com.musonic

import android.os.Bundle
import android.support.v4.media.session.MediaSessionCompat
import androidx.annotation.MainThread
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand

/**
 * State shared by [MusonicPlayerService] (owns the player and its session) and
 * [MusonicPlayerModule] (drives it from JS): the player, the events sent to JS, the extra
 * buttons of the session (shuffle, repeat, like) and its token for Android Auto (ADR-022).
 * Main thread only.
 *
 * @author DoodzProg
 */
@MainThread
object MusonicPlayback {
  class Action(val name: String, val label: String, val icon: Int)

  /** Names of the extra buttons, accepted from every controller at connection. */
  val ACTIONS = listOf(MusonicAutoModule.ACTION_SHUFFLE, MusonicAutoModule.ACTION_REPEAT, MusonicAutoModule.ACTION_LIKE)

  var player: ExoPlayer? = null
    private set
  private var session: MediaSession? = null
  private val waiting = mutableListOf<(ExoPlayer) -> Unit>()

  /** Sends an event to JS (`playback-state`, `remote-next`…), set while the module lives. */
  var emitter: ((String, Bundle) -> Unit)? = null

  /** Called with the action name when an extra button is pressed (set by [MusonicAutoModule]). */
  var onAction: ((String) -> Unit)? = null

  var buttons: List<CommandButton> = emptyList()
    private set

  var token: MediaSessionCompat.Token? = null
    private set
  private val tokenListeners = mutableListOf<(MediaSessionCompat.Token) -> Unit>()

  private var lastState: String? = null
  private var lastIndex: Int? = null
  private var lastTrack: Bundle? = null

  fun attach(player: ExoPlayer, session: MediaSession) {
    this.player = player
    this.session = session
    player.addListener(events)
    session.setMediaButtonPreferences(buttons)
    MediaSessionCompat.Token.fromToken(session.platformToken).let { compat ->
      token = compat
      tokenListeners.toList().forEach { it(compat) }
    }
    waiting.toList().forEach { it(player) }
    waiting.clear()
  }

  fun detach() {
    player?.removeListener(events)
    player = null
    session = null
    token = null
    lastState = null
    lastIndex = null
    lastTrack = null
  }

  /** A line shown in place of the artist (car lyrics mode), or null for the artist. */
  fun showLine(line: String?) {
    (session?.player as? MusonicPlayerService.RemoteControls)?.line = line
  }

  /** Runs [block] with the player, at once or as soon as the service has created it. */
  fun withPlayer(block: (ExoPlayer) -> Unit) {
    val current = player
    if (current != null) block(current) else waiting.add(block)
  }

  fun addTokenListener(listener: (MediaSessionCompat.Token) -> Unit) {
    tokenListeners.add(listener)
  }

  fun removeTokenListener(listener: (MediaSessionCompat.Token) -> Unit) {
    tokenListeners.remove(listener)
  }

  fun setActions(actions: List<Action>) {
    buttons = actions.map { action ->
      CommandButton.Builder(CommandButton.ICON_UNDEFINED)
          .setCustomIconResId(action.icon)
          .setDisplayName(action.label)
          .setSessionCommand(SessionCommand(action.name, Bundle.EMPTY))
          .setSlots(CommandButton.SLOT_OVERFLOW)
          .build()
    }
    session?.setMediaButtonPreferences(buttons)
  }

  fun emit(name: String, payload: Bundle = Bundle()) {
    emitter?.invoke(name, payload)
  }

  /** The JS track a queue item was made from (kept on the device: never sent to controllers). */
  fun trackOf(item: MediaItem?): Bundle? = item?.localConfiguration?.tag as? Bundle

  /** Player state as track-player names it (`playing`, `paused`, `buffering`…). */
  fun stateOf(player: Player): String = when (player.playbackState) {
    Player.STATE_IDLE -> if (player.playerError != null) "error" else if (player.mediaItemCount == 0) "none" else "stopped"
    Player.STATE_BUFFERING -> if (player.playWhenReady) "buffering" else "loading"
    Player.STATE_READY -> if (player.playWhenReady) "playing" else "paused"
    Player.STATE_ENDED -> "ended"
    else -> "none"
  }

  private val events = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      if (events.containsAny(
              Player.EVENT_PLAYBACK_STATE_CHANGED,
              Player.EVENT_PLAY_WHEN_READY_CHANGED,
              Player.EVENT_PLAYER_ERROR,
              Player.EVENT_TIMELINE_CHANGED,
          )) {
        val state = stateOf(player)
        if (state != lastState) {
          lastState = state
          emit("playback-state", Bundle().apply { putString("state", state) })
        }
      }
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      val player = player ?: return
      val index = if (mediaItem == null) null else player.currentMediaItemIndex
      val track = trackOf(mediaItem)
      emit("playback-active-track-changed", Bundle().apply {
        lastIndex?.let { putInt("lastIndex", it) }
        lastTrack?.let { putBundle("lastTrack", it) }
        index?.let { putInt("index", it) }
        track?.let { putBundle("track", it) }
      })
      lastIndex = index
      lastTrack = track
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
      val player = player ?: return
      if (playbackState != Player.STATE_ENDED) return
      emit("playback-queue-ended", Bundle().apply {
        putInt("track", player.currentMediaItemIndex)
        putDouble("position", player.currentPosition.coerceAtLeast(0) / 1000.0)
      })
    }

    // Same codes as track-player (`android-io-network-connection-failed`…): the engine skips
    // the track, or waits for the network. The message may quote the stream URL: not logged.
    override fun onPlayerError(error: PlaybackException) {
      val code = "android-" + error.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', '-')
      emit("playback-error", Bundle().apply {
        putString("code", code)
        putString("message", error.errorCodeName)
      })
    }
  }

  /** Seconds, as track-player gives them; 0 when unknown. */
  fun seconds(ms: Long): Double = if (ms == C.TIME_UNSET || ms < 0) 0.0 else ms / 1000.0
}
