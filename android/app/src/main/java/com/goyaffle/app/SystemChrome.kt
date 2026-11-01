package com.goyaffle.app

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.Window
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Paints the status bar and navigation bar in the web app's theme colour and
 * picks light or dark bar icons to match. The web side calls it whenever the
 * resolved theme changes (src/native/chrome.ts); the last value is kept so the
 * next launch starts in the right colours before any JavaScript runs.
 */
object SystemChrome {
    private const val PREFS = "yaffle_system_chrome"
    private const val KEY_COLOR = "color"
    private const val KEY_DARK = "dark"

    @Suppress("DEPRECATION")
    fun makeBarsTransparent(window: Window) {
        // Deprecated (and ignored) on Android 15+, where bars are always
        // transparent; needed below that so the root's colour shows through.
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // No grey scrim behind three-button navigation: the bar should be
            // exactly the app's background, as in Chrome.
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
    }

    fun applySaved(activity: Activity, root: View, webView: View) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val systemDark =
            (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES
        val color = if (prefs.contains(KEY_COLOR)) {
            prefs.getInt(KEY_COLOR, 0)
        } else {
            ContextCompat.getColor(activity, R.color.yaffle_background)
        }
        val dark = prefs.getBoolean(KEY_DARK, systemDark)
        apply(activity, root, webView, color, dark)
    }

    fun apply(activity: Activity, root: View, webView: View, color: Int, dark: Boolean) {
        root.setBackgroundColor(color)
        // The WebView's own background shows for a frame before the page paints.
        webView.setBackgroundColor(color)
        activity.window.decorView.setBackgroundColor(color)
        val controller = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
    }

    fun save(context: Context, color: Int, dark: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_COLOR, color)
            .putBoolean(KEY_DARK, dark)
            .apply()
    }
}

@CapacitorPlugin(name = "SystemChrome")
class SystemChromePlugin : Plugin() {

    /** `setTheme({ color: "#rrggbb", dark: boolean })` */
    @PluginMethod
    fun setTheme(call: PluginCall) {
        val color = call.getString("color")?.let { runCatching { Color.parseColor(it) }.getOrNull() }
        if (color == null) {
            call.reject("color must be a #rrggbb string")
            return
        }
        val dark = call.getBoolean("dark", false) ?: false
        val webView = bridge.webView
        val root = webView.parent as? View
        activity.runOnUiThread {
            if (root != null) SystemChrome.apply(activity, root, webView, color, dark)
            SystemChrome.save(context, color, dark)
            call.resolve()
        }
    }
}
