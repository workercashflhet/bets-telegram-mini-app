// api/check-payment.js
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Здесь должна быть проверка платежей через бота
        // В демо-режиме всегда возвращаем успех
        return res.status(200).json({
            success: true,
            paid: true,
            message: 'Payment verified'
        });
    } catch (error) {
        console.error('Error checking payment:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
}