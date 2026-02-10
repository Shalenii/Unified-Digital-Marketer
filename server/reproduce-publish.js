const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testImmediatePublish() {
    const form = new FormData();

    // Create a valid 1x1 PNG image buffer
    const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

    form.append('image', dummyImage, { filename: 'test-image.png', contentType: 'image/png' });
    form.append('caption', 'Test immediate publish from script ' + new Date().toISOString());
    form.append('hashtags', '#test #debug');
    form.append('platforms', JSON.stringify(['Telegram'])); // targeted platform
    form.append('scheduled_time', new Date().toISOString());
    form.append('is_immediate', 'true');
    form.append('source_mode', 'Manual');

    try {
        console.log('Sending request to http://localhost:3001/api/posts...');
        const response = await axios.post('http://localhost:3001/api/posts', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', response.data);
    } catch (error) {
        console.error('FULL ERROR:', error);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received. Request was sent.');
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

testImmediatePublish();
