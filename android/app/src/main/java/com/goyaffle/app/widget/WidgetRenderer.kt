package com.goyaffle.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.annotation.ColorRes
import androidx.core.content.res.ResourcesCompat
import com.goyaffle.app.R
import java.nio.ByteBuffer
import java.util.EnumMap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The colours the widget paints with, in stacking order. Each is a colour
 * resource with a night variant, so the launcher re-tints the widget when the
 * phone switches between light and dark without the app having to redraw.
 */
enum class Ink(@ColorRes val color: Int) {
    INPUT(R.color.widget_input),
    BORDER(R.color.widget_border),
    TRACK(R.color.widget_ring_track),
    INK(R.color.widget_ink),
    MUTED(R.color.widget_muted),
    MACRO_P(R.color.widget_macro_p),
    MACRO_F(R.color.widget_macro_f),
    MACRO_C(R.color.widget_macro_c),
}

/** One colour's shapes: an alpha mask, placed in pixels from the widget's top-left. */
class InkLayer(val ink: Ink, val mask: Bitmap, val left: Int, val top: Int)

/** A rendered widget face: its layers, plus where the "+" button goes (in dp). */
class WidgetPicture(val layers: List<InkLayer>, val addButton: RectF)

/**
 * Draws the widget's face in the app's own type and geometry. Widgets can't
 * use custom fonts, so the face is drawn to bitmaps with the bundled brand
 * fonts (res/font: static, Latin-subset cuts of the app's Public Sans, Nunito
 * and Fraunces) — one alpha mask per [Ink], tinted by the launcher.
 *
 * Every measurement is SummaryCard's, in CSS px (= dp), laid out at the card's
 * natural size and then scaled as a whole to fit the widget, so it keeps the
 * app's proportions at any size.
 */
class WidgetRenderer(context: Context) {
    private val regular = font(context, R.font.public_sans_regular)
    private val medium = font(context, R.font.public_sans_medium)
    private val bold = font(context, R.font.public_sans_bold)
    private val macro = font(context, R.font.nunito_black)
    private val wordmark = font(context, R.font.fraunces_semibold)

    fun render(
        widthDp: Float,
        heightDp: Float,
        density: Float,
        face: WidgetFace?,
        kcalUnit: String,
        placeholder: String,
    ): WidgetPicture = when {
        face == null -> renderPlaceholder(widthDp, heightDp, density, placeholder)
        widthDp >= WIDE_MIN_WIDTH && widthDp >= heightDp * WIDE_ASPECT ->
            renderWide(widthDp, heightDp, density, face, kcalUnit)
        else -> renderSmall(widthDp, heightDp, density, face, kcalUnit)
    }

    // ── 4×2: the summary card ────────────────────────────────────────────

    private fun renderWide(w: Float, h: Float, density: Float, face: WidgetFace, kcalUnit: String): WidgetPicture {
        val headline = textPaint(bold, 18f)
        val detail = textPaint(regular, 12f, tabular = true)
        val capsule = Capsule(face.macros)

        // Natural size: the card at its in-app proportions.
        val headRow = max(headline.measureText(face.headline), detail.measureText(face.detail)) + BUTTON_GAP + BUTTON
        val textWidth = max(max(capsule.width, headRow), MIN_TEXT_WIDTH)
        val naturalW = PAD + RING + GAP + textWidth + PAD
        val naturalH = PAD + RING + PAD
        val f = min(MAX_SCALE, min(w / naturalW, h / naturalH))
        val vw = w / f
        val vh = h / f

        val canvas = InkCanvas(w, h, density, f)
        drawRing(canvas, PAD, (vh - RING) / 2, face, kcalUnit)

        // The text column: headline row (with the button), hairline, capsule.
        val x0 = PAD + RING + GAP
        val x1 = vw - PAD
        val headRowH = HEADLINE_LINE + 2f + DETAIL_LINE
        val top = (vh - (headRowH + 10f + 1f + 10f + CAPSULE_HEIGHT)) / 2
        val headMax = x1 - x0 - BUTTON_GAP - BUTTON
        drawLine(canvas.on(Ink.INK), fit(headline, face.headline, headMax), x0, top, HEADLINE_LINE, headline)
        drawLine(canvas.on(Ink.MUTED), fit(detail, face.detail, headMax), x0, top + HEADLINE_LINE + 2f, DETAIL_LINE, detail)
        val rule = top + headRowH + 10f
        canvas.on(Ink.BORDER).drawRect(x0, rule, x1, rule + 1f, fill)
        capsule.draw(canvas, x0, rule + 1f + 10f)

        return canvas.picture(RectF(x1 - BUTTON, top, x1, top + BUTTON).scaled(f))
    }

