package com.grove.nesthallow.audio

import java.nio.ByteBuffer
import java.nio.ByteOrder

object Wav {
    /** Wrap raw little-endian PCM16 samples in a WAV header. */
    fun fromPcm16(pcm: ByteArray, sampleRate: Int, channels: Int = 1): ByteArray {
        val byteRate = sampleRate * channels * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray(Charsets.US_ASCII))
            putInt(36 + pcm.size)
            put("WAVE".toByteArray(Charsets.US_ASCII))
            put("fmt ".toByteArray(Charsets.US_ASCII))
            putInt(16)
            putShort(1)                       // PCM
            putShort(channels.toShort())
            putInt(sampleRate)
            putInt(byteRate)
            putShort((channels * 2).toShort())
            putShort(16)
            put("data".toByteArray(Charsets.US_ASCII))
            putInt(pcm.size)
        }.array()
        return header + pcm
    }
}
