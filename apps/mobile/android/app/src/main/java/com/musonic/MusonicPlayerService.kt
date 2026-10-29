package com.musonic

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * The native player (ADR-022): ExoPlayer with audio offload (the audio chip decodes while
 * the screen is off) in a Media3 session, which shows the notification and the lock screen
 * and serves Android Auto through its token. The JS playback engine drives the queue through
 * [MusonicPlayerModule]; next, previous and seeks pressed in other apps (notification,
 * headset, car) reach JS as `remote-*` events, as with track-player.
 *
 * @author DoodzProg
 */
@OptIn(UnstableApi::class)
class MusonicPlayerService : MediaSessionService() {

  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    val http = DefaultHttpDataSource.Factory()
        .setUserAgent("Musonic")
        .setAllowCrossProtocolRedirects(true)
    val player = ExoPlayer.Builder(this)
        .setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
            true, // audio focus: ducks and pauses for calls and navigation, like any media app
        )
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(this, http)))
        .build()
    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
        .setAudioOffloadPreferences(
            AudioOffloadPreferences.Builder()
                .setAudioOffloadMode(AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED)
                .setIsGaplessSupportRequired(true)
                .build(),
        )
        .build()
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val built = MediaSession.Builder(this, RemoteControls(player))
        .setCallback(Callback())
        .apply { if (openApp != null) setSessionActivity(openApp) }
        .build()
    session = built
    MusonicPlayback.attach(player, built)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  // Musonic swiped away from the recent apps: playback stops and the notification goes,
  // as with track-player (`StopPlaybackAndRemoveNotification`).
  override fun onTaskRemoved(rootIntent: Intent?) {
    MusonicPlayback.player?.run {
      pause()
      stop()
    }
    stopSelf()
  }

  override fun onDestroy() {
    MusonicPlayback.detach()
    session?.run {
      player.release()
      release()
    }
    session = null
    super.onDestroy()
  }

  /**
   * What other apps see of the player. The JS engine owns the queue, so next and previous are
   * its call; play, pause and seeks act at once and JS is told.
   */
  class RemoteControls(player: Player) : ForwardingPlayer(player) {
    private val listeners = mutableListOf<Player.Listener>()

    /**
     * Shown in place of the artist while set (the car's lyrics mode, ADR-025): the car draws
     * its playback screen from the session's metadata, nothing else can go there.
     */
    var line: String? = null
      set(value) {
        if (field == value) return
        field = value
        val metadata = mediaMetadata
        listeners.toList().forEach { it.onMediaMetadataChanged(metadata) }
      }

    override fun getMediaMetadata(): MediaMetadata {
      val metadata = super.getMediaMetadata()
      val shown = line ?: return metadata
      return metadata.buildUpon().setArtist(shown).setSubtitle(shown).build()
    }

    override fun addListener(listener: Player.Listener) {
      listeners.add(listener)
      super.addListener(listener)
    }

    override fun removeListener(listener: Player.Listener) {
      listeners.remove(listener)
      super.removeListener(listener)
    }

    override fun seekToNext() = MusonicPlayback.emit("remote-next")
    override fun seekToNextMediaItem() = MusonicPlayback.emit("remote-next")
    override fun seekToPrevious() = MusonicPlayback.emit("remote-previous")
    override fun seekToPreviousMediaItem() = MusonicPlayback.emit("remote-previous")

    override fun seekTo(positionMs: Long) {
      super.seekTo(positionMs)
      MusonicPlayback.emit("remote-seek", Bundle().apply { putDouble("position", positionMs / 1000.0) })
    }

    // Next and previous stay offered at the ends of the native queue: the engine may go on.
    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands().buildUpon()
            .addAll(
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            )
            .build()

    override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)
  }

  private class Callback : MediaSession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
          .apply { MusonicPlayback.ACTIONS.forEach { add(SessionCommand(it, Bundle.EMPTY)) } }
          .build()
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller)
          .setAvailableSessionCommands(commands)
          .setMediaButtonPreferences(MusonicPlayback.buttons)
          .build()
    }

    override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle,
    ): ListenableFuture<SessionResult> {
      MusonicPlayback.onAction?.invoke(customCommand.customAction)
      return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }

    // Android Auto: a tapped item plays its whole list, which JS builds (ADR-015). The
    // session itself loads nothing.
    override fun onAddMediaItems(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
      val item = mediaItems.firstOrNull()
      val query = item?.requestMetadata?.searchQuery
      when {
        // « Play … on Musonic »: JS searches and plays what it finds.
        !query.isNullOrBlank() -> MusonicPlayback.emit("remote-play-search", Bundle().apply { putString("query", query) })
        !item?.mediaId.isNullOrEmpty() -> MusonicPlayback.emit("remote-play-id", Bundle().apply { putString("id", item?.mediaId) })
      }
      return Futures.immediateFailedFuture(UnsupportedOperationException("Played by the JS engine"))
    }
  }
}