    // ── 2×2: the ring, with the headline and "+" beneath ─────────────────

    private fun renderSmall(w: Float, h: Float, density: Float, face: WidgetFace, kcalUnit: String): WidgetPicture {
        val headline = textPaint(bold, 14f)
        val naturalW = SMALL_PAD + RING + SMALL_PAD
        val naturalH = SMALL_PAD + RING + SMALL_GAP + SMALL_BUTTON + SMALL_PAD
        val f = min(MAX_SCALE, min(w / naturalW, h / naturalH))
        val vw = w / f
        val vh = h / f

        val canvas = InkCanvas(w, h, density, f)
        val top = (vh - (naturalH - 2 * SMALL_PAD)) / 2
        drawRing(canvas, (vw - RING) / 2, top, face, kcalUnit)

        // Bottom row: headline on the left, the button on the right.
        val rowTop = top + RING + SMALL_GAP
        val buttonLeft = vw - SMALL_PAD - SMALL_BUTTON
        val textMax = buttonLeft - SMALL_GAP - SMALL_PAD
        val lineTop = rowTop + (SMALL_BUTTON - SMALL_LINE) / 2
        drawLine(canvas.on(Ink.INK), fit(headline, face.headline, textMax), SMALL_PAD, lineTop, SMALL_LINE, headline)

        return canvas.picture(RectF(buttonLeft, rowTop, buttonLeft + SMALL_BUTTON, rowTop + SMALL_BUTTON).scaled(f))
    }

    // ── Before the app has ever run: the splash's wordmark ───────────────

    private fun renderPlaceholder(w: Float, h: Float, density: Float, text: String): WidgetPicture {
        val mark = textPaint(wordmark, 30f)
        val line = textPaint(regular, 12f)
        val markLine = 36f
        val naturalW = max(mark.measureText("Yaffle"), line.measureText(text)) + 2 * PAD
        val naturalH = PAD + markLine + 2f + DETAIL_LINE + SMALL_GAP + SMALL_BUTTON + SMALL_PAD
        val f = min(1f, min(w / naturalW, h / naturalH))
        val vw = w / f
        val vh = h / f

        val canvas = InkCanvas(w, h, density, f)
        val top = (vh - (markLine + 2f + DETAIL_LINE)) / 2 - (SMALL_BUTTON + SMALL_GAP) / 2
        val muted = canvas.on(Ink.MUTED)
        drawLine(muted, "Yaffle", (vw - mark.measureText("Yaffle")) / 2, top, markLine, mark)
        val shown = fit(line, text, vw - 2 * PAD)
        drawLine(muted, shown, (vw - line.measureText(shown)) / 2, top + markLine + 2f, DETAIL_LINE, line)

        val left = vw - SMALL_PAD - SMALL_BUTTON
        val buttonTop = vh - SMALL_PAD - SMALL_BUTTON
        return canvas.picture(RectF(left, buttonTop, left + SMALL_BUTTON, buttonTop + SMALL_BUTTON).scaled(f))
    }

    // ── Shared pieces ────────────────────────────────────────────────────

