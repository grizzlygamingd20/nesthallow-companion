package com.grove.nesthallow.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

enum class Provider(val id: String, val label: String) {
    OPENAI("openai", "OpenAI"),
    CLAUDE("claude", "Claude");

    companion object {
        fun from(id: String?) = entries.firstOrNull { it.id == id } ?: OPENAI
    }
}

/** Backend address and device token, kept in Android's encrypted storage. Never baked into the APK. */
class Settings(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "nesthallow_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var backendUrl: String
        get() = prefs.getString("backend_url", "") ?: ""
        set(v) = prefs.edit().putString("backend_url", v.trim().trimEnd('/')).apply()

    var deviceToken: String
        get() = prefs.getString("device_token", "") ?: ""
        set(v) = prefs.edit().putString("device_token", v.trim()).apply()

    var provider: Provider
        get() = Provider.from(prefs.getString("provider", null))
        set(v) = prefs.edit().putString("provider", v.id).apply()

    val isConfigured: Boolean
        get() = backendUrl.startsWith("https://") && deviceToken.length >= 24
}
