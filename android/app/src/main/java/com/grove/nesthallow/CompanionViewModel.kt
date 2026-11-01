package com.grove.nesthallow

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.grove.nesthallow.audio.AudioIO
import com.grove.nesthallow.audio.PhoneAudio
import com.grove.nesthallow.data.Provider
import com.grove.nesthallow.data.Settings
import com.grove.nesthallow.net.CompanionClient
import com.grove.nesthallow.net.CompanionError
import com.grove.nesthallow.net.Turn
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Phase { Idle, Listening, Thinking, Speaking, Error }

data class UiState(
    val phase: Phase = Phase.Idle,
    val provider: Provider = Provider.OPENAI,
    val userText: String = "",
    val replyText: String = "",
    val status: String = "Hold the acorn button and talk to me.",
    val lastLatencyMs: Long? = null,
    val needsSetup: Boolean = false,
)

class CompanionViewModel(app: Application) : AndroidViewModel(app) {

    val settings = Settings(app)
    private val audio: AudioIO = PhoneAudio(app)
    private val client = CompanionClient({ settings.backendUrl }, { settings.deviceToken })
    private val history = ArrayDeque<Turn>()
    private var job: Job? = null
    private var tickJob: Job? = null

    private val _state = MutableStateFlow(UiState(provider = settings.provider, needsSetup = !settings.isConfigured))
    val state: StateFlow<UiState> = _state

    fun setProvider(p: Provider) {
        settings.provider = p
        _state.update { it.copy(provider = p) }
    }

    fun onPressStart() {
        if (!settings.isConfigured) {
            _state.update { it.copy(needsSetup = true) }
            return
        }
        // Talking over her stops her, like a real conversation.
        if (_state.value.phase == Phase.Thinking) return
        job?.cancel()
        audio.stopPlayback()
        audio.startCapture()
        _state.update { it.copy(phase = Phase.Listening, status = "Listening…") }
        tickJob?.cancel()
        tickJob = viewModelScope.launch {
            while (true) {
                delay(250)
                val s = audio.capturedSeconds()
                if (s >= 59.5) { onPressEnd(); break }
            }
        }
    }

    fun onPressEnd() {
        if (_state.value.phase != Phase.Listening) return
        tickJob?.cancel()
        val seconds = audio.capturedSeconds()
        val wav = audio.stopCapture()
        if (seconds < 0.5) {
            _state.update { it.copy(phase = Phase.Idle, status = "Hold the button while you talk.") }
            return
        }
        val released = SystemClock.elapsedRealtime()
        val provider = settings.provider
        _state.update { it.copy(phase = Phase.Thinking, status = "Thinking…") }
        job = viewModelScope.launch {
            try {
                val reply = client.talk(provider, wav, history.toList())
                val latency = SystemClock.elapsedRealtime() - released
                remember(Turn("user", reply.userText), Turn("assistant", reply.replyText))
                _state.update {
                    it.copy(
                        phase = Phase.Speaking,
                        userText = reply.userText,
                        replyText = reply.replyText,
                        lastLatencyMs = latency,
                        status = "${provider.label} · answered in ${"%.1f".format(latency / 1000.0)} s",
                    )
                }
                audio.play(reply.audio)
                _state.update { if (it.phase == Phase.Speaking) it.copy(phase = Phase.Idle) else it }
            } catch (e: CompanionError) {
                _state.update { it.copy(phase = Phase.Error, status = e.message ?: "Something went wrong.") }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(phase = Phase.Error, status = "Something went wrong: ${e.message}") }
            }
        }
    }

    private fun remember(vararg turns: Turn) {
        turns.filter { it.text.isNotBlank() }.forEach { history.addLast(it) }
        while (history.size > 12) history.removeFirst()
    }

    fun forgetConversation() {
        history.clear()
        _state.update { it.copy(userText = "", replyText = "", status = "Fresh start. Hold the button and talk to me.") }
    }

    fun saveSettings(url: String, token: String) {
        settings.backendUrl = url
        settings.deviceToken = token
        _state.update { it.copy(needsSetup = !settings.isConfigured) }
    }

    fun dismissSetup() {
        _state.update { it.copy(needsSetup = false) }
    }

    fun openSetup() {
        _state.update { it.copy(needsSetup = true) }
    }

    suspend fun testConnection(url: String, token: String): String {
        val probe = CompanionClient({ url.trim().trimEnd('/') }, { token.trim() })
        return try { probe.health() } catch (e: CompanionError) { e.message ?: "Failed." }
    }

    override fun onCleared() {
        audio.release()
    }
}
