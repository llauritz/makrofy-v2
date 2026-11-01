package com.goyaffle.app

import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.BridgeActivity
import com.goyaffle.app.healthconnect.HealthConnectPlugin

/**
 * The Capacitor shell around the web app (docs/adr/0012). Native code stays
 * thin: plugins are registered here, and the window is set up so the WebView
 * always sits between the status bar and the navigation bar (and above the
 * keyboard), with the bars painted in the app theme's colour by
 * [SystemChrome]. That is exactly how the installed PWA looks in Chrome, so
 * the web UI needs no Android-only safe-area handling.
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Local plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(SystemChromePlugin::class.java)
        registerPlugin(HealthConnectPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Draw behind the system bars on every API level (Android 15+ enforces
        // it anyway) and then pad the WebView back out of them ourselves.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        SystemChrome.makeBarsTransparent(window)

        val webView = bridge?.webView ?: return
        val root = webView.parent as? View ?: return
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            // Consumed: the WebView never sees insets, so env(safe-area-inset-*)
            // stays 0 and the web layout is the same as in a browser.
            WindowInsetsCompat.CONSUMED
        }

        // Paint the last theme the app reported (or the OS one on first launch)
        // before the web app has loaded, so the bars never flash a wrong colour.
        SystemChrome.applySaved(this, root, webView)
    }
}
