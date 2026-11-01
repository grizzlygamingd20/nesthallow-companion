package com.grove.nesthallow.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import com.grove.nesthallow.Phase
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private val WingUpper = Color(0xFF8FB996)
private val WingLower = Color(0xFF5E8C6A)
private val WingSpot = Color(0xFFE9D9A6)
private val Body = Color(0xFF7A4B2A)
private val Face = Color(0xFFF5E9C9)
private val Eye = Color(0xFF2B1D14)
private val Brass = Color(0xFFC9A94E)
private val Blush = Color(0xFFE8A0A0)

/** Nesthallow, drawn as a small moth. Her expression follows the conversation phase. */
@Composable
fun NesthallowFace(phase: Phase, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "moth")

    // Blink every ~4 s.
    val eyeOpen by t.animateFloat(
        initialValue = 1f, targetValue = 1f,
        animationSpec = infiniteRepeatable(keyframes {
            durationMillis = 4200
            1f at 0; 1f at 3900; 0.08f at 4000; 1f at 4150
        }), label = "blink"
    )
    // Gentle wing breathing and antenna sway.
    val breathe by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val sway by t.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(3000, easing = LinearEasing)), label = "sway")
    // Mouth flap while speaking, dots while thinking.
    val flap by t.animateFloat(0f, 1f, infiniteRepeatable(tween(170, easing = LinearEasing), RepeatMode.Reverse), label = "flap")
    val dots by t.animateFloat(0f, 3f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "dots")

    val listen by animateFloatAsState(if (phase == Phase.Listening) 1f else 0f, tween(250), label = "listen")
    val think by animateFloatAsState(if (phase == Phase.Thinking) 1f else 0f, tween(300), label = "think")
    val speak by animateFloatAsState(if (phase == Phase.Speaking) 1f else 0f, tween(200), label = "speak")
    val worry by animateFloatAsState(if (phase == Phase.Error) 1f else 0f, tween(300), label = "worry")

    Canvas(modifier) {
        val s = min(size.width, size.height)
        val c = Offset(size.width / 2, size.height / 2)
        val faceR = s * 0.17f

        // Soft glow, brighter while listening.
        drawCircle(
            Brush.radialGradient(
                listOf(Color(0xFFB8E0B0).copy(alpha = 0.18f + 0.25f * listen), Color.Transparent),
                center = c, radius = s * 0.5f
            ),
            radius = s * 0.5f, center = c
        )

        // Wings: flutter faster and wider while listening or speaking.
        val lift = 4f + 6f * breathe + 8f * listen + 5f * speak * flap
        wing(c, s, upper = true, left = true, lift = lift)
        wing(c, s, upper = true, left = false, lift = lift)
        wing(c, s, upper = false, left = true, lift = lift * 0.6f)
        wing(c, s, upper = false, left = false, lift = lift * 0.6f)

        // Body under the face.
        drawOval(Body, topLeft = Offset(c.x - s * 0.06f, c.y), size = Size(s * 0.12f, s * 0.30f))

        // Antennae: perk up when listening, droop when worried.
        val perk = 0.10f * listen - 0.12f * worry
        antenna(c, faceR, s, side = -1f, swing = sin(sway) * 0.05f + perk)
        antenna(c, faceR, s, side = 1f, swing = -sin(sway) * 0.05f + perk)

        // Face.
        drawCircle(Face, radius = faceR, center = c)
        drawCircle(Blush.copy(alpha = 0.45f), radius = faceR * 0.16f, center = Offset(c.x - faceR * 0.55f, c.y + faceR * 0.25f))
        drawCircle(Blush.copy(alpha = 0.45f), radius = faceR * 0.16f, center = Offset(c.x + faceR * 0.55f, c.y + faceR * 0.25f))

        // Eyes: wider when listening, glancing up when thinking.
        val eyeR = faceR * (0.20f + 0.05f * listen)
        val look = Offset(faceR * 0.06f * think, -faceR * 0.10f * think)
        for (side in listOf(-1f, 1f)) {
            val ec = Offset(c.x + side * faceR * 0.38f, c.y - faceR * 0.08f)
            val h = eyeR * 2 * eyeOpen
            drawOval(Eye, topLeft = Offset(ec.x - eyeR, ec.y - h / 2), size = Size(eyeR * 2, h))
            if (eyeOpen > 0.5f) {
                drawCircle(Color.White, radius = eyeR * 0.32f, center = ec + Offset(eyeR * 0.30f, -eyeR * 0.35f) + look)
            }
            // Worried brows.
            if (worry > 0.01f) {
                val by = ec.y - eyeR * 1.6f
                drawLine(
                    Eye.copy(alpha = worry), Offset(ec.x - side * eyeR * 0.9f, by - eyeR * 0.1f),
                    Offset(ec.x + side * eyeR * 0.9f, by - eyeR * 0.6f), strokeWidth = faceR * 0.05f, cap = StrokeCap.Round
                )
            }
        }

        // Mouth: a small smile, an open "o" while speaking, a wobble when worried.
        val mouthY = c.y + faceR * 0.42f
        if (speak > 0.05f) {
            val mh = faceR * (0.06f + 0.16f * flap) * speak
            drawOval(Eye, topLeft = Offset(c.x - faceR * 0.12f, mouthY - mh / 2), size = Size(faceR * 0.24f, mh + 1f))
        } else {
            val smile = 1f - 2f * worry
            val p = Path().apply {
                moveTo(c.x - faceR * 0.16f, mouthY)
                quadraticBezierTo(c.x, mouthY + faceR * 0.14f * smile, c.x + faceR * 0.16f, mouthY)
            }
            drawPath(p, Eye, style = Stroke(width = faceR * 0.05f, cap = StrokeCap.Round))
        }

        // Thinking dots.
        if (think > 0.05f) {
            for (i in 0..2) {
                val on = if (dots.toInt() == i) 1f else 0.35f
                drawCircle(
                    Brass.copy(alpha = on * think), radius = faceR * 0.07f,
                    center = Offset(c.x + faceR * (0.9f + 0.25f * i), c.y - faceR * (1.15f + 0.2f * i))
                )
            }
        }
    }
}

