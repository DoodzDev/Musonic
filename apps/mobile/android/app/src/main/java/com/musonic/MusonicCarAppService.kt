package com.musonic

import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.media.MediaPlaybackManager
import androidx.car.app.media.model.MediaPlaybackTemplate
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.GridItem
import androidx.car.app.model.GridSection
import androidx.car.app.model.Header
import androidx.car.app.model.Row
import androidx.car.app.model.RowSection
import androidx.car.app.model.SectionedItemTemplate
import androidx.car.app.model.Tab
import androidx.car.app.model.TabContents
import androidx.car.app.model.TabTemplate
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Musonic's own Android Auto screens (templated media app, ADR-025): tabs Home, Library and
 * Downloaded, big covers, lists with Play and Shuffle, and the playback screen. The lists come
 * from the snapshot JS keeps ([MusonicAutoSnapshot]), the others from JS through
 * [MusonicAutoBridge]; playback stays with the JS engine and the player's session.
 *
 * @author DoodzProg
 */
class MusonicCarAppService : CarAppService() {
  // Release: only Android Auto and the system hosts may bind; a debug build takes any host.
  override fun createHostValidator(): HostValidator =
      if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
      } else {
        HostValidator.Builder(applicationContext)
            .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
            .build()
      }

  override fun onCreateSession(): Session = MusonicCarSession()
}

private class MusonicCarSession : Session() {
  private var stopWaiting: () -> Unit = {}

  init {
    lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onCreate(owner: LifecycleOwner) {
        // The playback screen shows the player's session: hand it over as soon as it exists.
        stopWaiting = MusonicCarPlayer.withToken(carContext) { token ->
          (carContext.getCarService(CarContext.MEDIA_PLAYBACK_SERVICE) as MediaPlaybackManager)
              .registerMediaPlaybackToken(token)
        }
        MusonicAutoBridge.connected()
      }

      override fun onDestroy(owner: LifecycleOwner) {
        stopWaiting()
      }
    })
  }

  override fun onCreateScreen(intent: Intent): Screen = TabsScreen(carContext)
}

/** Ids of the lists in the snapshot (`autoTree.ts`). */
private object Nodes {
  const val ROOT = "root"
  const val PLAYLISTS = "playlists"
  const val DOWNLOADS = "downloads"
}

/** Pictures of the car screens: a cover served by [MusonicArtworkProvider], or an app icon. */
private fun CarContext.icon(res: Int): CarIcon = CarIcon.Builder(IconCompat.createWithResource(this, res)).build()

private fun CarContext.cover(entry: AutoEntry): CarIcon? {
  val key = entry.artKey ?: return null
  ICONS[key]?.let { return icon(it) }
  return CarIcon.Builder(IconCompat.createWithContentUri(MusonicArtwork.carUriOf(this, key))).build()
}

private val ICONS = mapOf(
    "icon:tab_playlists" to R.drawable.ic_auto_tab_playlists,
    "icon:tab_albums" to R.drawable.ic_auto_tab_albums,
    "icon:tab_artists" to R.drawable.ic_auto_tab_artists,
    "icon:tab_downloads" to R.drawable.ic_auto_tab_downloads,
)

private val MUSONIC_ORANGE = CarColor.createCustom(0xFFFF6B35.toInt(), 0xFFFF6B35.toInt())

/** How many items a list or a grid may hold on this car. */
private fun CarContext.limit(type: Int): Int =
    (getCarService(CarContext.CONSTRAINT_SERVICE) as ConstraintManager).getContentLimit(type)

/**
 * Opens the playback screen (reachable from every screen, Android Auto's rule). The car wants
 * floating buttons with an icon only and a background: Musonic's orange.
 */
private fun Screen.nowPlayingAction(): Action =
    Action.Builder()
        .setIcon(carContext.icon(R.drawable.ic_auto_play))
        .setBackgroundColor(MUSONIC_ORANGE)
        .setOnClickListener { screenManager.push(PlaybackScreen(carContext)) }
        .build()

/** Entries of a list, loaded once and kept; the screen is redrawn when they arrive. */
private class Loader(private val screen: Screen, private val nodeId: String) {
  var entries: List<AutoEntry>? = null
    private set

  fun load(): List<AutoEntry>? {
    if (entries == null && !requested) {
      requested = true
      MusonicAutoBridge.entries(screen.carContext, nodeId) {
        entries = it
        screen.invalidate()
      }
    }
    return entries
  }

  private var requested = false
}

/** What a tap on an entry does: open its list, or play the track (then the playback screen). */
private fun Screen.open(entry: AutoEntry) {
  if (entry.browsable) {
    screenManager.push(ListScreen(carContext, entry))
  } else {
    MusonicAutoBridge.play(entry.id)
    screenManager.push(PlaybackScreen(carContext))
  }
}

