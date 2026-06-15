// ============================================
// REFERRAL DASHBOARD - FIXED VERSION
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let referralCode = null;
let earnings = null;
let referralStats = null;
let settings = null;

// ============================================
// UTILITIES
// ============================================

function formatCurrency(amount) {
    return `UGX ${(amount || 0).toLocaleString('en-UG')}`;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-UG');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #1E293B;
            color: white;
            padding: 12px 20px;
            border-radius: 40px;
            font-size: 14px;
            z-index: 2000;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            font-weight: 500;
        `;
        document.body.appendChild(toast);
    }
    
    const colors = { success: '#10B981', error: '#EF4444', info: '#0B4F6C', warning: '#F59E0B' };
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 3000);
}

function showLoading(show, message = 'Loading...') {
    let overlay = document.getElementById('loadingOverlay');
    let messageEl = document.getElementById('loadingMessage');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s;
        `;
        overlay.innerHTML = `
            <div style="width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p id="loadingMessage" style="color: white; margin-top: 16px; font-size: 14px;">Loading...</p>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(overlay);
        messageEl = document.getElementById('loadingMessage');
    }
    
    if (show) {
        if (messageEl) messageEl.textContent = message;
        overlay.style.opacity = '1';
        overlay.style.visibility = 'visible';
    } else {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}

function getCreditValue(credits, settings) {
    if (!settings || !credits) return 0;
    const ratio = (settings.cash_payout_value || 10000) / (settings.credits_needed_for_payout || 1000);
    return credits * ratio;
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            window.location.href = 'login.html?redirect=referral-dashboard.html';
            return false;
        }
        currentUser = user;
        return true;
    } catch (error) {
        console.error('Auth error:', error);
        return false;
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadReferralCode() {
    try {
        const { data: existingCode, error: codeError } = await sb
            .from('referral_codes')
            .select('code')
            .eq('user_id', currentUser.id)
            .eq('is_active', true)
            .maybeSingle(); // Use maybeSingle to avoid error when no rows
        
        if (existingCode) {
            referralCode = existingCode.code;
        } else {
            const { data: profile } = await sb
                .from('profiles')
                .select('full_name, business_name')
                .eq('id', currentUser.id)
                .maybeSingle();
            
            const baseCode = (profile?.full_name || profile?.business_name || 'USER')
                .substring(0, 5)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            const newCode = `${baseCode}${randomSuffix}`;
            
            const { data: inserted, error: insertError } = await sb
                .from('referral_codes')
                .insert({
                    user_id: currentUser.id,
                    code: newCode,
                    is_active: true
                })
                .select()
                .single();
            
            if (insertError) throw insertError;
            referralCode = inserted.code;
        }
        
        const codeElement = document.getElementById('referralCode');
        const linkElement = document.getElementById('referralLink');
        
        if (codeElement) codeElement.textContent = referralCode || 'Error';
        if (linkElement && referralCode) {
            const link = `https://buyuganda.online/register.html?ref=${referralCode}`;
            linkElement.textContent = link;
            linkElement.setAttribute('data-link', link);
        }
    } catch (error) {
        console.error('Error loading referral code:', error);
        const codeElement = document.getElementById('referralCode');
        if (codeElement) codeElement.textContent = 'Error loading';
    }
}

async function loadEarnings() {
    try {
        // Get user credits
        const { data: credits, error: creditsError } = await sb
            .from('user_credits')
            .select('credit_balance, cash_balance, total_earned, lifetime_referrals')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        
        earnings = credits || { credit_balance: 0, cash_balance: 0, total_earned: 0, lifetime_referrals: 0 };
        
        // Get wallet for additional earnings
        const { data: wallet, error: walletError } = await sb
            .from('wallets')
            .select('marketer_balance, total_earned')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        
        if (wallet) {
            earnings.cash_balance = wallet.marketer_balance || earnings.cash_balance;
            earnings.total_earned = wallet.total_earned || earnings.total_earned;
        }
        
        // Update UI
        document.getElementById('cashBalance').textContent = formatCurrency(earnings.cash_balance || 0);
        document.getElementById('creditBalance').textContent = earnings.credit_balance || 0;
        document.getElementById('totalEarned').textContent = formatCurrency(earnings.total_earned || 0);
        document.getElementById('totalReferrals').textContent = `${earnings.lifetime_referrals || 0} referrals`;
        
        if (settings) {
            const creditValue = getCreditValue(earnings.credit_balance || 0, settings);
            const creditValueElement = document.getElementById('creditValue');
            if (creditValueElement) creditValueElement.textContent = formatCurrency(creditValue);
        }
        
        updateCreditsToNext();
    } catch (error) {
        console.error('Error loading earnings:', error);
    }
}

