package com.goyaffle.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

/**
 * Turns the widget over to the new Day at midnight, so it never shows
 * yesterday's totals as today's. An inexact alarm just after local midnight
 * (no exact-alarm permission; a few minutes' slack is fine for a glance)
 * bumps [WidgetStore]'s clock stamp and repaints; the widget then decides the
 * Day itself. A reboot, an app update, or a time or time zone change clears
 * or skews the alarm, so those reschedule it and repaint too.
 */
object WidgetClock {
    private const val WINDOW_MS = 10 * 60 * 1000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun scheduleMidnight(context: Context) {
        val zone = ZoneId.systemDefault()
        val midnight = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        // A second past midnight, so the alarm never lands on the old Day.
        alarms.setWindow(AlarmManager.RTC, midnight + 1000, WINDOW_MS, pendingIntent(context))
    }

    /** The clock moved: repaint, then arm the next midnight if any widget is still placed. */
    fun onClockChanged(context: Context, done: () -> Unit = {}) {
        val app = context.applicationContext
        scope.launch {
            try {
                WidgetStore.tick(app)
                YaffleWidget.updateEverywhere(app)
                if (YaffleWidget.anyPlaced(app)) scheduleMidnight(app)
            } finally {
                done()
            }
        }
    }

    private fun pendingIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, WidgetClockReceiver::class.java).setAction(ACTION_MIDNIGHT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    const val ACTION_MIDNIGHT = "com.goyaffle.app.widget.MIDNIGHT"
}

/** Midnight, boot, app update, and time or zone changes all land here. */
class WidgetClockReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            WidgetClock.ACTION_MIDNIGHT,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> {
                val pending = goAsync()
                WidgetClock.onClockChanged(context) { pending.finish() }
            }
        }
    }
}
