import axios from 'axios';

const API_KEY = '05d5c663-bb62-11f0-bdde-0200cd936042';
const BASE_URL = 'https://2factor.in/API/V1';

/**
 * OTP Service for handling SMS OTP operations using 2factor.in
 */
class OTPService {
  /**
   * Send OTP to a phone number
   * @param {string} phone - Phone number in format: +91XXXXXXXXXX or 10-digit number
   * @returns {Promise<{success: boolean, sessionId?: string, error?: string}>}
   */
  async sendOTP(phone) {
    try {
      // Normalize phone number to 10 digits (remove +91 if present)
      let phoneNumber = phone.replace(/\D/g, '');
      if (phoneNumber.startsWith('91') && phoneNumber.length === 12) {
        phoneNumber = phoneNumber.substring(2);
      }
      
      if (phoneNumber.length !== 10) {
        return { success: false, error: 'Invalid phone number format. Must be 10 digits.' };
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      console.log('📤 Sending OTP via SMS to:', phoneNumber, '| OTP:', otp);
      
      // Send OTP via 2factor.in SMS API (not voice call)
      // Using the correct SMS endpoint with auto-generated OTP
      const url = `${BASE_URL}/${API_KEY}/SMS/${phoneNumber}/${otp}`;
      
      console.log('🌐 API URL:', url);
      
      const response = await axios.get(url, {
        timeout: 15000, // Increased timeout for SMS delivery
      });

      console.log('📨 SMS API Response:', response.data);

      if (response.data && response.data.Status === 'Success') {
        console.log('✅ SMS sent successfully to:', phoneNumber);
        return {
          success: true,
          sessionId: response.data.Details || otp,
          otp: otp,
        };
      } else {
        console.error('❌ SMS API returned error:', response.data);
        return {
          success: false,
          error: response.data?.Details || 'Failed to send OTP',
        };
      }
    } catch (error) {
      console.error('❌ Error sending OTP:', error.message);
      if (error.response) {
        console.error('❌ API Response:', error.response.data);
      }
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'Failed to send OTP',
      };
    }
  }

  /**
   * Verify OTP (2factor.in auto-verifies via session, but we can manually verify stored OTP)
   * @param {string} sessionId - Session ID from sendOTP
   * @param {string} otp - OTP entered by user
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async verifyOTP(sessionId, otp) {
    try {
      // For 2factor.in, we verify using the session ID
      const url = `${BASE_URL}/${API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
      
      const response = await axios.get(url, {
        timeout: 10000,
      });

      if (response.data && response.data.Status === 'Success') {
        return { success: true };
      } else {
        return {
          success: false,
          error: response.data?.Details || 'Invalid OTP',
        };
      }
    } catch (error) {
      console.error('Error verifying OTP:', error.message);
      return {
        success: false,
        error: error.response?.data?.Details || 'Invalid or expired OTP',
      };
    }
  }

  /**
   * Resend OTP to the same phone number
   * @param {string} phone - Phone number
   * @returns {Promise<{success: boolean, sessionId?: string, error?: string}>}
   */
  async resendOTP(phone) {
    // Simply send a new OTP
    return this.sendOTP(phone);
  }
}

export default new OTPService();
