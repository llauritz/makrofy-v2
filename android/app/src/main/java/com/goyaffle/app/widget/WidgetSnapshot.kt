package com.goyaffle.app.widget

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import org.json.JSONObject
import java.time.LocalDate

/**
 * One Day's face, already summed, formatted and translated by the app
 * (src/native/widget-snapshot.ts). The widget never formats a number itself.
 */
data class WidgetFace(
    val fraction: Float,
    val consumed: String,
    val headline: String,
    val detail: String,
    val macros: List<Pair<String, String>>,
    val description: String,
)

/** The snapshot the app last handed over: today's face and an empty Day's. */
data class WidgetSnapshot(
    val day: String,
    val today: WidgetFace,
    val empty: WidgetFace,
    val kcalUnit: String,
    val addLabel: String,
) {
    /**
     * What to paint right now. Past the snapshot's Day (midnight, or a clock
     * change) a new Day starts at zero against the same Goal, until the app
     * writes a fresh snapshot.
     */
    fun faceFor(today: LocalDate): WidgetFace =
        if (day == today.toString()) this.today else empty

    companion object {
        private const val VERSION = 1

        /** Null for anything this build can't read, so the widget falls back to its placeholder. */
        fun parse(json: String?): WidgetSnapshot? {
            if (json.isNullOrEmpty()) return null
            return try {
                val o = JSONObject(json)
                if (o.optInt("version") != VERSION) return null
                WidgetSnapshot(
                    day = o.getString("day"),
                    today = face(o.getJSONObject("today")),
                    empty = face(o.getJSONObject("empty")),
                    kcalUnit = o.getString("kcalUnit"),
                    addLabel = o.getString("addLabel"),
                )
            } catch (e: Exception) {
                null
            }
        }

        private fun face(o: JSONObject): WidgetFace {
            val macros = o.getJSONArray("macros")
            return WidgetFace(
                fraction = o.getDouble("fraction").toFloat().coerceIn(0f, 1f),
                consumed = o.getString("consumed"),
                headline = o.getString("headline"),
                detail = o.getString("detail"),
                macros = (0 until macros.length()).map {
                    val m = macros.getJSONObject(it)
                    m.getString("letter") to m.getString("grams")
                },
                description = o.getString("description"),
            )
        }
    }
}

/**
 * Where the snapshot lives between app runs: one small SharedPreferences file,
 * shared by every placed widget. Besides the snapshot it keeps a clock stamp
 * that [WidgetClock] bumps at midnight, so a live widget session recomposes
 * (and re-checks the Day) even when the snapshot itself hasn't changed.
 */
object WidgetStore {
    private const val PREFS = "yaffle_widget"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_TICK = "tick"

    data class State(val snapshot: WidgetSnapshot?, val tick: Long)

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun read(context: Context): State {
        val p = prefs(context)
        return State(WidgetSnapshot.parse(p.getString(KEY_SNAPSHOT, null)), p.getLong(KEY_TICK, 0))
    }

    fun write(context: Context, json: String) {
        prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
    }

    /** Mark the clock as moved (midnight, time or zone change). */
    fun tick(context: Context) {
        prefs(context).edit().putLong(KEY_TICK, System.currentTimeMillis()).apply()
    }

    /** The current state, then every change to it, for as long as it's collected. */
    fun changes(context: Context): Flow<State> = callbackFlow {
        val p = prefs(context)
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
            trySend(read(context))
        }
        p.registerOnSharedPreferenceChangeListener(listener)
        trySend(read(context))
        awaitClose { p.unregisterOnSharedPreferenceChangeListener(listener) }
    }.conflate()
}
