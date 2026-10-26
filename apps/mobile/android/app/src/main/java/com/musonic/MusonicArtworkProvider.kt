package com.musonic

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.core.content.ContextCompat
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import okhttp3.Request

/**
 * Covers for Android Auto (ADR-015). Server cover URLs carry the account credentials, so the
 * car only ever gets `content://<package>.artwork/<key>`: this process reads the local file
 * or downloads the cover itself, and keeps a small disk cache. Sources live in memory only.
 *
 * @author DoodzProg
 */
object MusonicArtwork {
  private const val DIR = "auto-artwork"
  private const val MAX_FILES = 400

  /** Keys of the images the app draws itself (sent by JS as `res:<name>`). */
  private const val DRAWN = "res:"
  const val LIKED_TILE = "res:liked"
  private const val ICON = "icon:"
  const val PLAY_ICON = "icon:play"
  const val SHUFFLE_ICON = "icon:shuffle_off"
  private const val TILE_PX = 300
  private const val STYLE = "style"
  const val STYLE_CAR = "car"
  /** Car covers: margin on each side and corner radius, as parts of the tile. */
  private const val CAR_MARGIN = 0.05f
  private const val CAR_RADIUS = 0.09f
  private const val DRAWN_VERSION = 2
  private const val LIKED_TOP = 0xFF6B2FA0.toInt()
  private const val LIKED_BOTTOM = 0xFF1E3A8A.toInt()

  private val sources = ConcurrentHashMap<String, String>()

  /** Remembers where the cover behind [key] comes from and returns the URI the car may load. */
  fun register(context: Context, key: String, source: String): Uri {
    sources[key] = source
    return uriOf(context, key)
  }

  /**
   * The URI the car may load for [key], its address being given later (or already cached).
   * `icon:<name>` is the app's vector `ic_auto_<name>` (tabs, buttons), which the car tints.
   */
  fun uriOf(context: Context, key: String): Uri {
    if (key.startsWith(ICON)) {
      return Uri.parse("android.resource://${context.packageName}/drawable/ic_auto_${key.removePrefix(ICON)}")
    }
    return Uri.Builder()
        .scheme("content")
        .authority("${context.packageName}.artwork")
        .appendPath(key)
        .build()
  }

  /** The cover as Musonic's own car screens show it: rounded, with a margin ([carFile]). */
  fun carUriOf(context: Context, key: String): Uri =
      uriOf(context, key).buildUpon().appendQueryParameter(STYLE, STYLE_CAR).build()

  fun source(key: String): String? = sources[key]

  /**
   * The cover with rounded corners and a transparent margin, so that the car's tiles do not
   * touch (the car draws them square and side by side). Made once from [file], then kept.
   */
  fun carFile(context: Context, key: String, source: String?): File? {
    val raw = file(context, key, source) ?: return null
    val out = File(File(context.cacheDir, DIR), "${hash(key)}-car")
    if (out.isFile && out.lastModified() >= raw.lastModified()) return out
    val bitmap = BitmapFactory.decodeFile(raw.path) ?: return raw
    val side = minOf(bitmap.width, bitmap.height)
    val square = Bitmap.createBitmap(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
    val inset = (TILE_PX * CAR_MARGIN).toInt()
    val inner = TILE_PX - 2 * inset
    val scaled = Bitmap.createScaledBitmap(square, inner, inner, true)
    val result = Bitmap.createBitmap(TILE_PX, TILE_PX, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
        setLocalMatrix(Matrix().apply { setTranslate(inset.toFloat(), inset.toFloat()) })
      }
    }
    val radius = TILE_PX * CAR_RADIUS
    Canvas(result).drawRoundRect(RectF(inset.toFloat(), inset.toFloat(), (TILE_PX - inset).toFloat(), (TILE_PX - inset).toFloat()), radius, radius, paint)
    return try {
      val tmp = File(out.path + ".tmp")
      tmp.outputStream().use { result.compress(Bitmap.CompressFormat.PNG, 100, it) }
      if (tmp.renameTo(out)) out else raw
    } catch (_: IOException) {
      raw
    }
  }