    /** SummaryCard's ProgressRing: 116 box, r 46, 11 stroke from 12 o'clock, kcal centred. */
    private fun drawRing(canvas: InkCanvas, left: Float, top: Float, face: WidgetFace, kcalUnit: String) {
        val cx = left + RING / 2
        val cy = top + RING / 2
        canvas.on(Ink.TRACK).drawCircle(cx, cy, RING_RADIUS, stroke)
        if (face.fraction > 0f) {
            val oval = RectF(cx - RING_RADIUS, cy - RING_RADIUS, cx + RING_RADIUS, cy + RING_RADIUS)
            canvas.on(Ink.INK).drawArc(oval, -90f, 360f * face.fraction, false, stroke)
        }
        // The figure (text-xl, leading-none) over the unit (10px, mt-0.5).
        val figure = textPaint(bold, 20f)
        val unit = textPaint(regular, 10f)
        val unitLine = 15f
        val blockTop = cy - (20f + 2f + unitLine) / 2
        val inner = 2 * (RING_RADIUS - RING_STROKE / 2) - 8f
        val shown = fit(figure, face.consumed, inner)
        drawLine(canvas.on(Ink.INK), shown, cx - figure.measureText(shown) / 2, blockTop, 20f, figure)
        drawLine(canvas.on(Ink.MUTED), kcalUnit, cx - unit.measureText(kcalUnit) / 2, blockTop + 22f, unitLine, unit)
    }

    /**
     * The macro capsule: one neutral pill (bg-input, p-1) holding letter +
     * grams per macro (px-2.5, gap-1) with hairline dividers between.
     */
    private inner class Capsule(private val macros: List<Pair<String, String>>) {
        private val letter = textPaint(macro, 15f)
        private val grams = textPaint(medium, 12f, tabular = true)

        val width: Float = 8f + macros.sumOf { (l, g) ->
            (20f + letter.measureText(l) + 4f + grams.measureText(g)).toDouble()
        }.toFloat() + (macros.size - 1).coerceAtLeast(0)

        fun draw(canvas: InkCanvas, left: Float, top: Float) {
            val r = CAPSULE_HEIGHT / 2
            canvas.on(Ink.INPUT).drawRoundRect(left, top, left + width, top + CAPSULE_HEIGHT, r, r, fill)
            val lineTop = top + 4f
            val baseline = baselineIn(grams, lineTop, 16f)
            var x = left + 4f
            macros.forEachIndexed { i, (l, g) ->
                if (i > 0) {
                    canvas.on(Ink.BORDER).drawRect(x, lineTop + 2f, x + 1f, lineTop + 14f, fill)
                    x += 1f
                }
                x += 10f
                // MacroLetter beside grams: on the grams' baseline, 1px down
                // then 1/3px back up.
                canvas.on(letterInk(i)).drawText(l, x, baseline + 0.67f, letter)
                x += letter.measureText(l) + 4f
                canvas.on(Ink.INK).drawText(g, x, baseline, grams)
                x += grams.measureText(g) + 10f
            }
        }

        private fun letterInk(i: Int) = when (i) {
            0 -> Ink.MACRO_P
            1 -> Ink.MACRO_F
            else -> Ink.MACRO_C
        }
    }

