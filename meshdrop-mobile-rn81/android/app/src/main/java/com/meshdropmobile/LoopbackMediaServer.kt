package com.meshdropmobile

import android.util.Log
import java.io.IOException
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Minimal loopback HTTP/1.1 Range server for progressive media playback.
 *
 * The Android player (ExoPlayer/Media3, see MeshDropVideoView.kt) needs a
 * seekable, length-aware byte source. A growing staging file has no stable
 * length, so Media3's ProgressiveMediaSource cannot mount it by path.
 *
 * This server exposes the staging file over http://127.0.0.1:PORT with
 * single-range 206 handling and a "grow-aware" mode for progressive playback
 * of a file the JS layer is still downloading:
 *
 *  - expectedTotal: the file's true final size (from the site entry listing).
 *    The server always reports this as the total in Content-Range, so Media3
 *    sees the real duration up front instead of the partially-downloaded
 *    length (which is what made >1GB MP4s fail as a short/source error).
 *  - committed bytes: the JS side writes each range sequentially and then
 *    advances a committed high-water mark. The server never reads past it, so
 *    a reader can never observe a partially-written chunk at the write
 *    frontier (that torn read produced ExoPlayer "Invalid NAL length").
 *  - downloadComplete: a callback the JS side flips once the full file has
 *    been written. Until then the server, for a requested range that starts at
 *    or beyond the committed bytes, waits (bounded) for the writer to catch up
 *    before responding — so a sequential read buffers instead of hitting an
 *    artificial EOF.
 *
 * Security: binds ONLY to 127.0.0.1, serves exactly one path, and is torn down
 * with the view.
 */
