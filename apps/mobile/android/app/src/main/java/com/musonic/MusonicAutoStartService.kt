package com.musonic

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Starts the player without a screen when Android Auto connects while Musonic is closed
 * (ADR-015): runs the `MusonicAutoStart` JS task, which sets the player up and restores the
 * queue. The player's session then reaches [MusonicAutoService] and the car shows Musonic.
 *
 * @author DoodzProg
 */
class MusonicAutoStartService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
      HeadlessJsTaskConfig("MusonicAutoStart", Arguments.createMap(), TIMEOUT_MS, true)

  private companion object {
    const val TIMEOUT_MS = 30_000L
  }
}
