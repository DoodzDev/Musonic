package com.musonic

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.util.Log
import androidx.media.MediaBrowserServiceCompat.Result
import com.doublesymmetry.trackplayer.service.MusonicCustomActions
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Bridge between the car ([MusonicAutoService], the classic media browser, and the screens of
 * [MusonicCarAppService]) and the JS side (ADR-015): the car asks for the children of a node;
 * the lists of the snapshot are answered at once ([MusonicAutoSnapshot], ADR-022 step 2), the
 * others by JS with plain items (covers go through [MusonicArtwork]). A tapped track is played
 * by JS too.
 * JS also sets the playback screen's shuffle / repeat / like buttons and gets their presses,
 * and registers the player's covers (served by [MusonicArtworkProvider], never a server URL).
 * Everything runs on the main thread.
 *
 * @author DoodzProg
 */
object MusonicAutoBridge {
  private const val TIMEOUT_MS = 8000L

  private const val TAG = "MusonicAuto"

  private class Request(val parentId: String, val onEntries: (List<AutoEntry>) -> Unit, val start: Long)

  private val main = Handler(Looper.getMainLooper())
  private val pending = HashMap<String, Request>()
  private var nextId = 0

  /** Set once JS listens for requests, cleared when the React instance goes away. */
  var module: MusonicAutoModule? = null

  /** The classic media browser's request; false when the list cannot be had: the caller answers empty. */
  fun loadChildren(context: Context, parentId: String, result: Result<MutableList<MediaItem>>): Boolean {
    if (MusonicAutoSnapshot.entries(context, parentId) == null && module == null) return false
    result.detach()
    entries(context, parentId) { list -> result.sendResult(list.mapTo(mutableListOf()) { MusonicAutoSnapshot.mediaItem(context, it) }) }
    return true
  }

  /**
   * The entries of [parentId]: from the snapshot at once, else from JS (empty after a while, or
   * at once when JS is not running). [onEntries] runs on the main thread.
   */
  fun entries(context: Context, parentId: String, onEntries: (List<AutoEntry>) -> Unit) {
    val start = SystemClock.elapsedRealtime()
    MusonicAutoSnapshot.entries(context, parentId)?.let { list ->
      onEntries(list)
      log(parentId, list.size, start, "snapshot")
      return
    }
    val target = module
    if (target == null) {
      onEntries(emptyList())
      return
    }
    val requestId = (nextId++).toString()
    pending[requestId] = Request(parentId, onEntries, start)
    target.requestChildren(requestId, parentId)
    main.postDelayed({ pending.remove(requestId)?.onEntries?.invoke(emptyList()) }, TIMEOUT_MS)
  }

  fun resolve(requestId: String, list: List<AutoEntry>) {
    main.post {
      val request = pending.remove(requestId) ?: return@post
      request.onEntries(list)
      log(request.parentId, list.size, request.start, "js")
    }
  }

  /** A track tapped on a car screen: JS plays its whole list from it. False when JS is not running. */
  fun play(mediaId: String): Boolean {
    val target = module ?: return false
    target.notifyPlay(mediaId)
    return true
  }

  /** Play or Shuffle pressed on a list in the car; false when JS is not running. */
  fun browseAction(action: String, mediaId: String): Boolean {
    val target = module ?: return false
    target.notifyBrowseAction(action, mediaId)
    return true
  }

  /** A podcast episode is playing (set by JS with the buttons): the car's playback screen adapts. */
  var episode = false
    private set

  private val episodeListeners = mutableSetOf<() -> Unit>()

  fun onEpisodeChanged(listener: () -> Unit): () -> Unit {
    episodeListeners.add(listener)
    return { episodeListeners.remove(listener) }
  }

  fun setEpisode(value: Boolean) {
    if (value == episode) return
    episode = value
    episodeListeners.toList().forEach { it() }
  }

  /** The car (or the system's media controls) connected: JS sends a fresh snapshot. */
  fun connected() {
    module?.notifyConnected()
  }

