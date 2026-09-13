/**
 * Printable QR poster for a property review code.
 *
 * Opens a small window with the code, the unit name and the URL underneath so
 * a host can print it once and leave it in the flat.
 */
export async function printQrPoster(input: {
  title: string;
  subtitle: string;
  url: string;
}): Promise<void> {
  const mod = await import("qrcode");
  const dataUrl = await mod.default.toDataURL(input.url, {
    width: 900,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return;
  const esc = (text: string) =>
    text.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
    );
  win.document.write(
    `<!doctype html><html><head><title>${esc(input.title)}</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px}` +
      `h1{font-size:30px;margin:0 0 8px}p{color:#475569;margin:0 0 28px}` +
      `img{width:360px;height:360px}small{display:block;margin-top:20px;color:#64748b}` +
      `</style></head><body>` +
      `<h1>${esc(input.title)}</h1><p>${esc(input.subtitle)}</p>` +
      `<img src="${dataUrl}" alt="QR code" />` +
      `<small>${esc(input.url)}</small>` +
      `</body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
