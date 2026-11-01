package com.grove.nesthallow.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.grove.nesthallow.Phase
import com.grove.nesthallow.UiState
import com.grove.nesthallow.data.Provider

val GroveNight = Color(0xFF0F1A14)
val Moss = Color(0xFF1E3326)
val Parchment = Color(0xFFF5E9C9)
val Walnut = Color(0xFF7A4B2A)
val BrassGold = Color(0xFFC9A94E)

@Composable
fun CompanionScreen(
    state: UiState,
    onPressStart: () -> Unit,
    onPressEnd: () -> Unit,
    onProvider: (Provider) -> Unit,
    onSettings: () -> Unit,
    onForget: () -> Unit,
) {
    val context = LocalContext.current
    var hasMic by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { hasMic = it }
    val haptics = LocalHapticFeedback.current

    Column(
        Modifier
            .fillMaxSize()
            .background(GroveNight)
            .systemBarsPadding()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Header: name, provider switch, settings.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Nesthallow", color = Parchment, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onForget) { Icon(Icons.Filled.Refresh, "New conversation", tint = Parchment.copy(alpha = 0.7f)) }
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, "Settings", tint = Parchment.copy(alpha = 0.7f)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Provider.entries.forEach { p ->
                FilterChip(
                    selected = state.provider == p,
                    onClick = { onProvider(p) },
                    label = { Text(p.label) },
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = Moss, labelColor = Parchment.copy(alpha = 0.7f),
                        selectedContainerColor = BrassGold, selectedLabelColor = GroveNight,
                    ),
                )
            }
        }

        // Her face.
        NesthallowFace(state.phase, Modifier.fillMaxWidth().weight(1f))

        // What was said.
        Column(
            Modifier
                .fillMaxWidth()
                .height(120.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Moss)
                .verticalScroll(rememberScrollState())
                .padding(14.dp)
        ) {
            if (state.userText.isNotBlank()) Text("You: ${state.userText}", color = Parchment.copy(alpha = 0.65f), fontSize = 14.sp)
            if (state.replyText.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(state.replyText, color = Parchment, fontSize = 16.sp)
            }
            if (state.userText.isBlank() && state.replyText.isBlank()) {
                Text("Our conversation will appear here.", color = Parchment.copy(alpha = 0.4f), fontSize = 14.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            state.status,
            color = if (state.phase == Phase.Error) Color(0xFFE8A0A0) else Parchment.copy(alpha = 0.7f),
            fontSize = 13.sp, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))

        // Hold-to-talk button.
        val pressed = state.phase == Phase.Listening
        val scale by animateFloatAsState(if (pressed) 1.12f else 1f, label = "btn")
        val color by animateColorAsState(if (pressed) BrassGold else Walnut, label = "btnColor")
        Box(
            Modifier
                .size(112.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(color)
                .pointerInput(hasMic) {
                    detectTapGestures(onPress = {
                        if (!hasMic) {
                            askMic.launch(Manifest.permission.RECORD_AUDIO)
                            return@detectTapGestures
                        }
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onPressStart()
                        tryAwaitRelease()
                        onPressEnd()
                    })
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                when (state.phase) {
                    Phase.Listening -> "Listening"
                    Phase.Thinking -> "…"
                    else -> "Hold\nto talk"
                },
                color = if (pressed) GroveNight else Parchment, textAlign = TextAlign.Center,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(8.dp))
    }
}
