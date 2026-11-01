package com.grove.nesthallow.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.coroutines.resume

/** The phone's own microphone and loudspeaker. */
class PhoneAudio(private val context: Context) : AudioIO {

    private val sampleRate = 16_000
    private val maxSeconds = 60.0

    private var recorder: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var recording = false
    private val pcm = ByteArrayOutputStream()

    private var player: MediaPlayer? = null
    private var onPlaybackEnd: (() -> Unit)? = null

    @SuppressLint("MissingPermission") // permission is requested before the talk button works
    override fun startCapture() {
        if (recording) return
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val rec = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, sampleRate) // at least 0.5 s of buffer
        )
        synchronized(pcm) { pcm.reset() }
        recorder = rec
        recording = true
        rec.startRecording()
        thread = Thread {
            val buf = ByteArray(3200) // 100 ms
            while (recording) {
                val n = rec.read(buf, 0, buf.size)
                if (n > 0) synchronized(pcm) {
                    if (pcm.size() < (maxSeconds * sampleRate * 2).toInt()) pcm.write(buf, 0, n)
                }
            }
        }.apply { name = "nesthallow-mic"; start() }
    }

    override fun stopCapture(): ByteArray {
        recording = false
        thread?.join(500)
        thread = null
        recorder?.run {
            try { stop() } catch (_: IllegalStateException) {}
            release()
        }
        recorder = null
        val data = synchronized(pcm) { pcm.toByteArray() }
        return Wav.fromPcm16(data, sampleRate)
    }

    override fun capturedSeconds(): Double = synchronized(pcm) { pcm.size() / (sampleRate * 2.0) }

    override suspend fun play(wav: ByteArray) {
        stopPlayback()
        val file = File(context.cacheDir, "reply.wav").apply { writeBytes(wav) }
        suspendCancellableCoroutine { cont ->
            val mp = MediaPlayer()
            player = mp
            val finish = {
                if (player === mp) player = null
                onPlaybackEnd = null
                mp.release()
                if (cont.isActive) cont.resume(Unit)
            }
            onPlaybackEnd = finish
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            mp.setOnCompletionListener { finish() }
            mp.setOnErrorListener { _, _, _ -> finish(); true }
            try {
                mp.setDataSource(file.absolutePath)
                mp.prepare()
                mp.start()
            } catch (e: Exception) {
                finish()
            }
            cont.invokeOnCancellation { stopPlayback() }
        }
    }

    override fun stopPlayback() {
        val mp = player ?: return
        try { mp.stop() } catch (_: IllegalStateException) {}
        onPlaybackEnd?.invoke()
    }

    override fun release() {
        if (recording) stopCapture()
        stopPlayback()
    }
}
