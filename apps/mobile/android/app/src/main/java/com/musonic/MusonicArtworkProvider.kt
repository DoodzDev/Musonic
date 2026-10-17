package com.musonic

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
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

  private val sources = ConcurrentHashMap<String, String>()

  /** Remembers where the cover behind [key] comes from and returns the URI the car may load. */
  fun register(context: Context, key: String, source: String): Uri {
    sources[key] = source
    return Uri.Builder()
        .scheme("content")
        .authority("${context.packageName}.artwork")
        .appendPath(key)
        .build()
  }

  fun source(key: String): String? = sources[key]

  /** Local file of the cover, downloaded on first use; null when it cannot be had. */
  fun file(context: Context, key: String, source: String): File? {
    if (source.startsWith("file://") || source.startsWith("/")) {
      val local = File(Uri.parse(source).path ?: source)
      return local.takeIf { it.isFile }
    }
    val dir = File(context.cacheDir, DIR).apply { mkdirs() }
    val file = File(dir, hash(key))
    if (file.isFile) return file
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
    val source = MusonicArtwork.source(key) ?: throw FileNotFoundException(key)
    val file = MusonicArtwork.file(context, key, source) ?: throw FileNotFoundException(key)
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
