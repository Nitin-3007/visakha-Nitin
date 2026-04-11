import { connectDB } from './db.js';
import { sendSpikeAlertEmail } from './mailer.js';

let lastAlertTime: Date | null = null;
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const THRESHOLD = 5; // Alert if strictly > 5 thumbsDown
const LOOKBACK_MS = 60 * 60 * 1000; // 1 hour

async function checkSpikes() {
    try {
        const now = new Date();
        
        // Respect cooldown
        if (lastAlertTime && (now.getTime() - lastAlertTime.getTime() < ALERT_COOLDOWN_MS)) {
            return;
        }

        const db = await connectDB();
        const oneHourAgo = new Date(now.getTime() - LOOKBACK_MS);

        const recentNegativeCount = await db.collection('messages').countDocuments({
            'feedback.rating': 'thumbsDown',
            createdAt: { $gte: oneHourAgo }
        });

        if (recentNegativeCount >= THRESHOLD) {
            console.log(`[ALERT] Spike detected: ${recentNegativeCount} negative feedbacks in the last hour.`);
            
            // Fetch super admins
            const superAdmins = await db.collection('admin_users').find({ role: 'super_admin' }).toArray();
            
            for (const admin of superAdmins) {
                if (admin.email) {
                    await sendSpikeAlertEmail(admin.email, recentNegativeCount, '1 hour');
                }
            }

            // Update cooldown
            lastAlertTime = new Date();
        }

    } catch (error) {
        console.error('Error during spike check:', error);
    }
}

let alertInterval: ReturnType<typeof setInterval> | null = null;

export function startAlertingService() {
    if (alertInterval) return;
    console.log('🛡️ Starting real-time alerting service...');
    // Initial check after 30s
    setTimeout(checkSpikes, 30000);
    // Check every 15 minutes
    alertInterval = setInterval(checkSpikes, 15 * 60 * 1000);
}
