package com.musonic

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers [MusonicAutoModule] (Android Auto browsing) and [MusonicPlayerModule] (native player, ADR-022).
 *
 * @author DoodzProg
 */
class MusonicAutoPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
      listOf(MusonicAutoModule(context), MusonicPlayerModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
