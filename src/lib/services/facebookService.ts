import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import type { FacebookLeadData, CAPIEvent, CAPIResponse } from '@/lib/types';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Hash user data for CAPI (SHA256, lowercase)
 */
export function hashUserData(value: string): string {
    return CryptoJS.SHA256(value.toLowerCase().trim()).toString();
}

/**
 * Get Facebook OAuth URL for user to connect their page
 */
export function getFacebookOAuthUrl(redirectUri: string, state: string): string {
    const appId = process.env.FACEBOOK_APP_ID!;
    const scopes = [
        'pages_manage_metadata',
        'pages_read_engagement',
        'leads_retrieval',
        'ads_management',
        'ads_read',
        'business_management',
    ].join(',');

    return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scopes}` +
        `&state=${state}` +
        `&response_type=code`;
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in?: number;
}> {
    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;

    const response = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token?` +
        `client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${code}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook OAuth error: ${JSON.stringify(error)}`);
    }

    return response.json();
}

/**
 * Get long-lived access token from short-lived token
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<string> {
    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;

    const response = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${shortLivedToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get long-lived token: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Get user's Facebook Pages
 */
export async function getUserPages(accessToken: string): Promise<{
    id: string;
    name: string;
    access_token: string;
}[]> {
    const response = await fetch(
        `${GRAPH_API_BASE}/me/accounts?access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get pages: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.data || [];
}

/**
 * Get user's Ad Accounts
 */
export async function getAdAccounts(accessToken: string): Promise<{
    id: string;
    name: string;
    account_id: string;
}[]> {
    const response = await fetch(
        `${GRAPH_API_BASE}/me/adaccounts?fields=id,name,account_id&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get ad accounts: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.data || [];
}

/**
 * Create a Dataset (Pixel) for CAPI
 */
export async function createDataset(adAccountId: string, accessToken: string, name: string = 'Lead Pipeline'): Promise<string> {
    // Format: act_123456789 or just 123456789
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const response = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/adspixels`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                access_token: accessToken,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create dataset: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.id;
}

/**
 * Get existing Datasets (Pixels) for an Ad Account
 */
export async function getDatasets(adAccountId: string, accessToken: string): Promise<{
    id: string;
    name: string;
}[]> {
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const response = await fetch(
        `${GRAPH_API_BASE}/${formattedAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get datasets: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.data || [];
}

/**
 * Subscribe to page leadgen webhook
 */
export async function subscribeToLeadgen(pageId: string, pageAccessToken: string): Promise<boolean> {
    const response = await fetch(
        `${GRAPH_API_BASE}/${pageId}/subscribed_apps`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subscribed_fields: ['leadgen'],
                access_token: pageAccessToken,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        console.error('Failed to subscribe to leadgen:', error);
        return false;
    }

    const data = await response.json();
    return data.success === true;
}

/**
 * Fetch lead details from Facebook Graph API (with ad attribution)
 */
export async function fetchLeadDetails(leadgenId: string, pageAccessToken: string): Promise<FacebookLeadData> {
    // Request additional fields for ad attribution
    const fields = 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id';

    const response = await fetch(
        `${GRAPH_API_BASE}/${leadgenId}?fields=${fields}&access_token=${pageAccessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to fetch lead: ${JSON.stringify(error)}`);
    }

    return response.json();
}

/**
 * Fetch form name for a lead form
 */
export async function fetchFormDetails(formId: string, pageAccessToken: string): Promise<{ id: string; name: string }> {
    const response = await fetch(
        `${GRAPH_API_BASE}/${formId}?fields=id,name&access_token=${pageAccessToken}`
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to fetch form: ${JSON.stringify(error)}`);
    }

    return response.json();
}

/**
 * Send conversion event to Facebook CAPI
 */
export async function sendConversionEvent(
    datasetId: string,
    accessToken: string,
    eventName: string,
    userData: {
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
        externalId?: string;
    },
    customData?: Record<string, unknown>
): Promise<CAPIResponse> {
    const event: CAPIEvent = {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: uuidv4(),
        action_source: 'website',
        user_data: {},
    };

    // Hash and add user data
    if (userData.email) {
        event.user_data.em = [hashUserData(userData.email)];
    }
    if (userData.phone) {
        event.user_data.ph = [hashUserData(userData.phone.replace(/\D/g, ''))];
    }
    if (userData.firstName) {
        event.user_data.fn = [hashUserData(userData.firstName)];
    }
    if (userData.lastName) {
        event.user_data.ln = [hashUserData(userData.lastName)];
    }
    if (userData.externalId) {
        event.user_data.external_id = [userData.externalId];
    }

    if (customData) {
        event.custom_data = customData;
    }

    const response = await fetch(
        `${GRAPH_API_BASE}/${datasetId}/events`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: [event],
                access_token: accessToken,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to send CAPI event: ${JSON.stringify(error)}`);
    }

    return response.json();
}

/**
 * Verify Facebook webhook signature
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    appSecret: string
): boolean {
    const expectedSignature = 'sha256=' + CryptoJS.HmacSHA256(payload, appSecret).toString();
    return signature === expectedSignature;
}

/**
 * Parse lead data from Facebook field_data format
 */
export function parseLeadData(fieldData: FacebookLeadData['field_data']): {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    customFields: Record<string, string>;
} {
    const result: {
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
        fullName?: string;
        customFields: Record<string, string>;
    } = { customFields: {} };

    for (const field of fieldData) {
        const value = field.values[0] || '';
        const fieldName = field.name.toLowerCase();

        if (fieldName === 'email') {
            result.email = value;
        } else if (fieldName === 'phone_number' || fieldName === 'phone') {
            result.phone = value;
        } else if (fieldName === 'first_name') {
            result.firstName = value;
        } else if (fieldName === 'last_name') {
            result.lastName = value;
        } else if (fieldName === 'full_name') {
            result.fullName = value;
        } else {
            result.customFields[field.name] = value;
        }
    }

    return result;
}
