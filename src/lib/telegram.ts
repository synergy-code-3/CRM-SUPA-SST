// Envío del copy + flyer de una mentoría al grupo de Telegram del equipo,
// vía Bot API — reemplaza el copiar/pegar manual que se hacía antes.
// TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID se configuran una sola vez (ver
// instrucciones del bot en BotFather + getUpdates para el id del grupo).

// Límite real de Telegram para el "caption" de una foto — si el copy es más
// largo, se manda la foto sola y el texto completo aparte, para no perder
// nada del mensaje.
const LIMITE_CAPTION = 1024;

export async function enviarFlyerATelegram(texto: string, imagenUrl: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Falta configurar TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID");

  const base = `https://api.telegram.org/bot${token}`;
  const cabe = texto.length <= LIMITE_CAPTION;

  const resFoto = await fetch(`${base}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: imagenUrl, ...(cabe ? { caption: texto } : {}) }),
  });
  if (!resFoto.ok) {
    const data = await resFoto.json().catch(() => null);
    throw new Error(`Telegram respondió ${resFoto.status}: ${data?.description ?? "error desconocido"}`);
  }

  if (!cabe) {
    const resTexto = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
    if (!resTexto.ok) {
      const data = await resTexto.json().catch(() => null);
      throw new Error(`La foto sí se mandó, pero el texto no: Telegram respondió ${resTexto.status}: ${data?.description ?? "error desconocido"}`);
    }
  }
}