private fun Screen.gridSection(title: CharSequence?, entries: List<AutoEntry>): GridSection {
  val builder = GridSection.Builder().setItemSize(GridSection.ITEM_SIZE_LARGE)
  title?.let { builder.setTitle(it) }
  entries.take(carContext.limit(ConstraintManager.CONTENT_LIMIT_TYPE_GRID)).forEach { entry ->
    val item = GridItem.Builder().setTitle(entry.title).setOnClickListener { open(entry) }
    entry.subtitle?.takeIf { it.isNotEmpty() }?.let { item.setText(it) }
    item.setImage(carContext.cover(entry) ?: carContext.icon(R.drawable.ic_auto_tab_playlists), GridItem.IMAGE_TYPE_LARGE)
    builder.addItem(item.build())
  }
  return builder.build()
}

private fun Screen.rowSection(title: CharSequence?, entries: List<AutoEntry>): RowSection {
  val builder = RowSection.Builder()
  title?.let { builder.setTitle(it) }
  builder.setNoItemsMessage(carContext.getString(R.string.car_empty))
  entries.take(carContext.limit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST)).forEach { entry ->
    val row = Row.Builder().setTitle(entry.title).setOnClickListener { open(entry) }
    entry.subtitle?.takeIf { it.isNotEmpty() }?.let { row.addText(it) }
    carContext.cover(entry)?.let { row.setImage(it, Row.IMAGE_TYPE_LARGE) }
    if (entry.browsable) row.setBrowsable(true)
    builder.addItem(row.build())
  }
  return builder.build()
}

/** Home, Library and Downloaded, as in the mockups (ADR-025, steps 1-2). */
private class TabsScreen(context: CarContext) : Screen(context) {
  private var active = HOME
  private val root = Loader(this, Nodes.ROOT)
  private val playlists = Loader(this, Nodes.PLAYLISTS)
  private val downloads = Loader(this, Nodes.DOWNLOADS)

  override fun onGetTemplate(): Template {
    val tabs = TabTemplate.Builder(object : TabTemplate.TabCallback {
      override fun onTabSelected(tabContentId: String) {
        active = tabContentId
        invalidate()
      }
    }).setHeaderAction(Action.APP_ICON)
    tabs.addTab(tab(HOME, R.string.car_tab_home, R.drawable.ic_auto_tab_home))
    tabs.addTab(tab(LIBRARY, R.string.car_tab_library, R.drawable.ic_auto_tab_library))
    tabs.addTab(tab(DOWNLOADED, R.string.car_tab_downloads, R.drawable.ic_auto_tab_downloads))
    return tabs.setTabContents(TabContents.Builder(content()).build()).setActiveTabContentId(active).build()
  }

  private fun tab(id: String, title: Int, icon: Int): Tab =
      Tab.Builder().setContentId(id).setTitle(carContext.getString(title)).setIcon(carContext.icon(icon)).build()

  private fun content(): Template {
    val template = SectionedItemTemplate.Builder().addAction(nowPlayingAction())
    when (active) {
      HOME -> {
        val list = playlists.load() ?: return template.setLoading(true).build()
        val title = root.load()?.firstOrNull { it.id == Nodes.PLAYLISTS }?.title
        template.addSection(gridSection(title, list))
      }
      LIBRARY -> {
        val list = root.load() ?: return template.setLoading(true).build()
        template.addSection(rowSection(null, list.filter { it.id != Nodes.DOWNLOADS }))
      }
      else -> {
        val list = downloads.load() ?: return template.setLoading(true).build()
        template.addSection(rowSection(null, list))
      }
    }
    return template.build()
  }

  private companion object {
    const val HOME = "home"
    const val LIBRARY = "library"
    const val DOWNLOADED = "downloaded"
  }
}

/** A playlist, an album, an artist or a library list: big covers or rows, Play and Shuffle on top. */
private class ListScreen(context: CarContext, private val list: AutoEntry) : Screen(context) {
  private val loader = Loader(this, list.id)

  override fun onGetTemplate(): Template {
    val header = Header.Builder().setStartHeaderAction(Action.BACK).setTitle(list.title)
    if (list.actions?.contains("play") == true) {
      header.addEndHeaderAction(listAction("play", R.string.auto_action_play, R.drawable.ic_auto_play))
      header.addEndHeaderAction(listAction("shuffle", R.string.auto_action_shuffle, R.drawable.ic_auto_shuffle_off))
    }
    val template = SectionedItemTemplate.Builder().setHeader(header.build()).addAction(nowPlayingAction())
    val entries = loader.load() ?: return template.setLoading(true).build()
    val section = if (list.grid && entries.isNotEmpty()) gridSection(null, entries) else rowSection(null, entries)
    return template.addSection(section).build()
  }

  // Icons only, as the car's header buttons are (titles may be refused, like floating buttons).
  private fun listAction(action: String, @Suppress("UNUSED_PARAMETER") title: Int, icon: Int): Action =
      Action.Builder()
          .setIcon(carContext.icon(icon))
          .setOnClickListener {
            MusonicAutoBridge.browseAction(action, list.id)
            screenManager.push(PlaybackScreen(carContext))
          }
          .build()
}

/** Now playing: drawn by Android Auto from the player's session. */
private class PlaybackScreen(context: CarContext) : Screen(context) {
  override fun onGetTemplate(): Template =
      MediaPlaybackTemplate.Builder()
          .setHeader(
              Header.Builder()
                  .setStartHeaderAction(Action.BACK)
                  .setTitle(carContext.getString(R.string.car_now_playing))
                  .build(),
          )
          .build()
}
