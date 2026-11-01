package com.grove.nesthallow.audio

/**
 * Where Nesthallow hears the Keeper and where she speaks.
 *
 * Milestone 1 uses the phone's own microphone and speaker ([PhoneAudio]).
 * The acorn pendant will provide a second implementation over Bluetooth LE,
 * so the conversation code never needs to change.
 */
interface AudioIO {
    /** Start recording the Keeper. */
    fun startCapture()

    /** Stop recording and return the question as a 16 kHz mono 16-bit WAV file. */
    fun stopCapture(): ByteArray

    /** Seconds of audio captured so far. */
    fun capturedSeconds(): Double

    /** Play Nesthallow's reply (a WAV file). Suspends until playback finishes or is stopped. */
    suspend fun play(wav: ByteArray)

    /** Stop playback early (the Keeper started talking over her). */
    fun stopPlayback()

    fun release()
}
