package com.grove.nesthallow

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.grove.nesthallow.ui.BrassGold
import com.grove.nesthallow.ui.CompanionScreen
import com.grove.nesthallow.ui.GroveNight
import com.grove.nesthallow.ui.Moss
import com.grove.nesthallow.ui.Parchment
import com.grove.nesthallow.ui.SetupDialog

class MainActivity : ComponentActivity() {
    private val vm: CompanionViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = BrassGold, background = GroveNight, surface = Moss,
                    onSurface = Parchment, onBackground = Parchment,
                )
            ) {
                val state by vm.state.collectAsStateWithLifecycle()
                CompanionScreen(
                    state = state,
                    onPressStart = vm::onPressStart,
                    onPressEnd = vm::onPressEnd,
                    onProvider = vm::setProvider,
                    onSettings = vm::openSetup,
                    onForget = vm::forgetConversation,
                )
                if (state.needsSetup) {
                    SetupDialog(
                        initialUrl = vm.settings.backendUrl,
                        initialToken = vm.settings.deviceToken,
                        onTest = vm::testConnection,
                        onSave = vm::saveSettings,
                        onDismiss = vm::dismissSetup,
                    )
                }
            }
        }
    }
}
