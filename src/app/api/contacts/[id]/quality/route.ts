import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * POST /api/contacts/[id]/quality - Update lead quality score
 * Lead quality is scored 0-100 based on multiple factors
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = createServerClient();
    const { id } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { quality_score, lead_value } = body;

        // Get contact
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (contactError || !contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Update quality score and lead value
        const updates: Record<string, unknown> = {};

        if (typeof quality_score === 'number') {
            updates.lead_quality_score = Math.max(0, Math.min(100, quality_score));
        }

        if (typeof lead_value === 'number') {
            updates.lead_value = lead_value;
        }

        const { error: updateError } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            contact_id: id,
            quality_score: updates.lead_quality_score,
            lead_value: updates.lead_value,
        });
    } catch (error) {
        console.error('Failed to update quality:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

/**
 * Calculate lead quality score based on multiple factors
 */
export function calculateLeadQuality(contact: {
    email?: string;
    phone?: string;
    full_name?: string;
    ai_analysis?: { urgency?: string; intent?: string };
    custom_fields?: Record<string, string>;
}): number {
    let score = 0;

    // Contact information completeness (max 30 points)
    if (contact.email) score += 10;
    if (contact.phone) score += 10;
    if (contact.full_name) score += 10;

    // AI Analysis quality (max 40 points)
    if (contact.ai_analysis) {
        switch (contact.ai_analysis.urgency) {
            case 'high': score += 20; break;
            case 'medium': score += 10; break;
            case 'low': score += 5; break;
        }

        // Intent clarity
        if (contact.ai_analysis.intent && contact.ai_analysis.intent.length > 20) {
            score += 20;
        } else if (contact.ai_analysis.intent) {
            score += 10;
        }
    }

    // Custom fields richness (max 30 points)
    const customFieldCount = Object.keys(contact.custom_fields || {}).length;
    score += Math.min(30, customFieldCount * 10);

    return Math.min(100, score);
}
