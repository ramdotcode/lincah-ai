export async function sendTelegramMessage(token: string, chatId: string | number, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Telegram API Error:', error);
    throw new Error(error.description || 'Failed to send Telegram message');
  }

  return response.json();
}
