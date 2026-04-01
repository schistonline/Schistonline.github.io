// ============================================
// MARKETER DASHBOARD - COMPLETE STANDALONE VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let currentUser = null;
let earningsChart = null;
let currentChartPeriod = 'week';
let currentHistoryPage = 1;
let historyTotalPages = 1;
let currentHistoryFilter = 'all';
let allEarningsHistory = [];

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

function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-UG');
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

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            currentUser = null;
            window.location.href = 'login.html?redirect=marketer-dashboard.html';
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
// DASHBOARD DATA LOADING
// ============================================

async function loadDashboardData() {
    try {
        // Get wallet balance
        const { data: wallet, error: walletError } = await sb
            .from('wallets')
            .select('marketer_balance, total_earned')
            .eq('user_id', currentUser.id)
            .single();
        
        if (!walletError && wallet) {
            const balanceEl = document.getElementById('availableBalance');
            const totalEl = document.getElementById('totalEarned');
            const withdrawBalanceEl = document.getElementById('withdrawBalance');
            
            if (balanceEl) balanceEl.textContent = formatCurrency(wallet.marketer_balance || 0);
            if (totalEl) totalEl.textContent = formatCurrency(wallet.total_earned || 0);
            if (withdrawBalanceEl) withdrawBalanceEl.textContent = formatCurrency(wallet.marketer_balance || 0);
        } else {
            // Try user_credits as fallback
            const { data: credits, error: creditsError } = await sb
                .from('user_credits')
                .select('cash_balance, total_earned')
                .eq('user_id', currentUser.id)
                .single();
            
            if (!creditsError && credits) {
                const balanceEl = document.getElementById('availableBalance');
                const totalEl = document.getElementById('totalEarned');
                const withdrawBalanceEl = document.getElementById('withdrawBalance');
                
                if (balanceEl) balanceEl.textContent = formatCurrency(credits.cash_balance || 0);
                if (totalEl) totalEl.textContent = formatCurrency(credits.total_earned || 0);
                if (withdrawBalanceEl) withdrawBalanceEl.textContent = formatCurrency(credits.cash_balance || 0);
            }
        }
        
        // Get leads stats
        const { data: leads, error: leadsError } = await sb
            .from('leads')
            .select('id, status, reward_amount')
            .eq('marketer_id', currentUser.id);
        
        if (!leadsError && leads) {
            const totalLeads = leads.length;
            const verifiedLeads = leads.filter(l => l.status === 'verified').length;
            const totalEarnedFromLeads = leads.reduce((sum, l) => sum + (l.reward_amount || 0), 0);
            
            const totalLeadsEl = document.getElementById('totalLeads');
            const verifiedLeadsEl = document.getElementById('verifiedLeads');
            
            if (totalLeadsEl) totalLeadsEl.textContent = totalLeads;
            if (verifiedLeadsEl) verifiedLeadsEl.textContent = `${verifiedLeads} verified`;
            
            // Calculate conversion rate
            const conversionRate = totalLeads > 0 ? Math.round((verifiedLeads / totalLeads) * 100) : 0;
            const conversionRateEl = document.getElementById('conversionRate');
            if (conversionRateEl) conversionRateEl.textContent = `${conversionRate}%`;
        }
        
        // Get active campaigns count
        const { data: activeCampaigns, error: campaignsError } = await sb
            .from('marketer_campaigns')
            .select('id')
            .eq('marketer_id', currentUser.id)
            .eq('status', 'active');
        
        if (!campaignsError) {
            const activeEl = document.getElementById('activeCampaigns');
            if (activeEl) activeEl.textContent = activeCampaigns?.length || 0;
        }
        
        // Get this month's earnings
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const { data: monthlyLeads, error: monthlyError } = await sb
            .from('leads')
            .select('reward_amount')
            .eq('marketer_id', currentUser.id)
            .eq('status', 'verified')
            .gte('verified_at', startOfMonth.toISOString());
        
        if (!monthlyError && monthlyLeads) {
            const monthlyTotal = monthlyLeads.reduce((sum, l) => sum + (l.reward_amount || 0), 0);
            const thisMonthEl = document.getElementById('thisMonthEarnings');
            if (thisMonthEl) thisMonthEl.textContent = formatCurrency(monthlyTotal);
        }
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// ============================================
// CHART FUNCTIONS
// ============================================

async function loadChartData() {
    try {
        let startDate;
        const now = new Date();
        
        switch (currentChartPeriod) {
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 30);
                break;
            case 'year':
                startDate = new Date(now);
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
        }
        
        const { data: leads, error } = await sb
            .from('leads')
            .select('verified_at, reward_amount')
            .eq('marketer_id', currentUser.id)
            .eq('status', 'verified')
            .gte('verified_at', startDate.toISOString())
            .order('verified_at', { ascending: true });
        
        if (error) throw error;
        
        // Group by date
        const dailyEarnings = {};
        leads.forEach(lead => {
            const date = new Date(lead.verified_at).toLocaleDateString('en-UG');
            dailyEarnings[date] = (dailyEarnings[date] || 0) + (lead.reward_amount || 0);
        });
        
        const labels = Object.keys(dailyEarnings);
        const values = Object.values(dailyEarnings);
        
        updateChart(labels, values);
        
    } catch (error) {
        console.error('Error loading chart data:', error);
    }
}

function initChart() {
    const ctx = document.getElementById('earningsChart')?.getContext('2d');
    if (!ctx) return;
    
    earningsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Earnings (UGX)',
                data: [],
                borderColor: '#6B21E5',
                backgroundColor: 'rgba(107, 33, 229, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#6B21E5',
                pointBorderColor: 'white',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `UGX ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'UGX ' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateChart(labels, values) {
    if (earningsChart) {
        earningsChart.data.labels = labels;
        earningsChart.data.datasets[0].data = values;
        earningsChart.update();
    }
}

// ============================================
// ACTIVE CAMPAIGNS
// ============================================

async function loadActiveCampaigns() {
    try {
        const { data: campaigns, error } = await sb
            .from('marketer_campaigns')
            .select(`
                id,
                unique_link,
                clicks,
                leads,
                earnings,
                campaigns:campaign_id (
                    id,
                    name,
                    cost_per_lead,
                    image_url,
                    ads:ad_id (
                        title,
                        image_urls
                    )
                )
            `)
            .eq('marketer_id', currentUser.id)
            .eq('status', 'active')
            .order('joined_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('activeCampaignsList');
        if (!container) return;
        
        if (!campaigns || campaigns.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-rocket" style="font-size: 40px; color: #94A3B8; margin-bottom: 12px;"></i>
                    <p style="color: #64748B; margin-bottom: 16px;">You're not promoting any campaigns yet.</p>
                    <a href="campaigns.html" style="display: inline-block; padding: 10px 20px; background: #6B21E5; color: white; text-decoration: none; border-radius: 30px; font-size: 14px;">
                        Browse Campaigns
                    </a>
                </div>
            `;
            return;
        }
        
        container.innerHTML = campaigns.map(mc => {
            const campaignData = mc.campaigns;
            const campaignName = campaignData?.name || 'Unknown Campaign';
            const costPerLead = campaignData?.cost_per_lead || 0;
            const imageUrl = campaignData?.image_url || campaignData?.ads?.image_urls?.[0] || 'https://via.placeholder.com/60x60/6B21E5/FFFFFF?text=Ad';
            const conversionRate = mc.clicks > 0 ? Math.round((mc.leads / mc.clicks) * 100) : 0;
            
            return `
                <div class="campaign-card" style="display: flex; align-items: center; padding: 16px; background: white; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div class="campaign-icon" style="width: 50px; height: 50px; border-radius: 12px; overflow: hidden; margin-right: 12px;">
                        <img src="${imageUrl}" alt="${escapeHtml(campaignName)}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="campaign-info" style="flex: 1;">
                        <div class="campaign-name" style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(campaignName)}</div>
                        <div class="campaign-stats" style="display: flex; gap: 12px; font-size: 12px; color: #64748B;">
                            <span><i class="fas fa-eye"></i> ${mc.clicks || 0} clicks</span>
                            <span><i class="fas fa-users"></i> ${mc.leads || 0} leads</span>
                            <span><i class="fas fa-chart-line"></i> ${conversionRate}% CR</span>
                        </div>
                    </div>
                    <div class="campaign-reward" style="text-align: right;">
                        <div class="reward-amount" style="font-weight: 600; color: #10B981;">${formatCurrency(costPerLead)}</div>
                        <div class="reward-label" style="font-size: 11px; color: #64748B;">per lead</div>
                        <button onclick="shareCampaignLink('${mc.unique_link}', '${escapeHtml(campaignName)}', ${costPerLead})" style="margin-top: 6px; padding: 4px 12px; background: #F1F5F9; border: none; border-radius: 20px; font-size: 11px; cursor: pointer;">
                            <i class="fas fa-share-alt"></i> Share
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading active campaigns:', error);
    }
}

// ============================================
// RECENT EARNINGS
// ============================================

async function loadRecentEarnings() {
    try {
        const { data: leads, error } = await sb
            .from('leads')
            .select(`
                id,
                lead_type,
                reward_amount,
                verified_at,
                created_at,
                campaigns:campaign_id (
                    name
                )
            `)
            .eq('marketer_id', currentUser.id)
            .eq('status', 'verified')
            .order('verified_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        const container = document.getElementById('recentEarningsList');
        if (!container) return;
        
        if (!leads || leads.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-history" style="font-size: 40px; color: #94A3B8; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">No earnings yet. Start promoting campaigns!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = leads.map(lead => {
            const leadTypeIcon = {
                'whatsapp': 'fab fa-whatsapp',
                'call': 'fas fa-phone',
                'signup': 'fas fa-user-plus',
                'inquiry': 'fas fa-envelope',
                'click': 'fas fa-mouse-pointer'
            }[lead.lead_type] || 'fas fa-star';
            
            const leadTypeLabel = (lead.lead_type || 'lead').toUpperCase();
            
            return `
                <div class="earning-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div class="earning-info" style="display: flex; align-items: center; gap: 12px;">
                        <div class="earning-icon" style="width: 36px; height: 36px; background: #F1F5F9; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #6B21E5;">
                            <i class="${leadTypeIcon}"></i>
                        </div>
                        <div class="earning-details">
                            <h4 style="font-weight: 500; margin-bottom: 2px;">${escapeHtml(lead.campaigns?.name || 'Campaign')}</h4>
                            <p style="font-size: 11px; color: #64748B;">${leadTypeLabel} lead • ${formatDate(lead.verified_at || lead.created_at)}</p>
                        </div>
                    </div>
                    <div class="earning-amount">
                        <div class="earning-value" style="font-weight: 600; color: #10B981;">+${formatCurrency(lead.reward_amount || 0)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recent earnings:', error);
    }
}

// ============================================
// LEADERBOARD
// ============================================

async function loadLeaderboard() {
    try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const { data, error } = await sb
            .from('leads')
            .select(`
                marketer_id,
                reward_amount,
                profiles:marketer_id (full_name)
            `)
            .eq('status', 'verified')
            .gte('verified_at', weekAgo.toISOString());
        
        if (error) throw error;
        
        // Aggregate earnings by marketer
        const earningsMap = new Map();
        data.forEach(lead => {
            const marketerId = lead.marketer_id;
            const current = earningsMap.get(marketerId) || { 
                total: 0, 
                name: lead.profiles?.full_name || 'Anonymous' 
            };
            current.total += lead.reward_amount || 0;
            earningsMap.set(marketerId, current);
        });
        
        // Convert to array and sort
        const leaderboard = Array.from(earningsMap.entries())
            .map(([id, data]) => ({ id, name: data.name, total: data.total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
        
        const container = document.getElementById('leaderboardList');
        if (!container) return;
        
        if (leaderboard.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 32px 20px;">
                    <i class="fas fa-trophy" style="font-size: 40px; color: #94A3B8; margin-bottom: 12px;"></i>
                    <p style="color: #64748B;">No earnings recorded this week yet.</p>
                    <p style="color: #64748B; font-size: 12px;">Be the first to earn!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = leaderboard.map((item, index) => {
            let rankClass = '';
            let rankColor = '';
            
            if (index === 0) {
                rankClass = '🥇';
                rankColor = '#F59E0B';
            } else if (index === 1) {
                rankClass = '🥈';
                rankColor = '#94A3B8';
            } else if (index === 2) {
                rankClass = '🥉';
                rankColor = '#CD7F32';
            } else {
                rankClass = `${index + 1}`;
                rankColor = '#64748B';
            }
            
            return `
                <div class="leaderboard-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div class="leaderboard-rank" style="width: 40px; font-size: 20px; font-weight: 600; color: ${rankColor};">${rankClass}</div>
                    <div class="leaderboard-info" style="flex: 1;">
                        <div class="leaderboard-name" style="font-weight: 500;">${escapeHtml(item.name)}</div>
                        <div class="leaderboard-stats" style="font-size: 11px; color: #64748B;">${Math.floor(item.total / 1000)}k earned</div>
                    </div>
                    <div class="leaderboard-earnings" style="font-weight: 600; color: #10B981;">${formatCurrency(item.total)}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// ============================================
// EARNINGS HISTORY
// ============================================

async function loadEarningsHistory(page = 1, filter = 'all') {
    const limit = 20;
    const offset = (page - 1) * limit;
    
    try {
        let allItems = [];
        
        if (filter === 'all' || filter === 'lead') {
            const { data: leads, error: leadsError } = await sb
                .from('leads')
                .select('*')
                .eq('marketer_id', currentUser.id)
                .eq('status', 'verified')
                .order('verified_at', { ascending: false });
            
            if (!leadsError && leads) {
                const leadItems = leads.map(l => ({
                    ...l,
                    type: 'lead',
                    display_date: l.verified_at || l.created_at,
                    amount: l.reward_amount || 0,
                    description: `${l.lead_type?.toUpperCase() || 'Lead'} from campaign`
                }));
                allItems = [...allItems, ...leadItems];
            }
        }
        
        if (filter === 'all' || filter === 'withdrawal') {
            const { data: withdrawals, error: withdrawalsError } = await sb
                .from('payout_requests')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            
            if (!withdrawalsError && withdrawals) {
                const withdrawalItems = withdrawals.map(w => ({
                    ...w,
                    type: 'withdrawal',
                    display_date: w.created_at,
                    amount: -w.amount,
                    description: `Withdrawal to ${w.network} ${w.phone_number}`
                }));
                allItems = [...allItems, ...withdrawalItems];
            }
        }
        
        // Sort by date
        allItems.sort((a, b) => new Date(b.display_date) - new Date(a.display_date));
        
        const totalCount = allItems.length;
        historyTotalPages = Math.ceil(totalCount / limit);
        
        const paginatedItems = allItems.slice(offset, offset + limit);
        allEarningsHistory = paginatedItems;
        
        return paginatedItems;
        
    } catch (error) {
        console.error('Error loading earnings history:', error);
        return [];
    }
}

function renderEarningsHistory(items) {
    const container = document.getElementById('earningsHistoryList');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 48px 20px;">
                <i class="fas fa-history" style="font-size: 48px; color: #94A3B8; margin-bottom: 16px;"></i>
                <p style="color: #64748B;">No transaction history</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = items.map(item => {
        if (item.type === 'lead') {
            return `
                <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div class="history-info">
                        <h4 style="font-weight: 500; margin-bottom: 2px;">${escapeHtml(item.campaigns?.name || 'Campaign Lead')}</h4>
                        <p style="font-size: 11px; color: #64748B;">${item.lead_type?.toUpperCase() || 'Lead'} • ${formatDateTime(item.display_date)}</p>
                    </div>
                    <div class="history-amount" style="font-weight: 600; color: #10B981;">+${formatCurrency(item.amount)}</div>
                </div>
            `;
        } else {
            const statusColors = {
                pending: '#F59E0B',
                processing: '#6B21E5',
                completed: '#10B981',
                failed: '#EF4444',
                rejected: '#EF4444'
            };
            
            return `
                <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                    <div class="history-info">
                        <h4 style="font-weight: 500; margin-bottom: 2px;">Withdrawal</h4>
                        <p style="font-size: 11px; color: #64748B;">${item.network} • ${item.phone_number}</p>
                        <p style="font-size: 10px; color: ${statusColors[item.status] || '#64748B'};">Status: ${item.status.toUpperCase()}</p>
                    </div>
                    <div class="history-amount" style="font-weight: 600; color: #EF4444;">-${formatCurrency(Math.abs(item.amount))}</div>
                </div>
            `;
        }
    }).join('');
}

function renderPagination() {
    const container = document.getElementById('historyPagination');
    if (!container) return;
    
    if (historyTotalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">';
    
    // Previous button
    if (currentHistoryPage > 1) {
        html += `<button class="page-btn" data-page="${currentHistoryPage - 1}" style="padding: 6px 12px; background: #F1F5F9; border: none; border-radius: 8px; cursor: pointer;">← Prev</button>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, currentHistoryPage - 2);
    const endPage = Math.min(historyTotalPages, currentHistoryPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentHistoryPage;
        html += `<button class="page-btn ${isActive ? 'active' : ''}" data-page="${i}" style="padding: 6px 12px; background: ${isActive ? '#6B21E5' : '#F1F5F9'}; color: ${isActive ? 'white' : '#1E293B'}; border: none; border-radius: 8px; cursor: pointer;">${i}</button>`;
    }
    
    // Next button
    if (currentHistoryPage < historyTotalPages) {
        html += `<button class="page-btn" data-page="${currentHistoryPage + 1}" style="padding: 6px 12px; background: #F1F5F9; border: none; border-radius: 8px; cursor: pointer;">Next →</button>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // Add event listeners
    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            currentHistoryPage = parseInt(btn.getAttribute('data-page'));
            await loadAndShowHistory(currentHistoryPage, currentHistoryFilter);
        });
    });
}

async function loadAndShowHistory(page, filter) {
    showLoading(true, 'Loading history...');
    currentHistoryFilter = filter;
    const transactions = await loadEarningsHistory(page, filter);
    renderEarningsHistory(transactions);
    renderPagination();
    showLoading(false);
}

// ============================================
// WITHDRAWAL FUNCTIONS
// ============================================

async function requestWithdrawal(amount, phone, network) {
    showLoading(true, 'Processing withdrawal request...');
    
    try {
        // Get current balance
        const { data: wallet, error: walletError } = await sb
            .from('wallets')
            .select('marketer_balance')
            .eq('user_id', currentUser.id)
            .single();
        
        if (walletError) throw walletError;
        
        if ((wallet?.marketer_balance || 0) < amount) {
            throw new Error('Insufficient balance');
        }
        
        // Create payout request
        const { data, error } = await sb
            .from('payout_requests')
            .insert({
                user_id: currentUser.id,
                amount: amount,
                credits_used: 0,
                phone_number: phone,
                network: network,
                status: 'pending'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        showToast('Withdrawal request submitted successfully!', 'success');
        
        // Refresh balance
        await loadDashboardData();
        
        return true;
        
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        showToast(error.message || 'Failed to submit withdrawal request', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ============================================
// SHARE FUNCTIONS
// ============================================

function shareCampaignLink(link, campaignName, reward) {
    const message = `💰 Earn UGX ${reward.toLocaleString()} per lead! Promote "${campaignName}" on Schist.online. Join me and start earning: ${link}`;
    
    const shareModal = document.createElement('div');
    shareModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 2000;
        display: flex;
        align-items: flex-end;
        justify-content: center;
    `;
    shareModal.innerHTML = `
        <div style="background: white; width: 100%; max-width: 500px; border-radius: 24px 24px 0 0; padding: 24px 20px 32px;">
            <h4 style="margin-bottom: 20px;"><i class="fas fa-share-alt"></i> Share Campaign</h4>
            <button id="whatsappShareBtn" style="width: 100%; padding: 14px; background: #25D366; color: white; border: none; border-radius: 40px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;">
                <i class="fab fa-whatsapp"></i> WhatsApp
            </button>
            <button id="copyLinkBtn" style="width: 100%; padding: 14px; background: #F1F5F9; border: none; border-radius: 40px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;">
                <i class="fas fa-copy"></i> Copy Link
            </button>
            <button id="closeShareBtn" style="width: 100%; padding: 12px; background: none; border: none; margin-top: 12px; cursor: pointer;">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(shareModal);
    
    document.getElementById('whatsappShareBtn').onclick = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        shareModal.remove();
    };
    
    document.getElementById('copyLinkBtn').onclick = () => {
        copyToClipboard(link);
        shareModal.remove();
    };
    
    document.getElementById('closeShareBtn').onclick = () => shareModal.remove();
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Withdraw button
    const withdrawBtn = document.getElementById('withdrawBtnHeader');
    const quickWithdrawBtn = document.getElementById('quickWithdrawBtn');
    
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => openModal('withdrawModal'));
    }
    if (quickWithdrawBtn) {
        quickWithdrawBtn.addEventListener('click', () => openModal('withdrawModal'));
    }
    
    // Chart period filters
    const chartFilters = document.querySelectorAll('.chart-filter');
    chartFilters.forEach(filter => {
        filter.addEventListener('click', () => {
            chartFilters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            currentChartPeriod = filter.getAttribute('data-period');
            loadChartData();
        });
    });
    
    // Withdraw form
    const withdrawForm = document.getElementById('withdrawForm');
    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const amount = parseFloat(document.getElementById('withdrawAmount')?.value);
            const phone = document.getElementById('withdrawPhone')?.value;
            const network = document.getElementById('withdrawNetwork')?.value;
            
            if (amount < 10000) {
                showToast('Minimum withdrawal is UGX 10,000', 'error');
                return;
            }
            
            if (!phone || phone.length < 10) {
                showToast('Please enter a valid phone number', 'error');
                return;
            }
            
            await requestWithdrawal(amount, phone, network);
            closeModal('withdrawModal');
            withdrawForm.reset();
        });
    }
    
    // Network selection
    const networkBtns = document.querySelectorAll('.network-btn');
    networkBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            networkBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const networkInput = document.getElementById('withdrawNetwork');
            if (networkInput) networkInput.value = btn.getAttribute('data-network');
        });
    });
    
    // View all history button
    const viewHistoryBtn = document.getElementById('viewAllHistoryBtn');
    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', async () => {
            currentHistoryPage = 1;
            await loadAndShowHistory(1, 'all');
            openModal('earningsHistoryModal');
        });
    }
    
    // History filters
    const historyFilters = document.querySelectorAll('.history-filter');
    historyFilters.forEach(filter => {
        filter.addEventListener('click', async () => {
            historyFilters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            currentHistoryPage = 1;
            await loadAndShowHistory(1, filter.getAttribute('data-filter'));
        });
    });
    
    // Leaderboard view button
    const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
    if (viewLeaderboardBtn) {
        viewLeaderboardBtn.addEventListener('click', async () => {
            await loadFullLeaderboardAndShow('week');
            openModal('leaderboardModal');
        });
    }
    
    // Leaderboard tabs
    const leaderboardTabs = document.querySelectorAll('.leaderboard-tab');
    leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            leaderboardTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            await loadFullLeaderboardAndShow(tab.getAttribute('data-period'));
        });
    });
    
    // Close modals
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    // Click outside modal to close
    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
}

async function loadFullLeaderboardAndShow(period) {
    let startDate;
    const now = new Date();
    
    switch (period) {
        case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
        case 'month':
            startDate = new Date(now.setDate(now.getDate() - 30));
            break;
        case 'all':
            startDate = null;
            break;
    }
    
    let query = sb
        .from('leads')
        .select(`
            marketer_id,
            reward_amount,
            profiles:marketer_id (full_name)
        `)
        .eq('status', 'verified');
    
    if (startDate) {
        query = query.gte('verified_at', startDate.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Error loading leaderboard:', error);
        return;
    }
    
    // Aggregate earnings by marketer
    const earningsMap = new Map();
    data.forEach(lead => {
        const marketerId = lead.marketer_id;
        const current = earningsMap.get(marketerId) || { 
            total: 0, 
            name: lead.profiles?.full_name || 'Anonymous' 
        };
        current.total += lead.reward_amount || 0;
        earningsMap.set(marketerId, current);
    });
    
    const leaderboard = Array.from(earningsMap.entries())
        .map(([id, data]) => ({ id, name: data.name, total: data.total }))
        .sort((a, b) => b.total - a.total);
    
    const container = document.getElementById('fullLeaderboard');
    if (!container) return;
    
    if (leaderboard.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 48px 20px;">
                <i class="fas fa-trophy" style="font-size: 48px; color: #94A3B8; margin-bottom: 16px;"></i>
                <p style="color: #64748B;">No earnings recorded for this period</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = leaderboard.map((item, index) => {
        let rankClass = '';
        let rankColor = '';
        
        if (index === 0) {
            rankClass = '🥇';
            rankColor = '#F59E0B';
        } else if (index === 1) {
            rankClass = '🥈';
            rankColor = '#94A3B8';
        } else if (index === 2) {
            rankClass = '🥉';
            rankColor = '#CD7F32';
        } else {
            rankClass = `${index + 1}`;
            rankColor = '#64748B';
        }
        
        return `
            <div class="full-leaderboard-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                <div style="width: 50px; font-size: 24px; font-weight: 600; color: ${rankColor};">${rankClass}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${escapeHtml(item.name)}</div>
                    <div style="font-size: 12px; color: #64748B;">${Math.floor(item.total / 1000)}k total earned</div>
                </div>
                <div style="font-weight: 600; color: #10B981;">${formatCurrency(item.total)}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading(true, 'Loading your dashboard...');
    
    const isAuth = await checkAuth();
    if (!isAuth) {
        showLoading(false);
        return;
    }
    
    initChart();
    
    await Promise.all([
        loadDashboardData(),
        loadActiveCampaigns(),
        loadRecentEarnings(),
        loadLeaderboard(),
        loadChartData()
    ]);
    
    showLoading(false);
    setupEventListeners();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Make functions global for onclick
window.shareCampaignLink = shareCampaignLink;
window.closeModal = closeModal;
window.copyToClipboard = copyToClipboard;