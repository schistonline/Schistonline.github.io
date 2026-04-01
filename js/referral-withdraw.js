// ============================================
// REFERRAL WITHDRAWAL - COMPLETE STANDALONE VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let currentUser = null;
let earnings = null;
let settings = null;
let currentWithdrawType = 'cash';
let recentPayouts = [];

// ============================================
// UTILITY FUNCTIONS
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
            white-space: nowrap;
            font-weight: 500;
        `;
        document.body.appendChild(toast);
    }
    
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#6B21E5',
        warning: '#F59E0B'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
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

function getCreditValue(credits) {
    if (!settings || !credits) return 0;
    const ratio = (settings.cash_payout_value || 10000) / (settings.credits_needed_for_payout || 1000);
    return credits * ratio;
}

function validatePhoneNumber(phone) {
    // Ugandan phone number validation
    const phoneRegex = /^(?:\+256|0)[0-9]{9}$/;
    return phoneRegex.test(phone);
}

function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If starts with 0, replace with +256
    if (cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '+256' + cleaned.substring(1);
    }
    // If starts with 256 without +, add +
    else if (cleaned.startsWith('256') && cleaned.length === 12) {
        cleaned = '+' + cleaned;
    }
    // If already has +256, keep as is
    else if (cleaned.startsWith('256') && cleaned.length === 12 && !cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }
    
    return cleaned;
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            currentUser = null;
            window.location.href = 'login.html?redirect=referral-withdraw.html';
            return false;
        }
        currentUser = user;
        return true;
    } catch (error) {
        console.error('Auth error:', error);
        currentUser = null;
        return false;
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadEarnings() {
    try {
        // Get user credits
        const { data: credits, error: creditsError } = await sb
            .from('user_credits')
            .select('credit_balance, cash_balance, total_earned')
            .eq('user_id', currentUser.id)
            .single();
        
        if (creditsError && creditsError.code !== 'PGRST116') {
            console.error('Error loading credits:', creditsError);
        }
        
        // Get wallet balance
        const { data: wallet, error: walletError } = await sb
            .from('wallets')
            .select('marketer_balance')
            .eq('user_id', currentUser.id)
            .single();
        
        earnings = {
            credit_balance: credits?.credit_balance || 0,
            cash_balance: wallet?.marketer_balance || credits?.cash_balance || 0,
            total_earned: credits?.total_earned || wallet?.total_earned || 0
        };
        
        // Update UI
        const cashElement = document.getElementById('cashBalance');
        const creditElement = document.getElementById('creditBalance');
        const creditValueElement = document.getElementById('creditValue');
        
        if (cashElement) cashElement.textContent = formatCurrency(earnings.cash_balance);
        if (creditElement) creditElement.textContent = earnings.credit_balance;
        
        if (creditValueElement && settings) {
            const creditValue = getCreditValue(earnings.credit_balance);
            creditValueElement.textContent = `= ${formatCurrency(creditValue)}`;
        }
        
    } catch (error) {
        console.error('Error loading earnings:', error);
        earnings = {
            credit_balance: 0,
            cash_balance: 0,
            total_earned: 0
        };
    }
}

async function loadSettings() {
    try {
        const { data, error } = await sb
            .from('referral_settings')
            .select('*')
            .eq('id', 1)
            .single();
        
        if (error) throw error;
        
        settings = data || {
            supplier_reward_min: 5000,
            supplier_reward_max: 15000,
            buyer_credits_per_signup: 30,
            credits_needed_for_payout: 1000,
            cash_payout_value: 10000,
            max_payout_per_day: 50000
        };
        
        // Update hints
        const cashHint = document.getElementById('cashHint');
        const creditsHint = document.getElementById('creditsHint');
        
        if (cashHint) cashHint.textContent = `Min UGX ${(settings.supplier_reward_min || 5000).toLocaleString()}`;
        if (creditsHint) creditsHint.textContent = `${settings.credits_needed_for_payout || 1000} credits = ${formatCurrency(settings.cash_payout_value || 10000)}`;
        
    } catch (error) {
        console.error('Error loading settings:', error);
        settings = {
            supplier_reward_min: 5000,
            supplier_reward_max: 15000,
            buyer_credits_per_signup: 30,
            credits_needed_for_payout: 1000,
            cash_payout_value: 10000,
            max_payout_per_day: 50000
        };
    }
}

async function loadRecentPayouts() {
    try {
        const { data, error } = await sb
            .from('payout_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        recentPayouts = data || [];
        
        const container = document.getElementById('payoutsList');
        if (!container) return;
        
        if (recentPayouts.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-receipt" style="font-size: 40px; color: #94A3B8; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">No withdrawal requests yet</p>
                </div>
            `;
            return;
        }
        
        const statusColors = {
            pending: { color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' },
            processing: { color: '#6B21E5', bg: '#EDE9FE', icon: '🔄' },
            completed: { color: '#10B981', bg: '#D1FAE5', icon: '✓' },
            failed: { color: '#EF4444', bg: '#FEE2E2', icon: '✗' },
            rejected: { color: '#EF4444', bg: '#FEE2E2', icon: '✗' }
        };
        
        container.innerHTML = recentPayouts.map(payout => {
            const status = statusColors[payout.status] || statusColors.pending;
            const isCash = !payout.credits_used || payout.credits_used === 0;
            
            return `
                <div class="payout-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div class="payout-info">
                        <div class="payout-amount" style="font-weight: 600; margin-bottom: 4px;">
                            ${formatCurrency(payout.amount)}
                            ${isCash ? '<span style="font-size: 11px; color: #64748B; font-weight: normal;"> (Cash)</span>' : `<span style="font-size: 11px; color: #64748B; font-weight: normal;"> (${payout.credits_used} credits)</span>`}
                        </div>
                        <div class="payout-details" style="font-size: 12px; color: #64748B;">
                            ${payout.network} • ${payout.phone_number}
                        </div>
                        <div class="payout-date" style="font-size: 11px; color: #94A3B8; margin-top: 4px;">
                            ${formatDate(payout.created_at)}
                        </div>
                    </div>
                    <div class="payout-status" style="padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; background: ${status.bg}; color: ${status.color};">
                        ${status.icon} ${payout.status.toUpperCase()}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent payouts:', error);
        const container = document.getElementById('payoutsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #EF4444; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">Error loading withdrawal history</p>
                </div>
            `;
        }
    }
}