  // Ids only (playlist, album): never a title or a URL.
  private fun log(parentId: String, count: Int, start: Long, from: String) {
    Log.i(TAG, "$parentId: $count items in ${SystemClock.elapsedRealtime() - start} ms ($from)")
  }
}

class MusonicAutoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "MusonicAuto"

  override fun getConstants(): Map<String, Any> =
      mapOf("artworkAuthority" to "${reactApplicationContext.packageName}.artwork")

  /** The cover behind `content://<package>.artwork/<key>`; [uri] stays in this process. */
  @ReactMethod
  fun registerArtwork(key: String, uri: String) {
    MusonicArtwork.register(reactApplicationContext, key, uri)
  }

  fun notifyBrowseAction(action: String, mediaId: String) {
    emit(EVENT_BROWSE_ACTION, Arguments.createMap().apply {
      putString("action", action)
      putString("mediaId", mediaId)
    })
  }

  fun notifyPlay(mediaId: String) {
    emit(EVENT_PLAY, Arguments.createMap().apply { putString("mediaId", mediaId) })
  }

  fun notifyConnected() {
    emit(EVENT_CONNECTED, Arguments.createMap())
  }

  /** The snapshot (ADR-022 step 2): [nodes] is kept on disk, [arts] (cover addresses) in memory only. */
  @ReactMethod
  fun setSnapshot(nodes: String, arts: ReadableMap) {
    val iterator = arts.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      arts.getString(key)?.let { MusonicArtwork.register(reactApplicationContext, key, it) }
    }
    MusonicAutoSnapshot.set(reactApplicationContext, nodes) { changed ->
      MusonicAutoService.current?.let { service -> changed.forEach(service::notifyChildrenChanged) }
    }
  }

  fun requestChildren(requestId: String, parentId: String) {
    emit(EVENT_CHILDREN, Arguments.createMap().apply {
      putString("requestId", requestId)
      putString("parentId", parentId)
    })
  }

  private fun emit(event: String, payload: WritableMap) {
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, payload)
  }

  @ReactMethod
  fun ready() {
    MusonicAutoBridge.module = this
    val onAction = { name: String ->
      emit(EVENT_ACTION, Arguments.createMap().apply { putString("action", name) })
    }
    MusonicCustomActions.onAction = onAction
    MusonicPlayback.onAction = onAction
  }

  /**
   * `{shuffle: off|on|magic, repeat: none|all|one, liked: boolean|null, episode: boolean, speed: number, labels: {...}}`.
   * A podcast episode gets back 15 s, forward 30 s and its speed instead (ADR-023): the car shows
   * no label, so the icons carry the numbers.
   */
  @ReactMethod
  fun setActions(state: ReadableMap) {
    val labels = state.getMap("labels") ?: return
    val episode = state.hasKey("episode") && state.getBoolean("episode")
    UiThreadUtil.runOnUiThread { MusonicAutoBridge.setEpisode(episode) }
    if (episode) {
      publishActions(listOf(
          MusonicCustomActions.Action(ACTION_BACK, labels.getString("back") ?: "", R.drawable.ic_auto_back15),
          MusonicCustomActions.Action(ACTION_FORWARD, labels.getString("forward") ?: "", R.drawable.ic_auto_forward30),
          MusonicCustomActions.Action(ACTION_SPEED, labels.getString("speed") ?: "", speedIcon(state.getDouble("speed"))),
      ))
      return
    }
    val shuffle = when (state.getString("shuffle")) {
      "on" -> R.drawable.ic_auto_shuffle_on to "shuffleOn"
      "magic" -> R.drawable.ic_auto_shuffle_magic to "shuffleMagic"
      else -> R.drawable.ic_auto_shuffle_off to "shuffleOff"
    }
    val repeat = when (state.getString("repeat")) {
      "all" -> R.drawable.ic_auto_repeat_all to "repeatAll"
      "one" -> R.drawable.ic_auto_repeat_one to "repeatOne"
      else -> R.drawable.ic_auto_repeat_off to "repeatOff"
    }
    val actions = mutableListOf(
        MusonicCustomActions.Action(ACTION_SHUFFLE, labels.getString(shuffle.second) ?: "", shuffle.first),
        MusonicCustomActions.Action(ACTION_REPEAT, labels.getString(repeat.second) ?: "", repeat.first),
    )
    // No like button for a track that cannot be liked (nothing playing).
    if (state.hasKey("liked") && !state.isNull("liked")) {
      val liked = state.getBoolean("liked")
      actions.add(MusonicCustomActions.Action(
          ACTION_LIKE,
          labels.getString(if (liked) "unlike" else "like") ?: "",
          if (liked) R.drawable.ic_auto_liked else R.drawable.ic_auto_like,
      ))
    }
    publishActions(actions)
  }

  private fun speedIcon(speed: Double): Int = when (speed) {
    0.75 -> R.drawable.ic_auto_speed_075
    1.25 -> R.drawable.ic_auto_speed_125
    1.5 -> R.drawable.ic_auto_speed_150
    1.75 -> R.drawable.ic_auto_speed_175
    2.0 -> R.drawable.ic_auto_speed_200
    else -> R.drawable.ic_auto_speed_100
  }

  private fun publishActions(actions: List<MusonicCustomActions.Action>) {
    UiThreadUtil.runOnUiThread {
      MusonicCustomActions.set(actions)
      MusonicPlayback.setActions(actions.map { MusonicPlayback.Action(it.name, it.label, it.icon) })
    }
  }

  @ReactMethod
  fun resolveChildren(requestId: String, items: ReadableArray) {
    val list = ArrayList<AutoEntry>(items.size())
    for (i in 0 until items.size()) {
      val item = items.getMap(i) ?: continue
      list.add(AutoEntry(
          id = item.getString("id") ?: continue,
          title = item.getString("title") ?: "",
          subtitle = if (item.hasKey("subtitle")) item.getString("subtitle") else null,
          browsable = item.hasKey("browsable") && item.getBoolean("browsable"),
          downloaded = item.hasKey("downloaded") && item.getBoolean("downloaded"),
          grid = item.hasKey("grid") && item.getBoolean("grid"),
          artKey = (if (item.hasKey("art")) item.getMap("art") else null)?.let { art ->
            val key = art.getString("key")
            val uri = art.getString("uri")
            if (key != null && !uri.isNullOrEmpty()) MusonicArtwork.register(reactApplicationContext, key, uri)
            key
          },
          actions = (if (item.hasKey("actions")) item.getArray("actions") else null)?.let { list ->
            (0 until list.size()).mapNotNull { list.getString(it) }
          },
      ))
    }
    MusonicAutoBridge.resolve(requestId, list)
  }

  // Required by NativeEventEmitter on the JS side.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  override fun invalidate() {
    if (MusonicAutoBridge.module === this) {
      MusonicAutoBridge.module = null
      MusonicCustomActions.onAction = null
      MusonicPlayback.onAction = null
    }
    super.invalidate()
  }

  companion object {
    const val EVENT_CHILDREN = "musonic-auto-children"
    const val EVENT_ACTION = "musonic-auto-action"
    const val EVENT_CONNECTED = "musonic-auto-connected"
    const val EVENT_BROWSE_ACTION = "musonic-auto-browse-action"
    const val EVENT_PLAY = "musonic-auto-play"
    const val ACTION_SHUFFLE = "musonic.shuffle"
    const val ACTION_REPEAT = "musonic.repeat"
    const val ACTION_LIKE = "musonic.like"
    const val ACTION_BACK = "musonic.back15"
    const val ACTION_FORWARD = "musonic.forward30"
    const val ACTION_SPEED = "musonic.speed"
    const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
    const val CONTENT_STYLE_LIST = 1
    const val CONTENT_STYLE_GRID = 2
  }
}