    companion object {
        // SummaryCard, in CSS px.
        private const val PAD = 16f
        private const val GAP = 16f
        private const val RING = 116f
        private const val RING_RADIUS = 46f
        private const val RING_STROKE = 11f
        private const val BUTTON = 32f
        private const val BUTTON_GAP = 8f
        private const val HEADLINE_LINE = 22.5f // text-lg, leading-tight
        private const val DETAIL_LINE = 16f // text-xs
        private const val CAPSULE_HEIGHT = 24f // p-1 around a text-xs line
        private const val MIN_TEXT_WIDTH = 120f

        // The 2×2 layout.
        private const val SMALL_PAD = 12f
        private const val SMALL_GAP = 8f
        private const val SMALL_BUTTON = 28f
        private const val SMALL_LINE = 18f

        // Widgets past this width and aspect get the summary card layout.
        private const val WIDE_MIN_WIDTH = 200f
        private const val WIDE_ASPECT = 1.6f

        // Big widgets grow the face a little, then just get more air.
        private const val MAX_SCALE = 1.15f

        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.BLACK
        }
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = RING_STROKE
            strokeCap = Paint.Cap.ROUND
            color = Color.BLACK
        }

        private fun font(context: Context, id: Int): Typeface =
            ResourcesCompat.getFont(context, id) ?: Typeface.DEFAULT

        private fun textPaint(typeface: Typeface, size: Float, tabular: Boolean = false) =
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
                this.typeface = typeface
                textSize = size
                color = Color.BLACK
                if (tabular) fontFeatureSettings = "'tnum'"
            }

        /** The baseline of a CSS line box: the font's ascent+descent centred in it. */
        private fun baselineIn(paint: Paint, top: Float, lineHeight: Float): Float {
            val m = paint.fontMetrics
            return top + (lineHeight - (m.descent - m.ascent)) / 2 - m.ascent
        }

        private fun drawLine(canvas: Canvas, text: String, left: Float, top: Float, lineHeight: Float, paint: Paint) {
            canvas.drawText(text, left, baselineIn(paint, top, lineHeight), paint)
        }

        /**
         * Make `text` fit `maxWidth`: first by setting it a little smaller
         * (down to 80%, mutating the paint), then by ending it in an ellipsis.
         */
        private fun fit(paint: Paint, text: String, maxWidth: Float): String {
            val natural = paint.measureText(text)
            if (natural <= maxWidth) return text
            paint.textSize *= max(0.8f, maxWidth / natural)
            if (paint.measureText(text) <= maxWidth) return text
            var end = text.length
            while (end > 1 && paint.measureText(text.substring(0, end) + "…") > maxWidth) end--
            return text.substring(0, end).trimEnd() + "…"
        }

        private fun RectF.scaled(f: Float) = RectF(left * f, top * f, right * f, bottom * f)
    }
}

/**
 * One full-size alpha canvas per [Ink], drawn in layout units (CSS px at
 * scale 1) and handed back cropped to what was drawn, so the widget only
 * carries the pixels it shows.
 */
internal class InkCanvas(widthDp: Float, heightDp: Float, private val density: Float, scale: Float) {
    private val widthPx = max(1, (widthDp * density).roundToInt())
    private val heightPx = max(1, (heightDp * density).roundToInt())
    private val pixelScale = scale * density
    private val masks = EnumMap<Ink, Bitmap>(Ink::class.java)
    private val canvases = EnumMap<Ink, Canvas>(Ink::class.java)

    fun on(ink: Ink): Canvas = canvases.getOrPut(ink) {
        val mask = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ALPHA_8)
        masks[ink] = mask
        Canvas(mask).apply { scale(pixelScale, pixelScale) }
    }

    fun picture(addButton: RectF): WidgetPicture =
        WidgetPicture(Ink.entries.mapNotNull { ink -> masks[ink]?.let { crop(ink, it) } }, addButton)

    private fun crop(ink: Ink, mask: Bitmap): InkLayer? {
        val stride = mask.rowBytes
        val pixels = ByteBuffer.allocate(stride * mask.height).also { mask.copyPixelsToBuffer(it) }.array()
        var minX = mask.width
        var minY = mask.height
        var maxX = -1
        var maxY = -1
        for (y in 0 until mask.height) {
            val row = y * stride
            for (x in 0 until mask.width) {
                if (pixels[row + x].toInt() != 0) {
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    maxY = y
                }
            }
        }
        if (maxX < 0) {
            mask.recycle()
            return null
        }
        val cropped = Bitmap.createBitmap(mask, minX, minY, maxX - minX + 1, maxY - minY + 1)
        if (cropped !== mask) mask.recycle()
        return InkLayer(ink, cropped, minX, minY)
    }
}
