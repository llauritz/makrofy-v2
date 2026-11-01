package com.goyaffle.app.widget

import android.content.Intent
import android.view.inputmethod.InputMethodManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The app's side of the home screen widget (src/native/widget.ts): stores the
 * snapshot the web app builds and repaints the widget, and tells the web app
 * when a widget tap opened it.
 */
@CapacitorPlugin(name = "YaffleWidget")
class YaffleWidgetPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun load() {
        // A tap that cold-started the app. Retained until the web app subscribes.
        activity?.intent?.let { takeWidgetAction(it) }
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        takeWidgetAction(intent)
    }

    private fun takeWidgetAction(intent: Intent) {
        val action = intent.getStringExtra(WidgetActions.EXTRA) ?: return
        // Consumed once: neither a recreated activity nor a relaunch from
        // Recents replays the tap.
        intent.removeExtra(WidgetActions.EXTRA)
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return
        notifyListeners("widgetAction", JSObject().put("action", action), true)
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val snapshot = call.getString("snapshot")
        if (snapshot == null) {
            call.reject("Missing snapshot")
            return
        }
        val app = context.applicationContext
        WidgetStore.write(app, snapshot)
        call.resolve()
        scope.launch {
            YaffleWidget.updateEverywhere(app)
            if (YaffleWidget.anyPlaced(app)) WidgetClock.scheduleMidnight(app)
        }
    }

    @PluginMethod
    fun showKeyboard(call: PluginCall) {
        val webView = bridge.webView
        webView.post {
            webView.requestFocus()
            context.getSystemService(InputMethodManager::class.java)
                ?.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
            call.resolve()
        }
    }
}
