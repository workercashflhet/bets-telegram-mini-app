// api/create-invoice.js
export default async function handler(req, res) {
    // Разрешаем только POST запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        // Токен вашего бота (получить у @BotFather)
        const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
        
        // Создаем инвойс через Telegram Bot API
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Пополнение Stars',
                description: `Пополнение баланса на ${amount} Stars`,
                payload: `deposit_stars_${Date.now()}`,
                provider_token: '', // Для Stars не нужен
                currency: 'XTR', // XTR = Telegram Stars
                prices: [
                    { label: `${amount} Stars`, amount: amount }
                ]
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return res.status(500).json({ 
                success: false, 
                error: data.description || 'Failed to create invoice' 
            });
        }

        return res.status(200).json({
            success: true,
            invoiceLink: data.result
        });

    } catch (error) {
        console.error('Error creating invoice:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
}