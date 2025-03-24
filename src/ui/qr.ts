import * as vscode from "vscode";

export function showQRCode(qrCodeDataUrl: string, urlWithPort: string) {
  const panel = vscode.window.createWebviewPanel(
    "ipQrCode",
    "QR Live Server",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Live Server</title>
      </head>
      <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground);">
        <div style="background-color: var(--vscode-editor-background); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); border: 1px solid var(--vscode-panel-border);">
          <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 300px; height: 300px; border-radius: 8px;">
          <p style="text-align: center; margin-top: 20px; font-size: 16px; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground);">${urlWithPort}</p>
          <div style="text-align: center; margin-top: 10px;">
            <button onclick="copyToClipboard('${urlWithPort}')" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family);">Copy URL</button>
          </div>
        </div>
        <script>
          function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
              const button = document.querySelector('button');
              button.textContent = 'Copied!';
              setTimeout(() => {
                button.textContent = 'Copy URL';
              }, 2000);
            });
          }
        </script>
      </body>
    </html>
  `;
}
