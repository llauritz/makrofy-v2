package com.goyaffle.app.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.unit.ColorProvider
import com.goyaffle.app.R
import java.time.LocalDate

/**
 * The home screen widget: today's ring and totals in the app's own look,
 * opening the app on today when tapped, or ready to type from its "+".
 *
 * It paints only what the app last stored ([WidgetStore]); it never reads
 * Firestore or the network. Past midnight it shows the new Day empty until
 * the app runs again ([WidgetSnapshot.faceFor], [WidgetClock]).
 *
 * Two picker entries share this face, a 2×2 ring and a 4×2 summary card.
 * Both are resizable, and the layout follows the real size.
 */
abstract class YaffleWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val renderer = WidgetRenderer(context)
        val initial = WidgetStore.read(context)
        provideContent {
            val state by remember { WidgetStore.changes(context) }.collectAsState(initial)
            WidgetContent(renderer, state)
        }
    }

    companion object {
        /** Repaint every placed widget, of either size. */
        suspend fun updateEverywhere(context: Context) {
            SmallYaffleWidget().updateAll(context)
            WideYaffleWidget().updateAll(context)
        }

        /** Whether any Yaffle widget is on a home screen. */
        suspend fun anyPlaced(context: Context): Boolean {
            val manager = GlanceAppWidgetManager(context)
            return manager.getGlanceIds(SmallYaffleWidget::class.java).isNotEmpty() ||
                manager.getGlanceIds(WideYaffleWidget::class.java).isNotEmpty()
        }
    }
}

class SmallYaffleWidget : YaffleWidget()

class WideYaffleWidget : YaffleWidget()

@Composable
private fun WidgetContent(renderer: WidgetRenderer, state: WidgetStore.State) {
    val context = LocalContext.current
    val size = LocalSize.current
    val density = context.resources.displayMetrics.density
    val snapshot = state.snapshot
    // Read on every composition: a midnight tick recomposes, and the Day is decided here.
    val face = snapshot?.faceFor(LocalDate.now())
    val placeholder = context.getString(R.string.widget_placeholder)
    val picture = renderer.render(
        size.width.value,
        size.height.value,
        density,
        face,
        snapshot?.kcalUnit.orEmpty(),
        placeholder,
    )
    val description = face?.description ?: placeholder
    val addLabel = snapshot?.addLabel ?: context.getString(R.string.widget_add)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ImageProvider(R.drawable.widget_card))
            .clickable(openApp(context, WidgetActions.TODAY))
            .semantics { contentDescription = description },
    ) {
        // One child per Ink plus the button: within Glance's ten-child limit for a Box.
        for (layer in picture.layers) {
            Box(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .padding(start = (layer.left / density).dp, top = (layer.top / density).dp),
            ) {
                Image(
                    provider = ImageProvider(layer.mask),
                    contentDescription = null,
                    contentScale = ContentScale.FillBounds,
                    colorFilter = ColorFilter.tint(ColorProvider(layer.ink.color)),
                    modifier = GlanceModifier.size(
                        (layer.mask.width / density).dp,
                        (layer.mask.height / density).dp,
                    ),
                )
            }
        }
        val button = picture.addButton
        Box(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(start = button.left.dp, top = button.top.dp),
        ) {
            Image(
                provider = ImageProvider(R.drawable.widget_add_button),
                contentDescription = addLabel,
                contentScale = ContentScale.Fit,
                modifier = GlanceModifier
                    .size(button.width().dp, button.height().dp)
                    .clickable(openApp(context, WidgetActions.ADD)),
            )
        }
    }
}

/** What a widget tap asks the app to do; read by [com.goyaffle.app.widget.YaffleWidgetPlugin]. */
object WidgetActions {
    const val EXTRA = "com.goyaffle.app.widget.ACTION"
    const val TODAY = "today"
    const val ADD = "add"
}

/**
 * Bring the app forward with a widget action. Each action gets its own intent
 * action string, so the two taps never collapse into one PendingIntent.
 */
private fun openApp(context: Context, action: String): Action {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val intent = Intent("${context.packageName}.widget.${action.uppercase()}").apply {
        component = launch?.component ?: ComponentName(context, "${context.packageName}.MainActivity")
        putExtra(WidgetActions.EXTRA, action)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return actionStartActivity(intent)
}

/** Picker entry: the 2×2 ring. */
class SmallYaffleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SmallYaffleWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetClock.scheduleMidnight(context)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: android.appwidget.AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetClock.scheduleMidnight(context)
    }
}

/** Picker entry: the 4×2 summary card. */
class WideYaffleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WideYaffleWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetClock.scheduleMidnight(context)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: android.appwidget.AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetClock.scheduleMidnight(context)
    }
}
