import axios from 'axios';

// Evolution API (mesma infra que você já usa)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';
const WHATSAPP_NUMBER = process.env.WHATSAPP_ALERT_NUMBER || '';

export async function sendWhatsApp(text: string): Promise<void> {
  if (!EVOLUTION_URL || !WHATSAPP_NUMBER) {
    console.log('[whatsapp] não configurado — mensagem:', text);
    return;
  }

  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: WHATSAPP_NUMBER, text },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('[whatsapp] erro ao enviar:', err);
  }
}
