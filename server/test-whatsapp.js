require('dotenv').config();
const axios = require('axios');

const testWhatsApp = async () => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const toPhone = process.env.WHATSAPP_TO_PHONE;

    if (!token || !phoneId || !toPhone) {
        console.error('❌ Missing WhatsApp credentials in .env');
        console.error('Required: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO_PHONE');
        return;
    }

    console.log(`Testing WhatsApp Message to: ${toPhone}`);
    console.log(`Phone ID: ${phoneId}`);

    try {
        // 1. Send Simple Text Message
        console.log('\nSending Text Message...');
        const textResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: toPhone,
                type: 'text',
                text: { body: 'Hello from Scheduler App! 🚀 This is a test message.' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✅ Text Message Sent!', textResponse.data);

        // 2. Send Image Message (Optional - uses a public sample image)
        console.log('\nSending Image Message...');
        const imageResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: toPhone,
                type: 'image',
                image: {
                    link: 'https://images.unsplash.com/photo-1516216628859-9bccecab13ca?w=600',
                    caption: 'And here is a test image!'
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✅ Image Message Sent!', imageResponse.data);

    } catch (error) {
        console.error('❌ WhatsApp Test Failed:');
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
};

testWhatsApp();