async function loadReferralStats() {
    try {
        const { data: referrals, error } = await sb
            .from('referrals')
            .select('type, status')
            .eq('referrer_id', currentUser.id);
        
        if (error) throw error;
        
        const totalSuppliers = referrals?.filter(r => r.type === 'supplier').length || 0;
        const verifiedSuppliers = referrals?.filter(r => r.type === 'supplier' && r.status === 'verified').length || 0;
        const totalBuyers = referrals?.filter(r => r.type === 'buyer').length || 0;
        
        document.getElementById('supplierReferrals').textContent = totalSuppliers;
        document.getElementById('verifiedSuppliers').textContent = `(${verifiedSuppliers} verified)`;
        document.getElementById('buyerReferrals').textContent = totalBuyers;
    } catch (error) {
        console.error('Error loading referral stats:', error);
    }
}

async function loadSettings() {
    try {
        const { data, error } = await sb
            .from('referral_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle(); // Use maybeSingle to avoid 0 rows error
        
        if (error) throw error;
        
        if (data) {
            settings = data;
        } else {
            // Default settings if no row exists
            settings = {
                supplier_reward_min: 5000,
                supplier_reward_max: 15000,
                buyer_credits_per_signup: 30,
                credits_needed_for_payout: 1000,
                cash_payout_value: 10000,
                max_payout_per_day: 50000,
                min_verified_suppliers_before_payout: 1
            };
            console.log('Using default settings');
        }
        
        updateCreditsToNext();
        
        // Update hints in UI
        const cashHint = document.getElementById('cashHint');
        const creditsHint = document.getElementById('creditsHint');
        if (cashHint) cashHint.textContent = `Min UGX ${settings.supplier_reward_min?.toLocaleString() || 5000}`;
        if (creditsHint) creditsHint.textContent = `${settings.credits_needed_for_payout || 1000} credits = ${formatCurrency(settings.cash_payout_value || 10000)}`;
        
    } catch (error) {
        console.error('Error loading settings:', error);
        // Set defaults
        settings = {
            supplier_reward_min: 5000,
            supplier_reward_max: 15000,
            buyer_credits_per_signup: 30,
            credits_needed_for_payout: 1000,
            cash_payout_value: 10000,
            max_payout_per_day: 50000,
            min_verified_suppliers_before_payout: 1
        };
    }
}

function updateCreditsToNext() {
    const creditsToNextElement = document.getElementById('creditsToNext');
    if (creditsToNextElement && settings && earnings) {
        const needed = Math.max(0, (settings.credits_needed_for_payout || 1000) - (earnings.credit_balance || 0));
        creditsToNextElement.textContent = needed;
    }
}

async function loadRecentReferrals() {
    try {
        // Fix: Use proper join - get referred user profile separately
        const { data: referrals, error } = await sb
            .from('referrals')
            .select(`
                id,
                type,
                status,
                verified_at,
                created_at,
                reward_amount,
                credits_awarded,
                referred_user_id
            `)
            .eq('referrer_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        const container = document.getElementById('recentReferralsList');
        if (!container) return;
        
        if (!referrals || referrals.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-users" style="font-size: 40px; color: #94A3B8; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">No referrals yet. Share your link to start earning!</p>
                </div>
            `;
            return;
        }
        
        // Get referred user profiles separately
        const userIds = referrals.map(r => r.referred_user_id).filter(id => id);
        let profiles = {};
        if (userIds.length > 0) {
            const { data: profileData } = await sb
                .from('profiles')
                .select('id, full_name, business_name')
                .in('id', userIds);
            if (profileData) {
                profiles = profileData.reduce((acc, p) => {
                    acc[p.id] = p;
                    return acc;
                }, {});
            }
        }
        
        container.innerHTML = referrals.map(ref => {
            const profile = profiles[ref.referred_user_id];
            const name = profile?.full_name || profile?.business_name || 'User';
            const typeClass = ref.type === 'supplier' ? 'supplier' : 'buyer';
            const typeLabel = ref.type === 'supplier' ? 'Supplier' : 'Buyer';
            const statusClass = ref.status === 'verified' ? 'verified' : 'pending';
            const statusLabel = ref.status === 'verified' ? '✓ Verified' : '⏳ Pending';
            
            const rewardHtml = ref.type === 'supplier' && ref.reward_amount
                ? `<div style="font-weight: 600; color: #10B981;">${formatCurrency(ref.reward_amount)}</div>`
                : (ref.type === 'buyer' && ref.credits_awarded
                    ? `<div style="font-weight: 600; color: #0B4F6C;">+${ref.credits_awarded} credits</div>`
                    : '<div style="color: #94A3B8;">Pending</div>');
            
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div style="flex: 1;">
                        <div style="font-weight: 500; margin-bottom: 4px;">
                            ${escapeHtml(name)}
                            <span style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; background: ${typeClass === 'supplier' ? '#FEF3C7' : '#E0E7FF'}; color: ${typeClass === 'supplier' ? '#D97706' : '#0B4F6C'};">${typeLabel}</span>
                            <span style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; background: ${statusClass === 'verified' ? '#D1FAE5' : '#FEF3C7'}; color: ${statusClass === 'verified' ? '#10B981' : '#F59E0B'};">${statusLabel}</span>
                        </div>
                        <div style="font-size: 12px; color: #64748B;">${formatDate(ref.created_at)}</div>
                    </div>
                    <div>${rewardHtml}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent referrals:', error);
        const container = document.getElementById('recentReferralsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #EF4444; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">Error loading referrals. Please refresh.</p>
                </div>
            `;
        }
    }
}

// ============================================
// SHARE FUNCTIONS
// ============================================

function shareWhatsapp() {
    if (!referralCode) return;
    const link = `https://buyuganda.online/register.html?ref=${referralCode}`;
    const message = `🎉 Join BuyUganda.online - Uganda's Premier B2B Marketplace! Use my referral code: ${referralCode} to get started. Sign up here: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}

function shareSms() {
    if (!referralCode) return;
    const link = `https://buyuganda.online/register.html?ref=${referralCode}`;
    const message = `Join BuyUganda.online! Use referral code: ${referralCode} to get started. ${link}`;
    window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank');
}

function shareCopyLink() {
    const linkElement = document.getElementById('referralLink');
    const link = linkElement?.getAttribute('data-link') || linkElement?.textContent;
    if (link) copyToClipboard(link);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
        if (referralCode) copyToClipboard(referralCode);
    });
    
    document.getElementById('shareWhatsapp')?.addEventListener('click', shareWhatsapp);
    document.getElementById('shareSms')?.addEventListener('click', shareSms);
    document.getElementById('shareCopy')?.addEventListener('click', shareCopyLink);
    document.getElementById('shareBtn')?.addEventListener('click', shareWhatsapp);
    
    document.getElementById('withdrawCashBtn')?.addEventListener('click', () => {
        window.location.href = 'referral-withdraw.html';
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading(true, 'Loading dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) {
        showLoading(false);
        return;
    }
    
    await loadSettings();
    await loadReferralCode();
    await loadEarnings();
    await loadReferralStats();
    await loadRecentReferrals();
    
    showLoading(false);
    setupEventListeners();
}

document.addEventListener('DOMContentLoaded', init);

// Make functions global
window.shareWhatsapp = shareWhatsapp;
window.shareSms = shareSms;
window.shareCopyLink = shareCopyLink;
