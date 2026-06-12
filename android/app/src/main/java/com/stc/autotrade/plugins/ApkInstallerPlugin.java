package com.stc.autotrade.plugins;

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  PLAY STORE BUILD — ApkInstallerPlugin SELURUHNYA DINONAKTIFKAN            ║
// ║                                                                              ║
// ║  Plugin ini membutuhkan:                                                     ║
// ║    • permission REQUEST_INSTALL_PACKAGES (dilarang Play Store)              ║
// ║    • FileProvider di AndroidManifest.xml (ikut dinonaktifkan)               ║
// ║                                                                              ║
// ║  Untuk mengaktifkan kembali (distribusi luar Play Store / sideload):        ║
// ║    1. Uncomment seluruh kode di bawah ini                                   ║
// ║    2. Uncomment FileProvider di AndroidManifest.xml                         ║
// ║    3. Uncomment REQUEST_INSTALL_PACKAGES di AndroidManifest.xml             ║
// ║    4. Uncomment registerPlugin(ApkInstallerPlugin.class) di MainActivity    ║
// ║    5. Uncomment downloadAndInstall + handleDownload di AppUpdateCard.tsx    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/*
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private Thread  downloadThread = null;
    private boolean cancelRequested = false;

    // ── downloadAndInstall ─────────────────────────────────────────────────
    // Dipanggil dari JS: ApkInstaller.downloadAndInstall({ url: "https://..." })
    // Mengembalikan { success: true } setelah install prompt tampil.
    // Progress dikirim via event "downloadProgress": { progress: 0-100 }
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("URL tidak boleh kosong");
            return;
        }

        cancelRequested = false;
        call.setKeepAlive(true);

        downloadThread = new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream input     = null;
            FileOutputStream out  = null;

            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(300_000);
                conn.connect();

                int httpCode = conn.getResponseCode();
                if (httpCode < 200 || httpCode >= 300) {
                    call.reject("Download gagal (HTTP " + httpCode + ")");
                    return;
                }

                long fileSize = conn.getContentLengthLong();
                input = conn.getInputStream();

                File apkFile = new File(getContext().getCacheDir(), "app-update.apk");
                out = new FileOutputStream(apkFile);

                byte[] buffer    = new byte[16_384];
                long downloaded  = 0;
                int  lastEmitted = -1;
                int  count;

                while ((count = input.read(buffer)) != -1) {
                    if (cancelRequested) {
                        call.reject("Download dibatalkan");
                        return;
                    }

                    out.write(buffer, 0, count);
                    downloaded += count;

                    int pct = (fileSize > 0)
                            ? (int) Math.min(99, (downloaded * 100L) / fileSize)
                            : -1;

                    if (pct != lastEmitted) {
                        lastEmitted = pct;
                        JSObject ev = new JSObject();
                        ev.put("progress", pct);
                        notifyListeners("downloadProgress", ev);
                    }
                }

                out.flush();

                JSObject ev100 = new JSObject();
                ev100.put("progress", 100);
                notifyListeners("downloadProgress", ev100);

                File finalApkFile = apkFile;
                new Handler(Looper.getMainLooper()).post(() -> {
                    try {
                        String authority = getContext().getPackageName() + ".fileprovider";
                        Uri apkUri = FileProvider.getUriForFile(
                                getContext(), authority, finalApkFile
                        );

                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(intent);

                        JSObject result = new JSObject();
                        result.put("success", true);
                        call.resolve(result);

                    } catch (Exception e) {
                        call.reject("Gagal memulai instalasi: " + e.getMessage());
                    }
                });

            } catch (Exception e) {
                if (!cancelRequested) {
                    call.reject("Download error: " + e.getMessage());
                }
            } finally {
                try { if (out   != null) out.close();   } catch (Exception ignored) {}
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                if (conn != null) conn.disconnect();
            }
        });

        downloadThread.start();
    }

    // ── cancelDownload ─────────────────────────────────────────────────────
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelRequested = true;
        if (downloadThread != null && downloadThread.isAlive()) {
            downloadThread.interrupt();
        }
        call.resolve();
    }
}
*/

// Stub kosong agar file tetap valid sebagai Java class (tidak menyebabkan compile error).
// Hapus stub ini dan uncomment blok di atas saat fitur diaktifkan kembali.
public class ApkInstallerPlugin extends com.getcapacitor.Plugin {
    // intentionally empty — Play Store build
}