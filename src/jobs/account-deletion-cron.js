import cron from 'node-cron';
import User from '../models/User.js';
import DeletionRequest from '../models/DeletionRequest.js';

// Run every day at 2 AM to automatically delete accounts
const scheduleAccountDeletionJob = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🗑️  Running automatic account deletion job...');

      const now = new Date();

      // Find all users with accountStatus='pending' and deletionScheduledAt <= now
      const usersToDelete = await User.find({
        accountStatus: 'pending',
        deletionScheduledAt: { $lte: now },
      });

      console.log(`📊 Found ${usersToDelete.length} accounts to auto-delete`);

      for (const user of usersToDelete) {
        try {
          // Update accountStatus to 'deleted'
          user.accountStatus = 'deleted';
          user.deletionScheduledAt = null; // Clear scheduled date
          await user.save();

          // Update corresponding deletion request to 'completed'
          await DeletionRequest.updateMany(
            { phone: user.phone, status: 'processing' },
            {
              status: 'completed',
              processedAt: new Date(),
            }
          );

          console.log(`✅ Auto-deleted account: ${user.phone}`);
        } catch (error) {
          console.error(`❌ Error deleting account ${user.phone}:`, error);
        }
      }

      console.log('✅ Account deletion job completed');
    } catch (error) {
      console.error('❌ Error in account deletion cron job:', error);
    }
  });

  console.log('📅 Account deletion cron job scheduled (runs daily at 2 AM)');
};

export default { start: scheduleAccountDeletionJob };
