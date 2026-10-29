package com.musonic

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.common.util.concurrent.ListenableFuture

/**
 * JS side of the native player (ADR-022): the calls and events of track-player that the app
 * uses, with the same names, values and payloads, so the playback engine works on either
 * player. Everything runs on the main thread, where the player lives.
 *
 * @author DoodzProg
 */
class MusonicPlayerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  /** Keeps the service bound (and so alive) while JS uses the player. */
  private var controller: ListenableFuture<MediaController>? = null

  /** Headless task that keeps JS timers running in the background while music plays. */
  private var keepAliveTask: Int? = null

  override fun getName(): String = "MusonicPlayer"

  @ReactMethod
  fun setupPlayer(promise: Promise) = onMain(promise) {
    MusonicPlayback.emitter = ::send
    if (controller == null) {
      val token = SessionToken(reactApplicationContext, ComponentName(reactApplicationContext, MusonicPlayerService::class.java))
      controller = MediaController.Builder(reactApplicationContext, token).buildAsync()
    }
    MusonicPlayback.withPlayer { promise.resolve(null) }
  }

  /** Nothing to set: the session offers play, pause, next, previous and seek to every controller. */
  @ReactMethod
  fun updateOptions(@Suppress("UNUSED_PARAMETER") options: ReadableMap?, promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun add(tracks: ReadableArray, insertBeforeIndex: Double, promise: Promise) = withPlayer(promise) { player ->
    val items = (0 until tracks.size()).mapNotNull { i -> tracks.getMap(i)?.let(::toMediaItem) }
    val index = insertBeforeIndex.toInt()
    val at = if (index < 0 || index > player.mediaItemCount) player.mediaItemCount else index
    player.addMediaItems(at, items)
    if (player.playbackState == Player.STATE_IDLE && player.mediaItemCount > 0) player.prepare()
    promise.resolve(at)
  }

  @ReactMethod
  fun remove(indexes: ReadableArray, promise: Promise) = withPlayer(promise) { player ->
    (0 until indexes.size()).map { indexes.getInt(it) }
        .filter { it in 0 until player.mediaItemCount }
        .sortedDescending()
        .distinct()
        .forEach(player::removeMediaItem)
    promise.resolve(null)
  }

  @ReactMethod
  fun reset(promise: Promise) = withPlayer(promise) { player ->
    player.stop()
    player.clearMediaItems()
    promise.resolve(null)
  }

  @ReactMethod
  fun skip(index: Double, initialPosition: Double, promise: Promise) = withPlayer(promise) { player ->
    val target = index.toInt()
    if (target !in 0 until player.mediaItemCount) {
      promise.reject("index_out_of_bounds", "The track index is out of bounds")
      return@withPlayer
    }
    player.seekTo(target, if (initialPosition > 0) (initialPosition * 1000).toLong() else 0L)
    promise.resolve(null)
  }

  @ReactMethod
  fun skipToNext(initialPosition: Double, promise: Promise) = withPlayer(promise) { player ->
    if (player.hasNextMediaItem()) {
      player.seekTo(player.nextMediaItemIndex, if (initialPosition > 0) (initialPosition * 1000).toLong() else 0L)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun play(promise: Promise) = withPlayer(promise) { player ->
    if (player.playbackState == Player.STATE_IDLE && player.mediaItemCount > 0) player.prepare()
    player.play()
    promise.resolve(null)
  }

  @ReactMethod
  fun pause(promise: Promise) = withPlayer(promise) { player ->
    player.pause()
    promise.resolve(null)
  }

  @ReactMethod
  fun seekTo(seconds: Double, promise: Promise) = withPlayer(promise) { player ->
    player.seekTo((seconds * 1000).toLong().coerceAtLeast(0))
    promise.resolve(null)
  }

  @ReactMethod
  fun setVolume(volume: Double, promise: Promise) = withPlayer(promise) { player ->
    player.volume = volume.toFloat().coerceIn(0f, 1f)
    promise.resolve(null)
  }

  // Podcast speed (ADR-023); the pitch stays the voice's.
  @ReactMethod
  fun setRate(rate: Double, promise: Promise) = withPlayer(promise) { player ->
    player.setPlaybackSpeed(rate.toFloat().coerceIn(0.5f, 3f))
    promise.resolve(null)
  }

  /** track-player's values (off 0, track 1, queue 2) are ExoPlayer's. */
  @ReactMethod
  fun setRepeatMode(mode: Double, promise: Promise) = withPlayer(promise) { player ->
    player.repeatMode = when (mode.toInt()) {
      1 -> Player.REPEAT_MODE_ONE
      2 -> Player.REPEAT_MODE_ALL
      else -> Player.REPEAT_MODE_OFF
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun getActiveTrack(promise: Promise) = withPlayer(promise) { player ->
    promise.resolve(MusonicPlayback.trackOf(player.currentMediaItem)?.let(Arguments::fromBundle))
  }

  @ReactMethod
  fun getActiveTrackIndex(promise: Promise) = withPlayer(promise) { player ->
    promise.resolve(if (player.mediaItemCount == 0) null else player.currentMediaItemIndex)
  }

  @ReactMethod
  fun getQueue(promise: Promise) = withPlayer(promise) { player ->
    val queue = Arguments.createArray()
    for (i in 0 until player.mediaItemCount) {
      queue.pushMap(Arguments.fromBundle(MusonicPlayback.trackOf(player.getMediaItemAt(i)) ?: Bundle()))
    }
    promise.resolve(queue)
  }

  @ReactMethod
  fun getProgress(promise: Promise) = withPlayer(promise) { player ->
    promise.resolve(Arguments.createMap().apply {
      putDouble("position", MusonicPlayback.seconds(player.currentPosition))
      putDouble("duration", MusonicPlayback.seconds(player.duration))
      putDouble("buffered", MusonicPlayback.seconds(player.bufferedPosition))
    })
  }

  @ReactMethod
  fun getPlaybackState(promise: Promise) = withPlayer(promise) { player ->
    promise.resolve(Arguments.createMap().apply { putString("state", MusonicPlayback.stateOf(player)) })
  }

  // Required by NativeEventEmitter on the JS side.
  @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}
  @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {}

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      if (MusonicPlayback.emitter != null) MusonicPlayback.emitter = null
      keepJsAwake(false)
      controller?.let(MediaController::releaseFuture)
      controller = null
    }
    super.invalidate()
  }

  private fun send(name: String, payload: Bundle) {
    if (name == "playback-state") keepJsAwake(payload.getString("state") == "playing")
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, Arguments.fromBundle(payload))
  }

  /**
   * React Native stops JS timers in the background unless a headless task runs: one runs
   * while music plays, so plays are counted and the position saved as before (ADR-022 step 3
   * moves that work to the native side and removes it).
   */
  private fun keepJsAwake(awake: Boolean) {
    val tasks = HeadlessJsTaskContext.getInstance(reactApplicationContext)
    val running = keepAliveTask
    if (awake && running == null) {
      keepAliveTask = try {
        tasks.startTask(HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0, true))
      } catch (_: IllegalStateException) {
        null
      }
    } else if (!awake && running != null) {
      if (tasks.isTaskRunning(running)) tasks.finishTask(running)
      keepAliveTask = null
    }
  }

  // Returns Unit, not runOnUiThread's Boolean: a React method returning a value is taken as
  // synchronous and the module is refused.
  private fun onMain(promise: Promise, block: () -> Unit) {
    UiThreadUtil.runOnUiThread {
      try {
        block()
      } catch (error: Exception) {
        promise.reject("player_error", error.message, error)
      }
    }
  }

  private fun withPlayer(promise: Promise, block: (ExoPlayer) -> Unit) = onMain(promise) {
    val player = MusonicPlayback.player
    if (player == null) promise.reject("player_not_initialized", "The player is not initialized. Call setupPlayer first.")
    else block(player)
  }

  /** A queue item from a JS track; the track itself stays with the item for `getQueue`. */
  private fun toMediaItem(track: ReadableMap): MediaItem? {
    val url = track.text("url") ?: return null
    val id = track.text("id") ?: url
    val metadata = MediaMetadata.Builder()
        .setTitle(track.text("title"))
        .setArtist(track.text("artist"))
        .setAlbumTitle(track.text("album"))
        .setIsPlayable(true)
        .setIsBrowsable(false)
    // Only covers served by the app: a server URL would carry the credentials to other apps.
    track.text("artwork")?.let(Uri::parse)?.takeIf { it.scheme == "content" || it.scheme == "file" }
        ?.let(metadata::setArtworkUri)
    if (track.hasKey("duration") && track.getType("duration") == ReadableType.Number) {
      val ms = (track.getDouble("duration") * 1000).toLong()
      if (ms > 0) metadata.setDurationMs(ms)
    }
    return MediaItem.Builder()
        .setMediaId(id)
        .setUri(url)
        .setMediaMetadata(metadata.build())
        .setTag(Arguments.toBundle(track))
        .build()
  }

  private fun ReadableMap.text(key: String): String? = when {
    !hasKey(key) -> null
    getType(key) == ReadableType.String -> getString(key)
    getType(key) == ReadableType.Number -> getDouble(key).let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }
    else -> null
  }

  companion object {
    /** The JS task that keeps timers running (registered by the player facade). */
    const val KEEP_ALIVE_TASK = "MusonicPlayback"
  }
}
