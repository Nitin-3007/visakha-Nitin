import cron from 'node-cron';
import { connectDB } from './db.js';
import { sendDailyReportEmail } from './mailer.js';

export async function generateDailyReport() {
    try {
        console.log('📊 Generating Daily Report...');
        const db = await connectDB();
        
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Calculate Stats
        const totalConversations = await db.collection('conversations').countDocuments({
            createdAt: { $gte: yesterday }
        });

        const messages = await db.collection('messages').find({
            createdAt: { $gte: yesterday }
        }).toArray();

        const totalMessages = messages.length;
        let thumbsUp = 0;
        let thumbsDown = 0;
        let unansweredCount = 0;

        for (const msg of messages) {
            if (msg.feedback?.rating === 'thumbsUp') thumbsUp++;
            if (msg.feedback?.rating === 'thumbsDown') thumbsDown++;
            if (msg.feedback?.tag === 'not_matched') unansweredCount++;
        }

        const stats = {
            totalConversations,
            totalMessages,
            thumbsUp,
            thumbsDown,
            unansweredCount
        };

        // Find designated users
        const receivers = await db.collection('admin_users').find({
            receiveDailyReport: true,
            email: { $exists: true }
        }).toArray();

        const toEmails = receivers.map(r => r.email).filter(Boolean);

        if (toEmails.length > 0) {
            await sendDailyReportEmail(toEmails, stats);
        } else {
            console.log('⚠️ No designated members found for the daily report.');
        }

        return { success: true, designatedMembersCount: toEmails.length, stats };

    } catch (error) {
        console.error('❌ Error generating report:', error);
        throw error;
    }
}

let cronTask: cron.ScheduledTask | null = null;

export function startReportingService() {
    if (cronTask) return;
    console.log('📈 Starting Daily Report Service (scheduled for 9 PM daily)');
    
    // Pattern: '0 21 * * *' means 21:00 (9PM) every day
    // Will run according to server local time timezone.
    cronTask = cron.schedule('0 21 * * *', async () => {
        try {
            await generateDailyReport();
        } catch (e) {
            console.error('Scheduled Report Failed:', e);
        }
    });
}
