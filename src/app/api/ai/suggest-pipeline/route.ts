import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';
import { suggestPipeline } from '@/lib/services/nvidiaAIService';
import type { Contact } from '@/lib/types';

// POST /api/ai/suggest-pipeline - Generate pipeline suggestion
export async function POST(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const model = body.model || 'meta/llama-3.1-8b-instruct';
        const businessContext = body.business_context;

        // Get user's contacts
        const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (contactsError) {
            console.error('Failed to fetch contacts:', contactsError);
            return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
        }

        if (!contacts || contacts.length === 0) {
            return NextResponse.json({
                error: 'No contacts found. Add some contacts first before generating a pipeline.'
            }, { status: 400 });
        }

        // Generate pipeline suggestion
        const result = await suggestPipeline(contacts as Contact[], businessContext, model);

        // Log the AI action
        await supabase
            .from('ai_analysis_logs')
            .insert({
                user_id: user.id,
                action_type: 'suggest_pipeline',
                model_used: model,
                input_summary: `Analyzed ${contacts.length} contacts for pipeline suggestion`,
                output_summary: `Suggested: ${result.suggestion.name} with ${result.suggestion.stages.length} stages`,
                tokens_used: result.tokensUsed,
            });

        return NextResponse.json({
            suggestion: result.suggestion,
            tokens_used: result.tokensUsed,
        });
    } catch (err) {
        console.error('Pipeline suggestion error:', err);
        return NextResponse.json({ error: 'Failed to generate pipeline suggestion' }, { status: 500 });
    }
}
