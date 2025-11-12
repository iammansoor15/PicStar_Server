import axios from 'axios';

const testPayment = async () => {
  try {
    console.log('Testing payment endpoint...');
    const response = await axios.post('http://31.97.233.69:10000/api/payments/create-order', {
      amount: 1,
      currency: 'INR'
    }, {
      headers: {
        'Authorization': 'Bearer fake_token_for_test',
        'Content-Type': 'application/json'
      }
    });
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
};

testPayment();
