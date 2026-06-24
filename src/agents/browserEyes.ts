import { exec } from "child_process";
import { promisify } from "util";
import { emitLog } from "../core/eventBus";

const execAsync = promisify(exec);

export async function execBrowserEyes(payload: any): Promise<string> {
  const action = payload.parameters?.action || "screenshot";
  const filename = payload.parameters?.filename || "screenshot.png";

  if (action === "screenshot") {
    emitLog("BrowserEyes", "info", "Capture d ecran...");
    try {
      let command: string;
      if (process.platform === "win32") {
        command = "powershell -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen; Add-Type -AssemblyName System.Drawing; $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bmp.Save('" + filename + "'); $graphics.Dispose(); $bmp.Dispose()\"";
      } else {
        command = "scrot " + filename;
      }
      await execAsync(command, { timeout: 10000 });
      emitLog("BrowserEyes", "info", "Capture sauvegardee: " + filename);
      return "Succes: Capture d ecran sauvegardee dans " + filename + ". L image peut etre analysee.";
    } catch (error: any) {
      emitLog("BrowserEyes", "error", "Erreur capture: " + error.message);
      return "Erreur: Capture impossible. " + error.message;
    }
  }

  if (action === "windowlist") {
    try {
      const { stdout } = await execAsync('powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \"\"} | Select-Object MainWindowTitle | Format-Table -HideTableHeaders"', { timeout: 10000 });
      return stdout || "Aucune fenetre ouverte.";
    } catch {
      return "Impossible de lister les fenetres.";
    }
  }

  return "Action inconnue. Utilise screenshot ou windowlist.";
}
