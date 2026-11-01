package com.goyaffle.app

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

/**
 * Hands the wallpaper's tonal palettes ("Material You", Android 12+) to the
 * web app, which maps them onto its colour tokens (src/lib/material-you.ts).
 *
 * The palette is injected as `window.__yaffleMaterialYou` before the page's
 * first script runs, so launch paints straight into the wallpaper colours with
 * no async round-trip and no flash. Changing the wallpaper recreates the
 * activity, which rebuilds the bridge and injects the new palette.
 */
object MaterialYou {
    // Android's ramps, tone 100 (white) down to tone 0 (black).
    @RequiresApi(Build.VERSION_CODES.S)
    private fun ramps() = mapOf(
        "accent1" to intArrayOf(
            android.R.color.system_accent1_0,
            android.R.color.system_accent1_10,
            android.R.color.system_accent1_50,
            android.R.color.system_accent1_100,
            android.R.color.system_accent1_200,
            android.R.color.system_accent1_300,
            android.R.color.system_accent1_400,
            android.R.color.system_accent1_500,
            android.R.color.system_accent1_600,
            android.R.color.system_accent1_700,
            android.R.color.system_accent1_800,
            android.R.color.system_accent1_900,
            android.R.color.system_accent1_1000,
        ),
        "neutral1" to intArrayOf(
            android.R.color.system_neutral1_0,
            android.R.color.system_neutral1_10,
            android.R.color.system_neutral1_50,
            android.R.color.system_neutral1_100,
            android.R.color.system_neutral1_200,
            android.R.color.system_neutral1_300,
            android.R.color.system_neutral1_400,
            android.R.color.system_neutral1_500,
            android.R.color.system_neutral1_600,
            android.R.color.system_neutral1_700,
            android.R.color.system_neutral1_800,
            android.R.color.system_neutral1_900,
            android.R.color.system_neutral1_1000,
        ),
        "neutral2" to intArrayOf(
            android.R.color.system_neutral2_0,
            android.R.color.system_neutral2_10,
            android.R.color.system_neutral2_50,
            android.R.color.system_neutral2_100,
            android.R.color.system_neutral2_200,
            android.R.color.system_neutral2_300,
            android.R.color.system_neutral2_400,
            android.R.color.system_neutral2_500,
            android.R.color.system_neutral2_600,
            android.R.color.system_neutral2_700,
            android.R.color.system_neutral2_800,
            android.R.color.system_neutral2_900,
            android.R.color.system_neutral2_1000,
        ),
    )

    /** The three ramps the web app uses, as #rrggbb strings; null below Android 12. */
    fun palette(context: Context): JSONObject? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val out = JSONObject()
        for ((name, ids) in ramps()) {
            val ramp = JSONArray()
            for (id in ids) ramp.put(String.format("#%06x", context.getColor(id) and 0xFFFFFF))
            out.put(name, ramp)
        }
        return out
    }
}

@CapacitorPlugin(name = "MaterialYou")
class MaterialYouPlugin : Plugin() {

    // Runs while Capacitor builds the bridge, before it loads the page.
    override fun load() {
        val palette = MaterialYou.palette(context) ?: return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        val origin = Uri.parse(bridge.appUrl).buildUpon()
            .path(null).fragment(null).clearQuery().build().toString()
        try {
            WebViewCompat.addDocumentStartJavaScript(
                bridge.webView,
                "window.__yaffleMaterialYou=$palette;",
                setOf(origin),
            )
        } catch (e: IllegalArgumentException) {
            // The web app falls back to getPalette() over the bridge.
            Logger.warn("MaterialYou", "Could not inject the palette early: ${e.message}")
        }
    }

    /** `getPalette()` → `{ palette }`, or `{}` below Android 12. */
    @PluginMethod
    fun getPalette(call: PluginCall) {
        val result = JSObject()
        MaterialYou.palette(context)?.let { result.put("palette", it) }
        call.resolve(result)
    }
}
