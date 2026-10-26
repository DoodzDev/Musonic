package com.musonic

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import android.util.Log
import androidx.media.utils.MediaConstants
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors

/**
 * The lists Android Auto opens without asking JS (ADR-022 step 2). JS sends every list its
 * caches hold (library, playlists and their tracks, albums, artists, downloads); they are
 * kept on disk, so the car shows them at once, even when Musonic was closed. Covers are kept
 * by key only: their addresses may hold credentials and stay in memory ([MusonicArtwork]).
 *
 * @author DoodzProg
 */
object MusonicAutoSnapshot {
  private const val FILE = "auto-snapshot.json"
  private const val TAG = "MusonicAuto"

  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  @Volatile private var nodes: JSONObject? = null
  @Volatile private var loaded = false

  /** The entries of [parentId], or null when the snapshot does not hold that list. */
  fun entries(context: Context, parentId: String): List<AutoEntry>? {
    val items = (nodes ?: load(context))?.optJSONArray(parentId) ?: return null
    return List(items.length()) { i ->
      val item = items.getJSONObject(i)
      AutoEntry(
          id = item.getString("id"),
          title = item.optString("title"),
          subtitle = item.optString("subtitle").takeIf { item.has("subtitle") },
          browsable = item.optBoolean("browsable"),
          downloaded = item.optBoolean("downloaded"),
          grid = item.optBoolean("grid"),
          artKey = item.optJSONObject("art")?.optString("key")?.takeIf { it.isNotEmpty() },
          actions = item.optJSONArray("actions")?.let { list -> List(list.length()) { list.getString(it) } },
      )
    }
  }

  /** A new snapshot from JS: kept, saved, and [onChanged] gets the lists that changed (main thread). */
  fun set(context: Context, json: String, onChanged: (List<String>) -> Unit) {
    io.execute {
      val next = try {
        JSONObject(json)
      } catch (_: JSONException) {
        Log.w(TAG, "Snapshot not readable")
        return@execute
      }
      val previous = nodes ?: load(context)
      val changed = next.keys().asSequence()
          .filter { id -> previous?.optJSONArray(id)?.toString() != next.optJSONArray(id)?.toString() }
          .toList()
      nodes = next
      save(context, json)
      if (changed.isNotEmpty()) main.post { onChanged(changed) }
    }
  }

  private fun load(context: Context): JSONObject? {
    if (loaded) return nodes
    val file = File(context.filesDir, FILE)
    nodes = try {
      if (file.isFile) JSONObject(file.readText()) else null
    } catch (_: Exception) {
      null
    }
    loaded = true
    return nodes
  }

  private fun save(context: Context, json: String) {
    val file = File(context.filesDir, FILE)
    val tmp = File(context.filesDir, "$FILE.tmp")
    try {
      tmp.writeText(json)
      if (!tmp.renameTo(file)) tmp.delete()
    } catch (_: IOException) {
      tmp.delete()
    }
  }

  /** One row of the classic media browser. */
  fun mediaItem(context: Context, entry: AutoEntry): MediaItem {
    val extras = Bundle()
    // Play / Shuffle buttons on the item (browse actions), started without opening it.
    entry.actions?.mapNotNull(MusonicAutoService::browseActionId)?.takeIf { it.isNotEmpty() }?.let {
      extras.putStringArrayList(MediaConstants.DESCRIPTION_EXTRAS_KEY_CUSTOM_BROWSER_ACTION_ID_LIST, ArrayList(it))
    }
    if (entry.downloaded) {
      extras.putLong(MediaDescriptionCompat.EXTRA_DOWNLOAD_STATUS, MediaDescriptionCompat.STATUS_DOWNLOADED)
    }
    if (entry.browsable) {
      // Style of this node's own children in the car.
      val style = if (entry.grid) MusonicAutoModule.CONTENT_STYLE_GRID else MusonicAutoModule.CONTENT_STYLE_LIST
      extras.putInt(MusonicAutoModule.CONTENT_STYLE_BROWSABLE_HINT, style)
      extras.putInt(MusonicAutoModule.CONTENT_STYLE_PLAYABLE_HINT, style)
    }
    val description = MediaDescriptionCompat.Builder()
        .setMediaId(entry.id)
        .setTitle(entry.title)
        .setSubtitle(entry.subtitle)
        .setIconUri(entry.artKey?.let { MusonicArtwork.uriOf(context, it) })
        .setExtras(extras)
        .build()
    return MediaItem(description, if (entry.browsable) MediaItem.FLAG_BROWSABLE else MediaItem.FLAG_PLAYABLE)
  }
}

/**
 * One item of the car's library, from the snapshot or from JS: a list to open (`browsable`) or
 * a track to play; its cover is a key of [MusonicArtwork] (`icon:<name>`: an app icon).
 */
data class AutoEntry(
    val id: String,
    val title: String,
    val subtitle: String?,
    val browsable: Boolean,
    val downloaded: Boolean,
    val grid: Boolean,
    val artKey: String?,
    val actions: List<String>?,
)
