package com.grove.nesthallow.net

import android.util.Base64
import com.grove.nesthallow.data.Provider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

data class Turn(val role: String, val text: String)

data class Reply(val userText: String, val replyText: String, val audio: ByteArray, val serverMs: Long)

class CompanionError(message: String) : Exception(message)

/** Talks to the companion backend. The backend holds the AI keys and Nesthallow's persona. */
class CompanionClient(
    private val baseUrl: () -> String,
    private val token: () -> String,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(75, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()

    suspend fun talk(provider: Provider, wav: ByteArray, history: List<Turn>): Reply = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("provider", provider.id)
            .put("audio", Base64.encodeToString(wav, Base64.NO_WRAP))
            .put("history", JSONArray().apply {
                history.forEach { put(JSONObject().put("role", it.role).put("text", it.text)) }
            })
        val req = Request.Builder()
            .url("${baseUrl()}/api/talk")
            .header("Authorization", "Bearer ${token()}")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        val j = execute(req)
        Reply(
            userText = j.optString("userText"),
            replyText = j.optString("replyText"),
            audio = Base64.decode(j.getString("audio"), Base64.DEFAULT),
            serverMs = j.optLong("ms"),
        )
    }

    /** Returns a short human-readable status for the settings screen. */
    suspend fun health(): String = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("${baseUrl()}/api/health")
            .header("Authorization", "Bearer ${token()}")
            .get()
            .build()
        val j = execute(req)
        val oa = if (j.optBoolean("openai")) "OpenAI ready" else "OpenAI key missing"
        val cl = if (j.optBoolean("claude")) "Claude ready" else "Claude key missing"
        "Connected. $oa, $cl."
    }

    private fun execute(req: Request): JSONObject {
        try {
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val j = try { JSONObject(text) } catch (e: Exception) { null }
                if (!resp.isSuccessful) {
                    throw CompanionError(j?.optString("error")?.takeIf { it.isNotBlank() } ?: "Server error ${resp.code}")
                }
                return j ?: throw CompanionError("The server sent something I couldn't read.")
            }
        } catch (e: IOException) {
            throw CompanionError("Can't reach the backend: ${e.message ?: "network error"}")
        }
    }
}
