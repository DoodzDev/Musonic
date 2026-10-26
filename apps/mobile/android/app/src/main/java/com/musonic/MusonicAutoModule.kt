package com.musonic

import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
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
 * Bridge between [MusonicAutoService] and the JS side (ADR-015): the car asks for the
 * children of a node, JS answers with plain items (covers go through [MusonicArtwork]).
 * JS also sets the playback screen's shuffle / repeat / like buttons and gets their presses,
 * and registers the player's covers (served by [MusonicArtworkProvider], never a server URL).
 * Everything runs on the main thread.
 *
 * @author DoodzProg
 */
object MusonicAutoBridge {
  private const val TIMEOUT_MS = 8000L

  private val main = Handler(Looper.getMainLooper())
  private val pending = HashMap<String, Result<MutableList<MediaItem>>>()
  private var nextId = 0

  /** Set once JS listens for requests, cleared when the React instance goes away. */
  var module: MusonicAutoModule? = null

  /** Returns false when JS is not running: the caller answers with an empty list. */
  fun loadChildren(parentId: String, result: Result<MutableList<MediaItem>>): Boolean {
    val target = module ?: return false
    val requestId = (nextId++).toString()
    pending[requestId] = result
    result.detach()
    target.requestChildren(requestId, parentId)
    main.postDelayed({ pending.remove(requestId)?.sendResult(mutableListOf()) }, TIMEOUT_MS)
    return true
  }

  fun resolve(requestId: String, items: MutableList<MediaItem>) {
    main.post { pending.remove(requestId)?.sendResult(items) }
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

  /** `{shuffle: off|on|magic, repeat: none|all|one, liked: boolean|null, labels: {...}}` */
  @ReactMethod
  fun setActions(state: ReadableMap) {
    val labels = state.getMap("labels") ?: return
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
    UiThreadUtil.runOnUiThread {
      MusonicCustomActions.set(actions)
      MusonicPlayback.setActions(actions.map { MusonicPlayback.Action(it.name, it.label, it.icon) })
    }
  }

  @ReactMethod
  fun resolveChildren(requestId: String, items: ReadableArray) {
    val list = ArrayList<MediaItem>(items.size())
    for (i in 0 until items.size()) {
      val item = items.getMap(i) ?: continue
      list.add(toMediaItem(
          id = item.getString("id") ?: continue,
          title = item.getString("title") ?: "",
          subtitle = if (item.hasKey("subtitle")) item.getString("subtitle") else null,
          browsable = item.hasKey("browsable") && item.getBoolean("browsable"),
          downloaded = item.hasKey("downloaded") && item.getBoolean("downloaded"),
          grid = item.hasKey("grid") && item.getBoolean("grid"),
          art = (if (item.hasKey("art")) item.getMap("art") else null)?.let { art ->
            val key = art.getString("key")
            val uri = art.getString("uri")
            if (key != null && uri != null) MusonicArtwork.register(reactApplicationContext, key, uri) else null
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

  private fun toMediaItem(
      id: String,
      title: String,
      subtitle: String?,
      browsable: Boolean,
      downloaded: Boolean,
      grid: Boolean,
      art: Uri?,
  ): MediaItem {
    val extras = Bundle()
    if (downloaded) {
      extras.putLong(MediaDescriptionCompat.EXTRA_DOWNLOAD_STATUS, MediaDescriptionCompat.STATUS_DOWNLOADED)
    }
    if (browsable) {
      // Style of this node's own children in the car.
      val style = if (grid) CONTENT_STYLE_GRID else CONTENT_STYLE_LIST
      extras.putInt(CONTENT_STYLE_BROWSABLE_HINT, style)
      extras.putInt(CONTENT_STYLE_PLAYABLE_HINT, style)
    }
    val description = MediaDescriptionCompat.Builder()
        .setMediaId(id)
        .setTitle(title)
        .setSubtitle(subtitle)
        .setIconUri(art)
        .setExtras(extras)
        .build()
    return MediaItem(description, if (browsable) MediaItem.FLAG_BROWSABLE else MediaItem.FLAG_PLAYABLE)
  }

  companion object {
    const val EVENT_CHILDREN = "musonic-auto-children"
    const val EVENT_ACTION = "musonic-auto-action"
    const val ACTION_SHUFFLE = "musonic.shuffle"
    const val ACTION_REPEAT = "musonic.repeat"
    const val ACTION_LIKE = "musonic.like"
    const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
    const val CONTENT_STYLE_LIST = 1
    const val CONTENT_STYLE_GRID = 2
  }
}
