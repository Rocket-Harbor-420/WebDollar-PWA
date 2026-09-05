package com.webdollar.wallet;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String APP_ASSET_ORIGIN = "appassets.local";
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebViewClient(new LocalAssetClient());
        setContentView(webView);
        webView.loadUrl("https://" + APP_ASSET_ORIGIN + "/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private final class LocalAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return openAsset(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return openAsset(Uri.parse(url));
        }

        private WebResourceResponse openAsset(Uri uri) {
            if (uri == null || !APP_ASSET_ORIGIN.equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
            if (path.contains("..") || path.contains("\\")) return null;
            String assetName = "www" + path;
            try {
                InputStream stream = getAssets().open(assetName);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                String mime = URLConnection.guessContentTypeFromName(assetName);
                if (mime == null) mime = mimeFor(assetName);
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream);
            } catch (IOException ignored) {
                return null;
            }
        }

        private String mimeFor(String path) {
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".webmanifest")) return "application/manifest+json";
            return "application/octet-stream";
        }
    }
}