// ============================================
// WITHDRAWAL FUNCTIONS
// ============================================

async function requestWithdrawal(amount, creditsUsed, phoneNumber, network) {
    try {
        // Check if user has enough balance
        if (currentWithdrawType === 'cash') {
            if (amount > earnings.cash_balance) {
                throw new Error(`Insufficient cash balance. You have ${formatCurrency(earnings.cash_balance)}`);
            }
        } else {
            if (creditsUsed > earnings.credit_balance) {
                throw new Error(`Insufficient credits. You have ${earnings.credit_balance} credits`);
            }
        }
        
        // Check minimum amount
        const minAmount = settings.supplier_reward_min || 5000;
        if (amount < minAmount) {
            throw new Error(`Minimum withdrawal is ${formatCurrency(minAmount)}`);
        }
        
        // Check daily limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: todayPayouts, error: dailyError } = await sb
            .from('payout_requests')
            .select('amount')
            .eq('user_id', currentUser.id)
            .gte('created_at', today.toISOString())
            .in('status', ['pending', 'processing', 'completed']);
        
        if (!dailyError && todayPayouts) {
            const todayTotal = todayPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
            const maxDaily = settings.max_payout_per_day || 50000;
            
            if (todayTotal + amount > maxDaily) {
                throw new Error(`Daily withdrawal limit is ${formatCurrency(maxDaily)}. You have ${formatCurrency(todayTotal)} today.`);
            }
        }
        
        // Create payout request
        const { data, error } = await sb
            .from('payout_requests')
            .insert({
                user_id: currentUser.id,
                amount: amount,
                credits_used: creditsUsed || 0,
                phone_number: formatPhoneNumber(phoneNumber),
                network: network,
                status: 'pending'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return { success: true, data };
        
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// FORM VALIDATION
// ============================================

function validateForm() {
    const submitBtn = document.getElementById('submitWithdraw');
    if (!submitBtn) return false;
    
    let isValid = true;
    let errorMessage = '';
    
    const phone = document.getElementById('phoneNumber')?.value;
    if (!phone || !validatePhoneNumber(phone)) {
        isValid = false;
        errorMessage = 'Please enter a valid Ugandan phone number (e.g., 0777123456 or +256777123456)';
    }
    
    if (currentWithdrawType === 'cash') {
        const cashAmount = parseFloat(document.getElementById('cashAmount')?.value) || 0;
        const minAmount = settings?.supplier_reward_min || 5000;
        const maxAmount = earnings?.cash_balance || 0;
        
        if (cashAmount < minAmount) {
            isValid = false;
            errorMessage = `Minimum withdrawal is ${formatCurrency(minAmount)}`;
        } else if (cashAmount > maxAmount) {
            isValid = false;
            errorMessage = `Insufficient cash balance. You have ${formatCurrency(maxAmount)}`;
        } else if (cashAmount <= 0) {
            isValid = false;
            errorMessage = 'Please enter a valid amount';
        }
    } else {
        const credits = parseInt(document.getElementById('creditsAmount')?.value) || 0;
        const minCredits = settings?.credits_needed_for_payout || 1000;
        const maxCredits = earnings?.credit_balance || 0;
        
        if (credits < minCredits) {
            isValid = false;
            errorMessage = `Minimum ${minCredits.toLocaleString()} credits required`;
        } else if (credits > maxCredits) {
            isValid = false;
            errorMessage = `Insufficient credits. You have ${maxCredits.toLocaleString()} credits`;
        } else if (credits <= 0) {
            isValid = false;
            errorMessage = 'Please enter a valid number of credits';
        }
    }
    
    if (errorMessage) {
        showToast(errorMessage, 'error');
    }
    
    submitBtn.disabled = !isValid;
    submitBtn.style.opacity = isValid ? '1' : '0.5';
    submitBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
    
    return isValid;
}

function updateConversionPreview() {
    const creditsInput = document.getElementById('creditsAmount');
    const preview = document.getElementById('conversionPreview');
    
    if (!creditsInput || !preview || !settings) return;
    
    const credits = parseInt(creditsInput.value) || 0;
    const amount = getCreditValue(credits);
    
    preview.textContent = formatCurrency(amount);
    
    // Also update the hidden amount for submission
    if (amount > 0) {
        const hiddenAmount = document.getElementById('convertedAmount');
        if (hiddenAmount) hiddenAmount.value = amount;
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleSubmitWithdrawal() {
    if (!validateForm()) return;
    
    const phone = document.getElementById('phoneNumber')?.value;
    const network = document.getElementById('selectedNetwork')?.value;
    
    if (!phone || !validatePhoneNumber(phone)) {
        showToast('Please enter a valid phone number', 'error');
        return;
    }
    
    let amount = 0;
    let creditsUsed = 0;
    
    if (currentWithdrawType === 'cash') {
        amount = parseFloat(document.getElementById('cashAmount')?.value) || 0;
        
        if (amount > (earnings?.cash_balance || 0)) {
            showToast('Insufficient cash balance', 'error');
            return;
        }
    } else {
        creditsUsed = parseInt(document.getElementById('creditsAmount')?.value) || 0;
        const ratio = (settings?.cash_payout_value || 10000) / (settings?.credits_needed_for_payout || 1000);
        amount = creditsUsed * ratio;
        
        if (creditsUsed > (earnings?.credit_balance || 0)) {
            showToast('Insufficient credits', 'error');
            return;
        }
    }
    
    if (amount < (settings?.supplier_reward_min || 5000)) {
        showToast(`Minimum withdrawal is ${formatCurrency(settings?.supplier_reward_min || 5000)}`, 'error');
        return;
    }
    
    showLoading(true, 'Processing withdrawal request...');
    
    const result = await requestWithdrawal(amount, creditsUsed, phone, network);
    
    showLoading(false);
    
    if (result.success) {
        showToast('Withdrawal request submitted successfully! We\'ll process it shortly.', 'success');
        
        // Reset form
        document.getElementById('cashAmount').value = '';
        document.getElementById('creditsAmount').value = '';
        document.getElementById('phoneNumber').value = '';
        
        // Refresh balances
        await loadEarnings();
        await loadRecentPayouts();
        
        // Show success and redirect after 3 seconds
        setTimeout(() => {
            window.location.href = 'referral-dashboard.html';
        }, 3000);
    } else {
        showToast(result.error || 'Failed to submit withdrawal request', 'error');
    }
}

function setupEventListeners() {
    // Tab switching
    const tabs = document.querySelectorAll('.option-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.getAttribute('data-type');
            currentWithdrawType = type;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update forms
            const cashForm = document.getElementById('cashForm');
            const creditsForm = document.getElementById('creditsForm');
            
            if (cashForm) cashForm.classList.toggle('active', type === 'cash');
            if (creditsForm) creditsForm.classList.toggle('active', type === 'credits');
            
            // Reset validation
            validateForm();
        });
    });
    
    // Network selection
    const networkBtns = document.querySelectorAll('.network-btn');
    networkBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const network = btn.getAttribute('data-network');
            const selectedNetwork = document.getElementById('selectedNetwork');
            if (selectedNetwork) selectedNetwork.value = network;
            
            networkBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            validateForm();
        });
    });
    
    // Credits amount input
    const creditsInput = document.getElementById('creditsAmount');
    if (creditsInput) {
        creditsInput.addEventListener('input', () => {
            updateConversionPreview();
            validateForm();
        });
        creditsInput.addEventListener('change', validateForm);
    }
    
    // Cash amount input
    const cashInput = document.getElementById('cashAmount');
    if (cashInput) {
        cashInput.addEventListener('input', validateForm);
        cashInput.addEventListener('change', validateForm);
    }
    
    // Phone input
    const phoneInput = document.getElementById('phoneNumber');
    if (phoneInput) {
        phoneInput.addEventListener('input', validateForm);
        phoneInput.addEventListener('change', validateForm);
    }
    
    // Submit button
    const submitBtn = document.getElementById('submitWithdraw');
    if (submitBtn) {
        submitBtn.addEventListener('click', handleSubmitWithdrawal);
    }
    
    // Format phone number on blur
    if (phoneInput) {
        phoneInput.addEventListener('blur', () => {
            let phone = phoneInput.value;
            if (phone && !validatePhoneNumber(phone)) {
                showToast('Please enter a valid Ugandan phone number', 'warning');
            }
        });
    }
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading(true, 'Loading withdrawal options...');
    
    const isAuth = await checkAuth();
    if (!isAuth) {
        showLoading(false);
        return;
    }
    
    await Promise.all([
        loadSettings(),
        loadEarnings(),
        loadRecentPayouts()
    ]);
    
    showLoading(false);
    setupEventListeners();
    
    // Set default network
    const defaultNetwork = document.querySelector('.network-btn.active');
    if (defaultNetwork) {
        const network = defaultNetwork.getAttribute('data-network');
        const selectedNetwork = document.getElementById('selectedNetwork');
        if (selectedNetwork) selectedNetwork.value = network;
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Make functions global if needed
window.validateForm = validateForm;
window.updateConversionPreview = updateConversionPreview;