  /**
   * Local file of the cover, downloaded on first use; null when it cannot be had. Without its
   * address (Musonic just started for the car, JS not ready yet) only a cached cover is served.
   */
  fun file(context: Context, key: String, source: String?): File? {
    if (key.startsWith(DRAWN)) return drawn(context, key)
    if (source != null && (source.startsWith("file://") || source.startsWith("/"))) {
      val local = File(Uri.parse(source).path ?: source)
      return local.takeIf { it.isFile }
    }
    val dir = File(context.cacheDir, DIR).apply { mkdirs() }
    val file = File(dir, hash(key))
    if (file.isFile) return file
    if (source == null) return null
    val request = Request.Builder().url(source).build()
    return try {
      OkHttpClientProvider.getOkHttpClient().newCall(request).execute().use { response ->
        val body = response.body
        if (!response.isSuccessful || body == null) return null
        val tmp = File(dir, "${file.name}.tmp")
        body.byteStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
        if (!tmp.renameTo(file)) return null
      }
      trim(dir)
      file
    } catch (_: IOException) {
      // Offline or server error: the car shows its placeholder. The URL is never logged.
      null
    }
  }

  /** Images drawn by the app: the Liked songs tile. */
  private fun drawn(context: Context, key: String): File? {
    val dir = File(context.cacheDir, DIR).apply { mkdirs() }
    // Bumped when the drawing changes: the old picture is in the cache.
    val file = File(dir, hash("$key#$DRAWN_VERSION"))
    if (file.isFile) return file
    val bitmap = when (key) {
      LIKED_TILE -> tile(context, R.drawable.ic_auto_liked)
      else -> return null
    } ?: return null
    return try {
      val tmp = File(dir, "${file.name}.tmp")
      tmp.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      if (tmp.renameTo(file)) file else null
    } catch (_: IOException) {
      null
    }
  }

  /** The app's Liked songs cover: white heart on its purple to blue gradient. */
  private fun tile(context: Context, glyph: Int): Bitmap? {
    val drawable = ContextCompat.getDrawable(context, glyph)?.mutate() ?: return null
    drawable.setTint(Color.WHITE)
    val size = TILE_PX
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint().apply {
      shader = LinearGradient(0f, 0f, 0f, size.toFloat(), LIKED_TOP, LIKED_BOTTOM, Shader.TileMode.CLAMP)
    }
    canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), paint)
    val glyphPx = (size * 0.45f).toInt()
    val inset = (size - glyphPx) / 2
    drawable.setBounds(inset, inset, inset + glyphPx, inset + glyphPx)
    drawable.draw(canvas)
    return bitmap
  }

  private fun trim(dir: File) {
    val files = dir.listFiles() ?: return
    if (files.size <= MAX_FILES) return
    files.sortedBy { it.lastModified() }.take(files.size - MAX_FILES).forEach { it.delete() }
  }

  private fun hash(key: String): String =
      MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
}

/** Read-only: serves only covers registered by [MusonicArtwork], nothing else. */
class MusonicArtworkProvider : ContentProvider() {

  override fun onCreate(): Boolean = true

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw SecurityException("Read only")
    val context = context ?: throw FileNotFoundException()
    val key = uri.lastPathSegment ?: throw FileNotFoundException()
    val source = MusonicArtwork.source(key)
    val file = (if (uri.getQueryParameter("style") == MusonicArtwork.STYLE_CAR) MusonicArtwork.carFile(context, key, source)
        else MusonicArtwork.file(context, key, source)) ?: throw FileNotFoundException(key)
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri): String = "image/*"

  override fun query(
      uri: Uri,
      projection: Array<out String>?,
      selection: String?,
      selectionArgs: Array<out String>?,
      sortOrder: String?,
  ): Cursor? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
