import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { verifyWebhookSignature } from '@/lib/services/facebookService';
import { reanalyzeContactWithConversation } from '@/lib/services/conversationAnalysisService';

/**
 * POST /api/webhooks/messenger - Handle incoming messages from Facebook Messenger
 * This webhook receives messages and triggers AI re-analysis
 */
export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-hub-signature-256') || '';
        const appSecret = process.env.FACEBOOK_APP_SECRET!;

        // Verify signature
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.error('Invalid messenger webhook signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const body = JSON.parse(rawBody);

        // Process each entry
        for (const entry of body.entry || []) {
            const pageId = entry.id;

            for (const messagingEvent of entry.messaging || []) {
                await processMessagingEvent(pageId, messagingEvent);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Messenger webhook error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

// GET for webhook verification
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');
    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}

interface MessagingEvent {
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
        mid: string;
        text: string;
        attachments?: { type: string; payload: { url: string } }[];
    };
    postback?: {
        payload: string;
        title: string;
    };
}

async function processMessagingEvent(pageId: string, event: MessagingEvent) {
    const supabase = createServerClient();

    try {
        const senderId = event.sender.id;
        const messageText = event.message?.text || event.postback?.title || '';
        const messageId = event.message?.mid;

        if (!messageText) {
            console.log('No text content in message, skipping');
            return;
        }

        // Find the Facebook config for this page
        const { data: fbConfig } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('page_id', pageId)
            .single();

        if (!fbConfig) {
            console.log('No config found for page:', pageId);
            return;
        }

        // Find contact by their Facebook sender ID (PSID)
        // First check if we have a contact with this sender ID stored
        const { data: existingContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', fbConfig.user_id)
            .eq('facebook_page_id', pageId)
            .or(`custom_fields->psid.eq.${senderId},facebook_lead_id.eq.${senderId}`)
            .single();

        // Only track messages for webhook-sourced contacts
        if (!existingContact) {
            console.log('No webhook contact found for sender:', senderId);

            // Try to find by matching message sender to any contact
            // This is for cases where we need to link the PSID
            return;
        }

        // Only save messages for webhook contacts (not synced/imported)
        if (existingContact.source !== 'webhook') {
            console.log('Contact is not from webhook, skipping message save:', existingContact.source);
            return;
        }

        console.log('📨 Message received from webhook contact:', existingContact.full_name || existingContact.email);

        // Save the message
        const { error: messageError } = await supabase
            .from('messages')
            .insert({
                contact_id: existingContact.id,
                user_id: fbConfig.user_id,
                direction: 'inbound',
                content: messageText,
                platform: 'messenger',
                facebook_message_id: messageId,
            });

        if (messageError) {
            console.error('Failed to save message:', messageError);
        } else {
            console.log('💾 Message saved for contact:', existingContact.id);
        }

        // Get conversation history for this contact
        const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('contact_id', existingContact.id)
            .order('created_at', { ascending: true })
            .limit(20); // Last 20 messages

        // Re-analyze the contact based on conversation
        console.log('🤖 Re-analyzing contact based on conversation...');

        await reanalyzeContactWithConversation(
            existingContact,
            messages || [],
            fbConfig,
            supabase
        );

        console.log('✅ Conversation analysis complete');
    } catch (error) {
        console.error('Error processing messaging event:', error);
    }
}