private fun DrawScope.wing(c: Offset, s: Float, upper: Boolean, left: Boolean, lift: Float) {
    val dir = if (left) -1f else 1f
    val w = if (upper) s * 0.36f else s * 0.24f
    val h = if (upper) s * 0.26f else s * 0.20f
    val cx = c.x + dir * (if (upper) s * 0.19f else s * 0.13f)
    val cy = c.y + (if (upper) -s * 0.04f else s * 0.13f)
    val angle = dir * (if (upper) -(18f + lift) else (28f + lift * 0.5f))
    rotate(angle, pivot = Offset(cx, cy)) {
        drawOval(if (upper) WingUpper else WingLower, topLeft = Offset(cx - w / 2, cy - h / 2), size = Size(w, h))
        drawCircle(WingSpot.copy(alpha = 0.8f), radius = h * 0.16f, center = Offset(cx + dir * w * 0.15f, cy))
        drawCircle(WingUpper.copy(alpha = 0.6f), radius = h * 0.07f, center = Offset(cx + dir * w * 0.15f, cy))
    }
}

private fun DrawScope.antenna(c: Offset, faceR: Float, s: Float, side: Float, swing: Float) {
    val base = Offset(c.x + side * faceR * 0.35f, c.y - faceR * 0.85f)
    val ang = (-PI / 2 + side * (0.45 - swing)).toFloat()
    val len = s * 0.20f
    val tip = Offset(base.x + cos(ang) * len, base.y + sin(ang) * len)
    val ctrl = Offset(base.x + side * len * 0.1f, base.y - len * 0.7f)
    val p = Path().apply {
        moveTo(base.x, base.y)
        quadraticBezierTo(ctrl.x, ctrl.y, tip.x, tip.y)
    }
    drawPath(p, Brass, style = Stroke(width = s * 0.012f, cap = StrokeCap.Round))
    drawCircle(Brass, radius = s * 0.018f, center = tip)
}
