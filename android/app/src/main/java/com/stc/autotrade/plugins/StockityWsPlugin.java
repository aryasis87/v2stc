package com.stc.autotrade.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

import java.util.concurrent.TimeUnit;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  StockityWsPlugin — v4 Fase B                                            ║
 * ║                                                                          ║
 * ║  ALASAN PLUGIN INI ADA (hasil uji 2026-07-27, token nyata):              ║
 * ║  Server WebSocket Stockity (wss://ws.stockity1.id) MEWAJIBKAN header     ║
 * ║  `authorization-token` saat handshake. Semua jalur yang bisa dipakai     ║
 * ║  JavaScript di WebView/browser DITOLAK 401:                              ║
 * ║      • query param (authtoken / token / auth_token / …)  → 401           ║
 * ║      • Sec-WebSocket-Protocol (subprotocol)              → 401           ║
 * ║      • Cookie saja tanpa header                          → 401           ║
 * ║      • kredensial di payload phx_join                    → 401           ║
 * ║  Hanya header yang diterima. WebSocket API browser tidak bisa menyetel   ║
 * ║  header kustom → koneksi HARUS dibuat di layer native (kelas ini),       ║
 * ║  lalu dijembatani ke JS lewat event Capacitor.                           ║
 * ║                                                                          ║
 * ║  Dampak: eksekusi order dari perangkat user (tanpa VPS) hanya mungkin    ║
 * ║  di APK. Versi web murni tidak bisa membuka WS Stockity.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * API JS:
 *   StockityWs.connect({ authToken, deviceId, deviceType?, userAgent?, url? })
 *   StockityWs.send({ data })        // string JSON pesan Phoenix
 *   StockityWs.close()
 *   StockityWs.isConnected()         // → { connected: boolean }
 * Event: 'open' | 'message' ({data}) | 'closed' ({code, reason}) | 'failure' ({error})
 */
@CapacitorPlugin(name = "StockityWs")
public class StockityWsPlugin extends Plugin {

    private static final String DEFAULT_URL =
            "wss://ws.stockity1.id/?v=2&vsn=2.0.0";
    private static final String DEFAULT_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

    private OkHttpClient client;
    private WebSocket    webSocket;
    private volatile boolean connected = false;

    @PluginMethod
    public void connect(PluginCall call) {
        final String authToken  = call.getString("authToken");
        final String deviceId   = call.getString("deviceId", "");
        final String deviceType = call.getString("deviceType", "web");
        final String userAgent  = call.getString("userAgent", DEFAULT_UA);
        final String url        = call.getString("url", DEFAULT_URL);

        if (authToken == null || authToken.isEmpty()) {
            call.reject("authToken wajib diisi");
            return;
        }

        // Tutup koneksi lama bila masih ada — satu sesi WS per proses.
        closeInternal();

        // Ping bawaan OkHttp menjaga koneksi saat layar mati; heartbeat Phoenix
        // tetap dikirim dari sisi JS agar perilakunya sama dengan engine server.
        client = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(20, TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder()
                .url(url)
                // Header inilah yang tidak bisa disetel dari JavaScript:
                .header("authorization-token", authToken)
                .header("device-id", deviceId)
                .header("device-type", deviceType)
                .header("user-timezone", "Asia/Jakarta")
                .header("User-Agent", userAgent)
                .header("Origin", "https://stockity1.id")
                .header("Referer", "https://stockity1.id/")
                .header("Cookie", "authtoken=" + authToken
                        + "; device_type=" + deviceType
                        + "; device_id=" + deviceId)
                .header("Cache-Control", "no-cache")
                .build();

        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                connected = true;
                notifyListeners("open", new JSObject().put("status", response.code()));
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                notifyListeners("message", new JSObject().put("data", text));
            }

            @Override
            public void onMessage(WebSocket ws, ByteString bytes) {
                notifyListeners("message", new JSObject().put("data", bytes.utf8()));
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                connected = false;
                ws.close(1000, null);
                notifyListeners("closed", new JSObject().put("code", code).put("reason", reason));
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                connected = false;
                notifyListeners("closed", new JSObject().put("code", code).put("reason", reason));
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                connected = false;
                JSObject ev = new JSObject()
                        .put("error", t.getMessage() == null ? "unknown" : t.getMessage());
                if (response != null) ev.put("status", response.code());
                notifyListeners("failure", ev);
            }
        });

        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data");
        if (webSocket == null || data == null) {
            call.reject("WebSocket belum terhubung");
            return;
        }
        boolean ok = webSocket.send(data);
        call.resolve(new JSObject().put("sent", ok));
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        call.resolve(new JSObject().put("connected", connected));
    }

    @PluginMethod
    public void close(PluginCall call) {
        closeInternal();
        call.resolve();
    }

    private void closeInternal() {
        connected = false;
        if (webSocket != null) {
            try { webSocket.close(1000, "client close"); } catch (Exception ignored) {}
            webSocket = null;
        }
        if (client != null) {
            try { client.dispatcher().executorService().shutdown(); } catch (Exception ignored) {}
            client = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        closeInternal();
        super.handleOnDestroy();
    }
}