class LoopbackMediaServer(
    private val filePath: String,
    private val declaredTotal: Long = -1L
) {
    private val serverSocket: ServerSocket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    private val executor: ExecutorService = Executors.newCachedThreadPool { r ->
        Thread(r, "meshdrop-loopback").apply { isDaemon = true }
    }
    private val running = AtomicBoolean(true)

    /** The true final size when grow-aware (>0), else null (complete-file mode). */
    val expectedTotal: Long?
        get() = if (declaredTotal > 0) declaredTotal else null

    val path: String
        get() = filePath

    // Grow-aware mode: JS flips this once the full file is on disk. Reads that
    // are waiting for the writer to catch up then proceed immediately.
    @Volatile
    private var complete = false

    fun markComplete() { complete = true }

    // The JS side writes each range sequentially and then advances this
    // watermark to the byte offset just past the last DURABLE chunk. The server
    // never reads past it, so a reader can never observe a partially-written
    // chunk at the write frontier (that torn read is what produced ExoPlayer
    // "Invalid NAL length" on large progressive files). Until the JS sets it,
    // fall back to file.length() for complete-file mode.
    @Volatile
    private var committedBytes: Long = -1L

    /** Advance the durable high-water mark. */
    fun setCommittedBytes(bytes: Long) {
        if (bytes > committedBytes) committedBytes = bytes
    }

    /** The largest byte offset the server may safely serve right now. */
    private fun safeReadableLength(): Long {
        val committed = committedBytes
        if (committed > 0) return committed
        val onDisk = onDiskLength()
        return if (complete) onDisk else 0L
    }

    // How long a read waits for the writer to advance before giving up. Must be
    // well under ExoPlayer's own socket read timeout (30 s) so a genuinely
    // stalled download surfaces as a player buffering/error rather than a hang.
    private val MAX_WAIT_MS = 25000L
    private val POLL_MS = 50L

    val port: Int
        get() = serverSocket.localPort

    val baseUrl: String
        get() = "http://127.0.0.1:$port"

    private val lastLengthSeen = AtomicLong(0L)

    /** Latest on-disk length this server observed. Lets the JS side know how
     *  much of the file has actually been read/confirmed. */
    val confirmedLength: Long
        get() = lastLengthSeen.get()

    init {
        executor.submit { acceptLoop() }
    }

    private fun acceptLoop() {
        while (running.get()) {
            try {
                val socket = serverSocket.accept()
                executor.submit { handle(socket) }
            } catch (e: SocketException) {
                if (!running.get()) break
            } catch (e: IOException) {
                if (!running.get()) break
                Log.w("LoopbackMedia", "accept error: ${e.message}")
            }
        }
    }

    private fun onDiskLength(): Long {
        return try { java.io.File(filePath).length() } catch (_: Exception) { 0L }
    }

    /** Wait (bounded) until `pos` is readable, i.e. the writer has committed
     *  bytes past `pos` (or the download is marked complete). */
    private fun awaitReadable(pos: Long): Boolean {
        val deadline = System.currentTimeMillis() + MAX_WAIT_MS
        while (running.get()) {
            val readable = safeReadableLength()
            lastLengthSeen.set(readable)
            if (readable > pos) return true
            if (complete) return safeReadableLength() > pos
            if (System.currentTimeMillis() > deadline) return false
            try { Thread.sleep(POLL_MS) } catch (_: InterruptedException) { return false }
        }
        return false
    }

    private fun handle(socket: Socket) {
        socket.use { s ->
            s.soTimeout = 30000
            val reader = s.getInputStream().bufferedReader(Charsets.ISO_8859_1)
            val requestLine = reader.readLine() ?: return
            // Read headers (bounded — a player sends < 20).
            var rangeHeader: String? = null
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
                if (line.length > 4096) return // header bomb guard
                if (line.startsWith("Range:", ignoreCase = true)) {
                    rangeHeader = line.substringAfter(':').trim()
                }
            }
            val method = requestLine.split(" ").firstOrNull() ?: return
            if (method != "GET" && method != "HEAD") {
                writeStatus(s, 405, "Method Not Allowed", "Allow" to "GET, HEAD")
                return
            }
            val out = s.getOutputStream()
            val file = java.io.File(filePath)
            if (!file.exists()) {
                writeStatus(s, 404, "Not Found")
                return
            }

            // The total reported to the player is the TRUE final size when the
            // JS side knows it (grow-aware), else the current on-disk length.
            val totalForHeaders = if (declaredTotal > 0) declaredTotal else onDiskLength()
            if (totalForHeaders <= 0) {
                writeStatus(s, 200, "OK", "Content-Length" to "0")
                return
            }

            // Single-range bytes=a-b / bytes=a- / bytes=-n (against declared total).
            var start = 0L
            var end = totalForHeaders - 1
            var isRange = false
            if (rangeHeader != null) {
                val m = Regex("bytes=(\\d*)-(\\d*)").find(rangeHeader)
                if (m != null) {
                    isRange = true
                    val a = m.groupValues[1]
                    val b = m.groupValues[2]
                    when {
                        a.isNotEmpty() && b.isNotEmpty() -> { start = a.toLong(); end = minOf(b.toLong(), totalForHeaders - 1) }
                        a.isNotEmpty() -> { start = a.toLong(); end = totalForHeaders - 1 }
                        b.isNotEmpty() -> { start = maxOf(0L, totalForHeaders - b.toLong()); end = totalForHeaders - 1 }
                    }
                    if (start > end || start >= totalForHeaders) {
                        writeStatus(s, 416, "Range Not Satisfiable", "Content-Range" to "bytes */$totalForHeaders")
                        return
                    }
                }
            }
            // Grow-aware mode always serves a partial body of a known-total
            // resource (the file is still downloading). Even a no-Range GET must
            // be answered 206 with Content-Range so Media3 keeps the real total
            // and re-requests the rest, instead of treating the short body as a
            // complete (EOF) file — that was the >1 GB "source error".
            if (declaredTotal > 0 && !isRange) {
                isRange = true
                start = 0L
                end = totalForHeaders - 1
            }

            // Grow-aware: ensure the requested start is within the committed
            // watermark before committing to a 206 (never serve a hole or a
            // torn in-flight chunk as media data). A seek to a not-yet-written
            // region waits up to MAX_WAIT_MS for the JS writer to catch up.
            val readable = safeReadableLength()
            lastLengthSeen.set(readable)
            val usableEnd = if (declaredTotal > 0) {
                if (start >= readable) {
                    if (!awaitReadable(start)) {
                        // Writer stalled / download ended short. Return 416 so
                        // the player treats it as unavailable rather than EOF.
                        Log.w(
                            "MeshDropVideo",
                            "Loopback 416: start=$start readable=$readable total=$totalForHeaders " +
                                "complete=$complete committed=$committedBytes (writer did not catch up in ${MAX_WAIT_MS}ms)"
                        )
                        writeStatus(s, 416, "Range Not Satisfiable", "Content-Range" to "bytes */$totalForHeaders")
                        return
                    }
                }
                minOf(end, safeReadableLength() - 1)
            } else {
                minOf(end, readable - 1)
            }
            if (usableEnd < start) {
                writeStatus(s, 416, "Range Not Satisfiable", "Content-Range" to "bytes */$totalForHeaders")
                return
            }

            val chunkLen = usableEnd - start + 1
            val headers = mutableListOf(
                "Content-Type" to "video/mp4",
                "Accept-Ranges" to "bytes",
                "Content-Length" to chunkLen.toString(),
                "Connection" to "keep-alive"
            )
            if (isRange) {
                headers.add(0, "Content-Range" to "bytes $start-$usableEnd/$totalForHeaders")
                writeStatus(s, 206, "Partial Content", *headers.toTypedArray())
            } else {
                writeStatus(s, 200, "OK", *headers.toTypedArray())
            }
            if (method == "HEAD") return

            // Stream the range from disk in 256 KiB chunks.
            try {
                RandomAccessFile(file, "r").use { raf ->
                    raf.seek(start)
                    val buf = ByteArray(256 * 1024)
                    var remaining = chunkLen
                    while (remaining > 0) {
                        if (!running.get()) return
                        val n = raf.read(buf, 0, minOf(buf.size.toLong(), remaining).toInt())
                        if (n <= 0) break
                        out.write(buf, 0, n)
                        remaining -= n
                    }
                }
            } catch (e: IOException) {
                // Client disconnected mid-read — expected on seek.
            } finally {
                try { out.flush() } catch (_: IOException) {}
            }
        }
    }

    private fun writeStatus(socket: Socket, code: Int, reason: String, vararg extra: Pair<String, String>) {
        try {
            val out = socket.getOutputStream()
            out.write("HTTP/1.1 $code $reason\r\n".toByteArray())
            for ((k, v) in extra) out.write("$k: $v\r\n".toByteArray())
            out.write("\r\n".toByteArray())
            out.flush()
        } catch (_: IOException) {}
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        try { serverSocket.close() } catch (_: IOException) {}
        executor.shutdownNow()
    }
}
