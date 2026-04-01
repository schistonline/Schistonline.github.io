// ============================================
// ADMIN CAMPAIGN MANAGEMENT - COMPLETE UPDATED VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let currentUser = null;
let isAdmin = false;
let campaignStatusChart = null;
let leadsTimelineChart = null;
let currentPendingFilter = 'all';
let currentFraudFilter = 'all';
let currentPayoutFilter = 'pending';

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

// ============================================
// AUTHENTICATION
// ============================================

async function checkAdminAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            window.location.href = 'login.html?redirect=admin-campaigns.html';
            return false;
        }
        
        currentUser = user;
        
        // Check if user is admin
        const { data: profile, error: profileError } = await sb
            .from('profiles')
            .select('is_admin, admin_role')
            .eq('id', currentUser.id)
            .single();
        
        if (profileError || !profile || !profile.is_admin) {
            console.error('User is not an admin');
            return false;
        }
        
        isAdmin = true;
        
        // Update admin badge
        const adminBadge = document.getElementById('adminBadge');
        if (adminBadge) {
            adminBadge.textContent = profile.admin_role === 'super_admin' ? 'Super Admin' : 'Administrator';
        }
        
        return true;
        
    } catch (error) {
        console.error('Auth error:', error);
        return false;
    }
}

function showAccessDenied() {
    const content = document.querySelector('.admin-content');
    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-lock" style="font-size: 56px; color: #EF4444; margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 12px;">Access Denied</h3>
                <p style="color: #64748B; margin-bottom: 24px;">You don't have permission to access this page.</p>
                <a href="index.html" style="display: inline-block; padding: 12px 24px; background: #6B21E5; color: white; text-decoration: none; border-radius: 40px;">
                    Return to Home
                </a>
            </div>
        `;
    }
}

// ============================================
// DEBUG FUNCTION
// ============================================

async function debugCheckCampaigns() {
    console.log('=== DEBUG: Checking campaigns ===');
    
    // Check all campaigns
    const { data: allCampaigns, error } = await sb
        .from('campaigns')
        .select('id, name, status, supplier_id, created_at')
        .limit(20);
    
    if (error) {
        console.error('Error fetching campaigns:', error);
    } else {
        console.log('All campaigns in database:', allCampaigns);
        console.log('Total campaigns:', allCampaigns?.length || 0);
        
        const pending = allCampaigns?.filter(c => c.status === 'pending') || [];
        console.log('Pending campaigns:', pending);
        
        if (pending.length === 0) {
            console.log('⚠️ No pending campaigns found. Check:');
            console.log('  1. Any campaigns have status = "pending"');
            console.log('  2. Campaigns table has data');
            console.log('  3. RLS policies allow reading campaigns');
        } else {
            console.log(`✅ Found ${pending.length} pending campaigns`);
        }
    }
    
    return { campaigns: allCampaigns, pending: allCampaigns?.filter(c => c.status === 'pending') || [] };
}

// ============================================
// DASHBOARD STATS
// ============================================

async function loadDashboardStats() {
    try {
        // Get all campaigns
        const { data: allCampaigns, error: campaignsError } = await sb
            .from('campaigns')
            .select('id, status, spent, budget');
        
        if (!campaignsError && allCampaigns) {
            const total = allCampaigns.length;
            const pending = allCampaigns.filter(c => c.status === 'pending').length;
            const active = allCampaigns.filter(c => c.status === 'active').length;
            const totalSpent = allCampaigns.reduce((sum, c) => sum + (c.spent || 0), 0);
            
            const totalEl = document.getElementById('totalCampaigns');
            const pendingEl = document.getElementById('pendingCampaigns');
            const activeEl = document.getElementById('activeCampaignsCount');
            const payoutsEl = document.getElementById('totalPayouts');
            const pendingCountEl = document.getElementById('pendingCount');
            
            if (totalEl) totalEl.textContent = total;
            if (pendingEl) pendingEl.textContent = pending;
            if (activeEl) activeEl.textContent = active;
            if (payoutsEl) payoutsEl.textContent = formatCurrency(totalSpent);
            if (pendingCountEl) pendingCountEl.textContent = pending;
            
            updateCampaignStatusChart(allCampaigns);
        }
        
        // Get total leads
        const { data: allLeads, error: leadsError } = await sb
            .from('leads')
            .select('id');
        
        if (!leadsError && allLeads) {
            const totalLeadsEl = document.getElementById('totalLeads');
            if (totalLeadsEl) totalLeadsEl.textContent = allLeads.length;
        }
        
        // Get fraud alerts
        const { data: fraudAlerts, error: fraudError } = await sb
            .from('fraud_alerts')
            .select('id')
            .eq('status', 'pending');
        
        if (!fraudError && fraudAlerts) {
            const fraudAlertsEl = document.getElementById('fraudAlertsCount');
            const fraudCountEl = document.getElementById('fraudCount');
            if (fraudAlertsEl) fraudAlertsEl.textContent = fraudAlerts.length;
            if (fraudCountEl) fraudCountEl.textContent = fraudAlerts.length;
        }
        
        // Get pending payout requests
        const { data: payouts, error: payoutError } = await sb
            .from('payout_requests')
            .select('id')
            .eq('status', 'pending');
        
        if (!payoutError && payouts) {
            const payoutCountEl = document.getElementById('payoutCount');
            if (payoutCountEl) payoutCountEl.textContent = payouts.length;
        }
        
        await loadRecentActivity();
        await updateLeadsTimelineChart();
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

async function loadRecentActivity() {
    try {
        // Get recent campaigns
        const { data: campaigns, error: campaignsError } = await sb
            .from('campaigns')
            .select('id, name, status, created_at, supplier_id')
            .order('created_at', { ascending: false })
            .limit(10);
        
        // Get supplier names
        const supplierIds = campaigns?.map(c => c.supplier_id).filter(id => id) || [];
        let supplierMap = {};
        if (supplierIds.length > 0) {
            const { data: suppliers } = await sb
                .from('suppliers')
                .select('id, business_name')
                .in('id', supplierIds);
            if (suppliers) {
                supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.business_name]));
            }
        }
        
        // Get recent leads
        const { data: leads, error: leadsError } = await sb
            .from('leads')
            .select('id, lead_type, created_at, marketer_id, campaign_id')
            .order('created_at', { ascending: false })
            .limit(10);
        
        // Get marketer names
        const marketerIds = leads?.map(l => l.marketer_id).filter(id => id) || [];
        let marketerMap = {};
        if (marketerIds.length > 0) {
            const { data: profiles } = await sb
                .from('profiles')
                .select('id, full_name')
                .in('id', marketerIds);
            if (profiles) {
                marketerMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
            }
        }
        
        // Get campaign names for leads
        const campaignIds = leads?.map(l => l.campaign_id).filter(id => id) || [];
        let campaignMap = {};
        if (campaignIds.length > 0) {
            const { data: campaignsData } = await sb
                .from('campaigns')
                .select('id, name')
                .in('id', campaignIds);
            if (campaignsData) {
                campaignMap = Object.fromEntries(campaignsData.map(c => [c.id, c.name]));
            }
        }
        
        const activities = [];
        
        if (campaigns && !campaignsError) {
            campaigns.forEach(c => {
                const supplierName = supplierMap[c.supplier_id] || 'Supplier';
                activities.push({
                    type: 'campaign',
                    icon: 'fa-bullhorn',
                    title: `${supplierName} created campaign: ${c.name}`,
                    status: c.status,
                    time: c.created_at
                });
            });
        }
        
        if (leads && !leadsError) {
            leads.forEach(l => {
                const marketerName = marketerMap[l.marketer_id] || 'Marketer';
                const campaignName = campaignMap[l.campaign_id] || 'campaign';
                activities.push({
                    type: 'lead',
                    icon: 'fa-user-plus',
                    title: `${marketerName} generated a ${l.lead_type} lead for ${campaignName}`,
                    time: l.created_at
                });
            });
        }
        
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        const container = document.getElementById('recentActivity');
        if (!container) return;
        
        if (activities.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No recent activity</div>';
            return;
        }
        
        container.innerHTML = activities.slice(0, 10).map(activity => `
            <div style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #E2E8F0;">
                <div style="width: 32px; height: 32px; background: #F1F5F9; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                    <i class="fas ${activity.icon}" style="color: #6B21E5; font-size: 14px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px;">${escapeHtml(activity.title)}</div>
                    <div style="font-size: 11px; color: #64748B;">${formatDate(activity.time)}</div>
                </div>
                ${activity.status ? `
                    <div style="padding: 2px 8px; border-radius: 12px; font-size: 10px; background: ${activity.status === 'pending' ? '#FEF3C7' : '#D1FAE5'}; color: ${activity.status === 'pending' ? '#F59E0B' : '#10B981'}">
                        ${activity.status}
                    </div>
                ` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

// ============================================
// CHARTS
// ============================================

function initCharts() {
    const ctx1 = document.getElementById('campaignStatusChart')?.getContext('2d');
    const ctx2 = document.getElementById('leadsTimelineChart')?.getContext('2d');
    
    if (ctx1) {
        campaignStatusChart = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: ['Active', 'Pending', 'Ended', 'Draft'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#10B981', '#F59E0B', '#6B7280', '#9CA3AF'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    if (ctx2) {
        leadsTimelineChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Leads',
                    data: [],
                    borderColor: '#6B21E5',
                    backgroundColor: 'rgba(107, 33, 229, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.raw} leads`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function updateCampaignStatusChart(campaigns) {
    if (!campaignStatusChart) return;
    
    const active = campaigns?.filter(c => c.status === 'active').length || 0;
    const pending = campaigns?.filter(c => c.status === 'pending').length || 0;
    const ended = campaigns?.filter(c => ['ended', 'cancelled'].includes(c.status)).length || 0;
    const draft = campaigns?.filter(c => c.status === 'draft').length || 0;
    
    campaignStatusChart.data.datasets[0].data = [active, pending, ended, draft];
    campaignStatusChart.update();
}

async function updateLeadsTimelineChart() {
    if (!leadsTimelineChart) return;
    
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data, error } = await sb
            .from('leads')
            .select('created_at')
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        const dailyLeads = {};
        data.forEach(lead => {
            const date = new Date(lead.created_at).toLocaleDateString();
            dailyLeads[date] = (dailyLeads[date] || 0) + 1;
        });
        
        const labels = Object.keys(dailyLeads);
        const values = Object.values(dailyLeads);
        
        leadsTimelineChart.data.labels = labels;
        leadsTimelineChart.data.datasets[0].data = values;
        leadsTimelineChart.update();
        
    } catch (error) {
        console.error('Error updating leads timeline:', error);
    }
}

// ============================================
// PENDING CAMPAIGNS - FIXED VERSION
// ============================================

async function loadPendingCampaigns() {
    console.log('🔄 Loading pending campaigns...');
    
    const container = document.getElementById('pendingCampaignsList');
    if (!container) {
        console.error('❌ Container #pendingCampaignsList not found!');
        return;
    }
    
    // Show loading state
    container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px;">
            <div style="width: 40px; height: 40px; border: 3px solid #E2E8F0; border-top-color: #6B21E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
            <p style="color: #64748B;">Loading pending campaigns...</p>
        </div>
    `;
    
    try {
        // Direct query to get pending campaigns
        const { data: campaigns, error } = await sb
            .from('campaigns')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Error fetching campaigns:', error);
            throw error;
        }
        
        console.log(`📊 Found ${campaigns?.length || 0} pending campaigns:`, campaigns);
        
        if (!campaigns || campaigns.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px 20px;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #10B981; margin-bottom: 16px;"></i>
                    <h3 style="margin-bottom: 8px;">No Pending Campaigns</h3>
                    <p style="color: #64748B;">All campaigns have been reviewed.</p>
                </div>
            `;
            return;
        }
        
        // Get all supplier IDs
        const supplierIds = [...new Set(campaigns.map(c => c.supplier_id).filter(id => id))];
        console.log('🏢 Supplier IDs to fetch:', supplierIds);
        
        // Fetch suppliers
        let suppliersMap = {};
        if (supplierIds.length > 0) {
            const { data: suppliers, error: supplierError } = await sb
                .from('suppliers')
                .select('id, business_name, profile_id')
                .in('id', supplierIds);
            
            if (supplierError) {
                console.error('❌ Error fetching suppliers:', supplierError);
            } else if (suppliers) {
                suppliersMap = Object.fromEntries(suppliers.map(s => [s.id, s]));
                console.log('✅ Suppliers found:', suppliers);
            }
        }
        
        // Get all profile IDs
        const profileIds = [...new Set(Object.values(suppliersMap).map(s => s.profile_id).filter(id => id))];
        console.log('👤 Profile IDs to fetch:', profileIds);
        
        // Fetch profiles
        let profilesMap = {};
        if (profileIds.length > 0) {
            const { data: profiles, error: profileError } = await sb
                .from('profiles')
                .select('id, full_name, email, phone')
                .in('id', profileIds);
            
            if (profileError) {
                console.error('❌ Error fetching profiles:', profileError);
            } else if (profiles) {
                profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                console.log('✅ Profiles found:', profiles);
            }
        }
        
        // Get all ad IDs
        const adIds = [...new Set(campaigns.map(c => c.ad_id).filter(id => id))];
        console.log('📦 Ad IDs to fetch:', adIds);
        
        // Fetch ads/products
        let adsMap = {};
        if (adIds.length > 0) {
            const { data: ads, error: adError } = await sb
                .from('ads')
                .select('id, title, image_urls')
                .in('id', adIds);
            
            if (adError) {
                console.error('❌ Error fetching ads:', adError);
            } else if (ads) {
                adsMap = Object.fromEntries(ads.map(a => [a.id, a]));
                console.log('✅ Ads found:', ads);
            }
        }
        
        // Build HTML directly
        let html = '';
        
        for (const campaign of campaigns) {
            const supplier = suppliersMap[campaign.supplier_id];
            const profile = profilesMap[supplier?.profile_id];
            const ad = adsMap[campaign.ad_id];
            
            const supplierName = supplier?.business_name || 'Unknown Supplier';
            const supplierEmail = profile?.email || 'No email';
            const supplierPhone = profile?.phone || 'No phone';
            const productName = ad?.title || 'N/A';
            const productImage = ad?.image_urls?.[0] || 'https://via.placeholder.com/80x80/6B21E5/FFFFFF?text=Product';
            
            html += `
                <div style="background: white; border-radius: 20px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
                    <div style="display: flex; padding: 20px; flex-wrap: wrap;">
                        <div style="width: 100px; height: 100px; border-radius: 12px; overflow: hidden; margin-right: 20px; flex-shrink: 0; background: #F1F5F9;">
                            <img src="${productImage}" alt="${escapeHtml(productName)}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <div style="flex: 1; min-width: 250px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
                                <div>
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 6px; color: #1E293B;">${escapeHtml(campaign.name)}</h3>
                                    <div style="font-size: 13px; color: #64748B;">
                                        <i class="fas fa-store" style="color: #6B21E5;"></i> ${escapeHtml(supplierName)}
                                        <span style="margin-left: 16px;"><i class="fas fa-envelope" style="color: #6B21E5;"></i> ${escapeHtml(supplierEmail)}</span>
                                        <span style="margin-left: 16px;"><i class="fas fa-phone" style="color: #6B21E5;"></i> ${escapeHtml(supplierPhone)}</span>
                                    </div>
                                </div>
                                <div style="padding: 6px 14px; background: #FEF3C7; border-radius: 30px; font-size: 12px; font-weight: 600; color: #F59E0B;">
                                    <i class="fas fa-clock"></i> PENDING APPROVAL
                                </div>
                            </div>
                            
                            <div style="display: flex; flex-wrap: wrap; gap: 20px; margin: 16px 0; padding: 12px 0; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
                                <div><i class="fas fa-money-bill-wave" style="color: #6B21E5;"></i> <strong>Budget:</strong> ${formatCurrency(campaign.budget)}</div>
                                <div><i class="fas fa-tag" style="color: #6B21E5;"></i> <strong>CPL:</strong> ${formatCurrency(campaign.cost_per_lead)}</div>
                                <div><i class="fas fa-box" style="color: #6B21E5;"></i> <strong>Product:</strong> ${escapeHtml(productName)}</div>
                                <div><i class="fas fa-calendar" style="color: #6B21E5;"></i> <strong>Created:</strong> ${formatDate(campaign.created_at)}</div>
                                ${campaign.target_leads ? `<div><i class="fas fa-bullseye" style="color: #6B21E5;"></i> <strong>Target:</strong> ${campaign.target_leads} leads</div>` : ''}
                            </div>
                            
                            ${campaign.description ? `
                                <div style="background: #F8FAFC; padding: 12px 16px; border-radius: 12px; margin: 12px 0; font-size: 13px; color: #475569; border-left: 3px solid #6B21E5;">
                                    <i class="fas fa-align-left" style="color: #6B21E5; margin-right: 8px;"></i>
                                    ${escapeHtml(campaign.description.substring(0, 200))}${campaign.description.length > 200 ? '...' : ''}
                                </div>
                            ` : ''}
                            
                            ${campaign.promo_message ? `
                                <div style="background: #EDE9FE; padding: 10px 16px; border-radius: 12px; margin: 12px 0; font-size: 12px; color: #6B21E5;">
                                    <i class="fas fa-comment-dots"></i> <strong>Promo Message:</strong> ${escapeHtml(campaign.promo_message.substring(0, 150))}
                                </div>
                            ` : ''}
                            
                            <div style="margin-top: 16px;">
                                <button onclick="openApprovalModal('${campaign.id}')" style="padding: 10px 28px; background: #6B21E5; color: white; border: none; border-radius: 40px; font-size: 14px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;">
                                    <i class="fas fa-eye"></i> Review & Approve
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        console.log(`✅ Rendered ${campaigns.length} pending campaigns successfully`);
        
    } catch (error) {
        console.error('❌ Error in loadPendingCampaigns:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 48px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">Error Loading Campaigns</h3>
                <p style="color: #64748B; margin-bottom: 16px;">${error.message || 'Please check your connection and try again'}</p>
                <button onclick="loadPendingCampaigns()" style="padding: 10px 24px; background: #6B21E5; color: white; border: none; border-radius: 30px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>
        `;
    }
}

// ============================================
// ACTIVE CAMPAIGNS
// ============================================

async function loadActiveCampaigns() {
    try {
        const { data, error } = await sb
            .from('campaigns')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get supplier names
        const supplierIds = data?.map(c => c.supplier_id).filter(id => id) || [];
        let suppliersMap = {};
        
        if (supplierIds.length > 0) {
            const { data: suppliers } = await sb
                .from('suppliers')
                .select('id, business_name')
                .in('id', supplierIds);
            
            if (suppliers) {
                suppliersMap = Object.fromEntries(suppliers.map(s => [s.id, s.business_name]));
            }
        }
        
        const container = document.getElementById('activeCampaignsList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No active campaigns</div>';
            return;
        }
        
        container.innerHTML = data.map(campaign => {
            const spent = campaign.spent || 0;
            const budget = campaign.budget || 0;
            const progress = budget > 0 ? (spent / budget) * 100 : 0;
            const supplierName = suppliersMap[campaign.supplier_id] || 'Unknown';
            
            return `
                <div style="background: white; border-radius: 16px; margin-bottom: 12px; padding: 16px; border: 1px solid #E2E8F0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(campaign.name)}</h3>
                            <div style="font-size: 13px; color: #64748B;">
                                <i class="fas fa-store"></i> ${escapeHtml(supplierName)}
                            </div>
                        </div>
                        <div style="padding: 4px 12px; background: #D1FAE5; border-radius: 20px; font-size: 11px; color: #10B981;">
                            ACTIVE
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Budget Usage</span>
                            <span>${formatCurrency(spent)} / ${formatCurrency(budget)}</span>
                        </div>
                        <div style="height: 6px; background: #E2E8F0; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${progress}%; height: 100%; background: #6B21E5; border-radius: 3px;"></div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 16px;">
                        <button onclick="viewCampaignLeads('${campaign.id}')" style="flex: 1; padding: 8px; background: #F1F5F9; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                            <i class="fas fa-users"></i> View Leads
                        </button>
                        <button onclick="pauseCampaign('${campaign.id}')" style="padding: 8px 16px; background: #FEF3C7; border: none; border-radius: 30px; font-size: 12px; cursor: pointer; color: #D97706;">
                            <i class="fas fa-pause"></i> Pause
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
// FRAUD ALERTS
// ============================================

async function loadFraudAlerts() {
    try {
        const { data, error } = await sb
            .from('fraud_alerts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get marketer names
        const marketerIds = data?.map(a => a.marketer_id).filter(id => id) || [];
        let marketerMap = {};
        
        if (marketerIds.length > 0) {
            const { data: profiles } = await sb
                .from('profiles')
                .select('id, full_name, email, phone')
                .in('id', marketerIds);
            
            if (profiles) {
                marketerMap = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
        }
        
        // Get campaign names
        const campaignIds = data?.map(a => a.campaign_id).filter(id => id) || [];
        let campaignMap = {};
        
        if (campaignIds.length > 0) {
            const { data: campaigns } = await sb
                .from('campaigns')
                .select('id, name')
                .in('id', campaignIds);
            
            if (campaigns) {
                campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.name]));
            }
        }
        
        const container = document.getElementById('fraudAlertsList');
        if (!container) return;
        
        let filteredAlerts = data || [];
        if (currentFraudFilter !== 'all') {
            filteredAlerts = filteredAlerts.filter(a => a.status === currentFraudFilter);
        }
        
        if (filteredAlerts.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No fraud alerts</div>';
            return;
        }
        
        container.innerHTML = filteredAlerts.map(alert => {
            const severityClass = alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : '#6B21E5';
            const severityBg = alert.severity === 'critical' ? '#FEE2E2' : alert.severity === 'warning' ? '#FEF3C7' : '#EDE9FE';
            const marketer = marketerMap[alert.marketer_id];
            const campaignName = campaignMap[alert.campaign_id] || 'Unknown';
            
            return `
                <div style="background: white; border-radius: 16px; margin-bottom: 12px; padding: 16px; border-left: 4px solid ${severityClass};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">
                                <span style="background: ${severityBg}; color: ${severityClass}; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-right: 8px;">
                                    ${alert.alert_type.toUpperCase()}
                                </span>
                                ${escapeHtml(marketer?.full_name || 'Unknown Marketer')}
                            </div>
                            <div style="font-size: 12px; color: #64748B;">
                                Campaign: ${escapeHtml(campaignName)}
                            </div>
                        </div>
                        <div style="font-size: 11px; color: #64748B;">${formatDate(alert.created_at)}</div>
                    </div>
                    
                    <div style="background: #F8FAFC; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 12px;">
                        <strong>Evidence:</strong> ${JSON.stringify(alert.evidence)}
                    </div>
                    
                    ${alert.status === 'pending' ? `
                        <div style="display: flex; gap: 12px;">
                            <button onclick="resolveFraudAlert('${alert.id}')" style="flex: 1; padding: 8px; background: #10B981; color: white; border: none; border-radius: 30px; cursor: pointer;">
                                <i class="fas fa-check"></i> Resolve
                            </button>
                            <button onclick="ignoreFraudAlert('${alert.id}')" style="flex: 1; padding: 8px; background: #EF4444; color: white; border: none; border-radius: 30px; cursor: pointer;">
                                <i class="fas fa-times"></i> Ignore
                            </button>
                        </div>
                    ` : `
                        <div style="padding: 8px; background: #F1F5F9; border-radius: 12px; text-align: center; font-size: 12px; color: ${alert.status === 'resolved' ? '#10B981' : '#64748B'};">
                            Status: ${alert.status.toUpperCase()}
                        </div>
                    `}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading fraud alerts:', error);
    }
}

// ============================================
// PAYOUT REQUESTS
// ============================================

async function loadPayoutRequests() {
    try {
        let query = sb
            .from('payout_requests')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (currentPayoutFilter !== 'all') {
            query = query.eq('status', currentPayoutFilter);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Get user names
        const userIds = data?.map(p => p.user_id).filter(id => id) || [];
        let userMap = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await sb
                .from('profiles')
                .select('id, full_name, email, phone')
                .in('id', userIds);
            
            if (profiles) {
                userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
        }
        
        const container = document.getElementById('payoutRequestsList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No payout requests</div>';
            return;
        }
        
        const statusColors = {
            pending: { bg: '#FEF3C7', color: '#F59E0B' },
            processing: { bg: '#EDE9FE', color: '#6B21E5' },
            completed: { bg: '#D1FAE5', color: '#10B981' },
            failed: { bg: '#FEE2E2', color: '#EF4444' },
            rejected: { bg: '#FEE2E2', color: '#EF4444' }
        };
        
        container.innerHTML = data.map(payout => {
            const status = statusColors[payout.status] || statusColors.pending;
            const user = userMap[payout.user_id];
            
            return `
                <div style="background: white; border-radius: 16px; margin-bottom: 12px; padding: 16px; border: 1px solid #E2E8F0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">
                                ${escapeHtml(user?.full_name || 'Unknown User')}
                            </div>
                            <div style="font-size: 12px; color: #64748B;">
                                ${payout.network} • ${payout.phone_number}
                            </div>
                        </div>
                        <div style="font-size: 18px; font-weight: 600; color: #6B21E5;">
                            ${formatCurrency(payout.amount)}
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="padding: 4px 12px; background: ${status.bg}; border-radius: 20px; font-size: 11px; color: ${status.color};">
                            ${payout.status.toUpperCase()}
                        </div>
                        <div style="font-size: 11px; color: #64748B;">
                            ${formatDate(payout.created_at)}
                        </div>
                    </div>
                    
                    ${payout.status === 'pending' ? `
                        <div style="display: flex; gap: 12px;">
                            <button onclick="processPayout('${payout.id}')" style="flex: 1; padding: 8px; background: #6B21E5; color: white; border: none; border-radius: 30px; cursor: pointer;">
                                <i class="fas fa-spinner"></i> Mark Processing
                            </button>
                        </div>
                    ` : payout.status === 'processing' ? `
                        <div style="display: flex; gap: 12px;">
                            <button onclick="completePayout('${payout.id}')" style="flex: 1; padding: 8px; background: #10B981; color: white; border: none; border-radius: 30px; cursor: pointer;">
                                <i class="fas fa-check"></i> Mark Completed
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading payout requests:', error);
    }
}

// ============================================
// SUPPLIERS & MARKETERS
// ============================================

async function loadSuppliers() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get profile info
        const profileIds = data?.map(s => s.profile_id).filter(id => id) || [];
        let profilesMap = {};
        
        if (profileIds.length > 0) {
            const { data: profiles } = await sb
                .from('profiles')
                .select('id, full_name, email, phone, created_at')
                .in('id', profileIds);
            
            if (profiles) {
                profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
        }
        
        const container = document.getElementById('suppliersList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No suppliers found</div>';
            return;
        }
        
        container.innerHTML = data.map(supplier => {
            const profile = profilesMap[supplier.profile_id];
            const verificationStatus = supplier.verification_status === 'verified' ? '#10B981' : '#F59E0B';
            const verificationText = supplier.verification_status === 'verified' ? 'Verified' : 'Pending';
            
            return `
                <div style="background: white; border-radius: 16px; margin-bottom: 12px; padding: 16px; border: 1px solid #E2E8F0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">
                                ${escapeHtml(supplier.business_name)}
                            </div>
                            <div style="font-size: 12px; color: #64748B;">
                                ${profile?.email || 'No email'} • ${supplier.business_phone || 'No phone'}
                            </div>
                        </div>
                        <div style="padding: 4px 12px; background: ${supplier.verification_status === 'verified' ? '#D1FAE5' : '#FEF3C7'}; border-radius: 20px; font-size: 11px; color: ${verificationStatus};">
                            ${verificationText}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 12px;">
                        <button onclick="viewSupplierCampaigns('${supplier.id}')" style="flex: 1; padding: 8px; background: #F1F5F9; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                            <i class="fas fa-chart-line"></i> View Campaigns
                        </button>
                        ${supplier.verification_status !== 'verified' ? `
                            <button onclick="verifySupplier('${supplier.id}')" style="padding: 8px 16px; background: #10B981; color: white; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                                <i class="fas fa-check"></i> Verify
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

async function loadMarketers() {
    try {
        // Get all leads with verified status
        const { data: leads, error: leadsError } = await sb
            .from('leads')
            .select('marketer_id, reward_amount')
            .eq('status', 'verified');
        
        if (leadsError) throw leadsError;
        
        // Get unique marketer IDs
        const marketerIds = [...new Set(leads?.map(l => l.marketer_id).filter(id => id) || [])];
        let profilesMap = {};
        
        if (marketerIds.length > 0) {
            const { data: profiles } = await sb
                .from('profiles')
                .select('id, full_name, email, phone, created_at')
                .in('id', marketerIds);
            
            if (profiles) {
                profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
        }
        
        // Aggregate earnings by marketer
        const marketerMap = new Map();
        leads.forEach(lead => {
            const id = lead.marketer_id;
            if (!marketerMap.has(id)) {
                marketerMap.set(id, {
                    totalEarned: 0,
                    leadCount: 0
                });
            }
            const m = marketerMap.get(id);
            m.totalEarned += lead.reward_amount || 0;
            m.leadCount++;
        });
        
        const marketers = Array.from(marketerMap.entries())
            .map(([id, stats]) => ({
                id,
                ...profilesMap[id],
                ...stats
            }))
            .sort((a, b) => b.totalEarned - a.totalEarned);
        
        const container = document.getElementById('marketersList');
        if (!container) return;
        
        if (marketers.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px; color: #64748B;">No marketers found</div>';
            return;
        }
        
        container.innerHTML = marketers.map(marketer => `
            <div style="background: white; border-radius: 16px; margin-bottom: 12px; padding: 16px; border: 1px solid #E2E8F0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 600; margin-bottom: 4px;">
                            ${escapeHtml(marketer.full_name || 'Anonymous')}
                        </div>
                        <div style="font-size: 12px; color: #64748B;">
                            ${marketer.email || 'No email'} • ${marketer.phone || 'No phone'}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: #10B981;">${formatCurrency(marketer.totalEarned)}</div>
                        <div style="font-size: 11px; color: #64748B;">${marketer.leadCount} leads</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button onclick="viewMarketerLeads('${marketer.id}')" style="flex: 1; padding: 8px; background: #F1F5F9; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                        <i class="fas fa-chart-line"></i> View Leads
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading marketers:', error);
    }
}

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
    try {
        // Load referral settings
        const { data: campaignSettings, error: campaignError } = await sb
            .from('referral_settings')
            .select('*')
            .eq('id', 1)
            .single();
        
        if (!campaignError && campaignSettings) {
            const minBudgetElem = document.getElementById('minBudget');
            const maxBudgetElem = document.getElementById('maxBudget');
            const minCostElem = document.getElementById('minCostPerLead');
            const defaultDurationElem = document.getElementById('defaultDuration');
            
            if (minBudgetElem) minBudgetElem.value = campaignSettings.supplier_reward_min || 10000;
            if (maxBudgetElem) maxBudgetElem.value = campaignSettings.supplier_reward_max || 500000;
            if (minCostElem) minCostElem.value = campaignSettings.buyer_credits_per_signup || 500;
            if (defaultDurationElem) defaultDurationElem.value = 30;
        }
        
        // Load fraud rules
        const { data: fraudRules, error: fraudError } = await sb
            .from('fraud_rules')
            .select('*')
            .order('id');
        
        if (!fraudError && fraudRules) {
            fraudRules.forEach(rule => {
                if (rule.rule_name === 'Max leads per IP per day') {
                    const elem = document.getElementById('maxLeadsPerIp');
                    if (elem) elem.value = rule.threshold;
                } else if (rule.rule_name === 'Max leads per device per day') {
                    const elem = document.getElementById('maxLeadsPerDevice');
                    if (elem) elem.value = rule.threshold;
                } else if (rule.rule_name === 'Min time between conversions') {
                    const elem = document.getElementById('minSecondsBetween');
                    if (elem) elem.value = rule.threshold;
                }
            });
        }
        
        // Commission settings
        const platformCommElem = document.getElementById('platformCommission');
        const marketerCommElem = document.getElementById('marketerCommission');
        if (platformCommElem) platformCommElem.value = 40;
        if (marketerCommElem) marketerCommElem.value = 60;
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// ============================================
// ADMIN ACTIONS
// ============================================

async function approveCampaign(campaignId, notes) {
    showLoading(true, 'Approving campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({
                status: 'active',
                start_date: new Date().toISOString()
            })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        // Log admin action
        await sb
            .from('admin_actions')
            .insert({
                admin_id: currentUser.id,
                action_type: 'campaign_approved',
                target_campaign_id: campaignId,
                details: { notes }
            });
        
        showToast('Campaign approved and launched!', 'success');
        closeModal('approvalModal');
        
        await Promise.all([
            loadPendingCampaigns(),
            loadDashboardStats()
        ]);
        
    } catch (error) {
        console.error('Error approving campaign:', error);
        showToast('Error approving campaign', 'error');
    }
    
    showLoading(false);
}

async function rejectCampaign(campaignId, notes) {
    showLoading(true, 'Rejecting campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({
                status: 'cancelled'
            })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        await sb
            .from('admin_actions')
            .insert({
                admin_id: currentUser.id,
                action_type: 'campaign_rejected',
                target_campaign_id: campaignId,
                details: { notes }
            });
        
        showToast('Campaign rejected', 'success');
        closeModal('approvalModal');
        
        await Promise.all([
            loadPendingCampaigns(),
            loadDashboardStats()
        ]);
        
    } catch (error) {
        console.error('Error rejecting campaign:', error);
        showToast('Error rejecting campaign', 'error');
    }
    
    showLoading(false);
}

async function processPayout(payoutId) {
    showLoading(true, 'Processing payout...');
    
    try {
        const { error } = await sb
            .from('payout_requests')
            .update({
                status: 'processing',
                processed_by: currentUser.id,
                processed_at: new Date().toISOString()
            })
            .eq('id', payoutId);
        
        if (error) throw error;
        
        showToast('Payout marked as processing', 'success');
        await loadPayoutRequests();
        
    } catch (error) {
        console.error('Error processing payout:', error);
        showToast('Error processing payout', 'error');
    }
    
    showLoading(false);
}

async function completePayout(payoutId) {
    showLoading(true, 'Completing payout...');
    
    try {
        const { data: payout, error: getError } = await sb
            .from('payout_requests')
            .select('*')
            .eq('id', payoutId)
            .single();
        
        if (getError) throw getError;
        
        const { error: updateError } = await sb
            .from('payout_requests')
            .update({
                status: 'completed',
                processed_by: currentUser.id,
                processed_at: new Date().toISOString()
            })
            .eq('id', payoutId);
        
        if (updateError) throw updateError;
        
        // Update wallet to deduct balance
        const { data: wallet } = await sb
            .from('wallets')
            .select('marketer_balance, total_withdrawn')
            .eq('user_id', payout.user_id)
            .single();
        
        if (wallet) {
            await sb
                .from('wallets')
                .update({
                    marketer_balance: (wallet.marketer_balance || 0) - payout.amount,
                    total_withdrawn: (wallet.total_withdrawn || 0) + payout.amount
                })
                .eq('user_id', payout.user_id);
        }
        
        showToast('Payout completed!', 'success');
        await loadPayoutRequests();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error completing payout:', error);
        showToast('Error completing payout', 'error');
    }
    
    showLoading(false);
}

async function resolveFraudAlert(alertId) {
    showLoading(true, 'Resolving alert...');
    
    try {
        const { error } = await sb
            .from('fraud_alerts')
            .update({
                status: 'resolved',
                resolved_by: currentUser.id,
                resolved_at: new Date().toISOString()
            })
            .eq('id', alertId);
        
        if (error) throw error;
        
        showToast('Alert resolved', 'success');
        await loadFraudAlerts();
        
    } catch (error) {
        console.error('Error resolving alert:', error);
        showToast('Error resolving alert', 'error');
    }
    
    showLoading(false);
}

async function ignoreFraudAlert(alertId) {
    showLoading(true, 'Ignoring alert...');
    
    try {
        const { error } = await sb
            .from('fraud_alerts')
            .update({
                status: 'ignored',
                resolved_by: currentUser.id,
                resolved_at: new Date().toISOString()
            })
            .eq('id', alertId);
        
        if (error) throw error;
        
        showToast('Alert ignored', 'success');
        await loadFraudAlerts();
        
    } catch (error) {
        console.error('Error ignoring alert:', error);
        showToast('Error ignoring alert', 'error');
    }
    
    showLoading(false);
}

async function pauseCampaign(campaignId) {
    if (!confirm('Are you sure you want to pause this campaign?')) return;
    
    showLoading(true, 'Pausing campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({ status: 'paused' })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        showToast('Campaign paused', 'success');
        await loadActiveCampaigns();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error pausing campaign:', error);
        showToast('Error pausing campaign', 'error');
    }
    
    showLoading(false);
}

async function verifySupplier(supplierId) {
    if (!confirm('Verify this supplier?')) return;
    
    showLoading(true, 'Verifying supplier...');
    
    try {
        const { error } = await sb
            .from('suppliers')
            .update({
                verification_status: 'verified',
                verified_by: currentUser.id,
                verified_at: new Date().toISOString()
            })
            .eq('id', supplierId);
        
        if (error) throw error;
        
        showToast('Supplier verified!', 'success');
        await loadSuppliers();
        
    } catch (error) {
        console.error('Error verifying supplier:', error);
        showToast('Error verifying supplier', 'error');
    }
    
    showLoading(false);
}

async function saveCampaignSettings() {
    showLoading(true, 'Saving settings...');
    
    try {
        const minBudget = document.getElementById('minBudget')?.value;
        const maxBudget = document.getElementById('maxBudget')?.value;
        const minCostPerLead = document.getElementById('minCostPerLead')?.value;
        
        const { error } = await sb
            .from('referral_settings')
            .update({
                supplier_reward_min: minBudget,
                supplier_reward_max: maxBudget,
                buyer_credits_per_signup: minCostPerLead,
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('Settings saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    }
    
    showLoading(false);
}

async function saveFraudRules() {
    showLoading(true, 'Saving fraud rules...');
    
    try {
        const maxLeadsPerIp = document.getElementById('maxLeadsPerIp')?.value;
        const maxLeadsPerDevice = document.getElementById('maxLeadsPerDevice')?.value;
        const minSecondsBetween = document.getElementById('minSecondsBetween')?.value;
        
        const updates = [
            { id: 1, threshold: maxLeadsPerIp },
            { id: 2, threshold: maxLeadsPerDevice },
            { id: 3, threshold: minSecondsBetween }
        ];
        
        for (const update of updates) {
            const { error } = await sb
                .from('fraud_rules')
                .update({ threshold: update.threshold })
                .eq('id', update.id);
            
            if (error) throw error;
        }
        
        showToast('Fraud rules saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving fraud rules:', error);
        showToast('Error saving fraud rules', 'error');
    }
    
    showLoading(false);
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

async function openApprovalModal(campaignId) {
    const modal = document.getElementById('approvalModal');
    const detailsContainer = document.getElementById('campaignDetails');
    const approveBtn = document.getElementById('approveCampaignBtn');
    const rejectBtn = document.getElementById('rejectCampaignBtn');
    
    if (approveBtn) approveBtn.setAttribute('data-campaign-id', campaignId);
    if (rejectBtn) rejectBtn.setAttribute('data-campaign-id', campaignId);
    
    try {
        // Get campaign details
        const { data: campaign, error: campaignError } = await sb
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();
        
        if (campaignError) throw campaignError;
        
        // Get supplier info
        let supplierName = 'Unknown Supplier';
        let supplierContact = 'No contact info';
        
        if (campaign.supplier_id) {
            const { data: supplier } = await sb
                .from('suppliers')
                .select('business_name, profile_id')
                .eq('id', campaign.supplier_id)
                .single();
            
            if (supplier) {
                supplierName = supplier.business_name || 'Unknown Supplier';
                
                if (supplier.profile_id) {
                    const { data: profile } = await sb
                        .from('profiles')
                        .select('email, phone')
                        .eq('id', supplier.profile_id)
                        .single();
                    
                    if (profile) {
                        supplierContact = profile.email || profile.phone || 'No contact info';
                    }
                }
            }
        }
        
        // Get product info
        let productName = 'N/A';
        if (campaign.ad_id) {
            const { data: ad } = await sb
                .from('ads')
                .select('title')
                .eq('id', campaign.ad_id)
                .single();
            
            if (ad) {
                productName = ad.title || 'N/A';
            }
        }
        
        if (detailsContainer) {
            detailsContainer.innerHTML = `
                <div style="margin-bottom: 16px; padding: 16px; background: #F8FAFC; border-radius: 12px;">
                    <div style="margin-bottom: 10px;"><strong>Campaign Name:</strong> ${escapeHtml(campaign.name)}</div>
                    <div style="margin-bottom: 10px;"><strong>Supplier:</strong> ${escapeHtml(supplierName)}</div>
                    <div style="margin-bottom: 10px;"><strong>Contact:</strong> ${escapeHtml(supplierContact)}</div>
                    <div style="margin-bottom: 10px;"><strong>Product:</strong> ${escapeHtml(productName)}</div>
                    <div style="margin-bottom: 10px;"><strong>Budget:</strong> ${formatCurrency(campaign.budget)}</div>
                    <div style="margin-bottom: 10px;"><strong>Cost Per Lead:</strong> ${formatCurrency(campaign.cost_per_lead)}</div>
                    <div style="margin-bottom: 10px;"><strong>Target Leads:</strong> ${campaign.target_leads || 'Unlimited'}</div>
                    ${campaign.description ? `<div style="margin-bottom: 10px;"><strong>Description:</strong> ${escapeHtml(campaign.description)}</div>` : ''}
                    ${campaign.promo_message ? `<div style="margin-bottom: 10px;"><strong>Promo Message:</strong> ${escapeHtml(campaign.promo_message)}</div>` : ''}
                    <div><strong>Created:</strong> ${formatDateTime(campaign.created_at)}</div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error loading campaign details:', error);
        if (detailsContainer) {
            detailsContainer.innerHTML = '<div style="color: #EF4444;">Error loading campaign details</div>';
        }
    }
    
    if (modal) modal.classList.add('active');
}

function viewCampaignLeads(campaignId) {
    window.location.href = `campaign-leads.html?id=${campaignId}`;
}

function viewSupplierCampaigns(supplierId) {
    window.location.href = `supplier-campaigns.html?id=${supplierId}`;
}

function viewMarketerLeads(marketerId) {
    window.location.href = `marketer-leads.html?id=${marketerId}`;
}

// ============================================
// FILTER FUNCTIONS
// ============================================

function filterActiveCampaigns() {
    const searchTerm = document.getElementById('searchActiveCampaigns')?.value.toLowerCase();
    const rows = document.querySelectorAll('#activeCampaignsList > div');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function filterSuppliers() {
    const searchTerm = document.getElementById('searchSuppliers')?.value.toLowerCase();
    const rows = document.querySelectorAll('#suppliersList > div');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function filterMarketers() {
    const searchTerm = document.getElementById('searchMarketers')?.value.toLowerCase();
    const rows = document.querySelectorAll('#marketersList > div');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Navigation
    const navBtns = document.querySelectorAll('.admin-nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            const sectionElem = document.getElementById(`${section}Section`);
            if (sectionElem) sectionElem.classList.add('active');
            
            // Reload data when switching to certain sections
            if (section === 'pending-campaigns') {
                loadPendingCampaigns();
            } else if (section === 'active-campaigns') {
                loadActiveCampaigns();
            } else if (section === 'fraud-alerts') {
                loadFraudAlerts();
            } else if (section === 'payout-requests') {
                loadPayoutRequests();
            }
        });
    });
    
    // Filter changes
    const pendingFilter = document.getElementById('pendingFilter');
    if (pendingFilter) {
        pendingFilter.addEventListener('change', (e) => {
            currentPendingFilter = e.target.value;
            loadPendingCampaigns();
        });
    }
    
    const fraudFilter = document.getElementById('fraudFilter');
    if (fraudFilter) {
        fraudFilter.addEventListener('change', (e) => {
            currentFraudFilter = e.target.value;
            loadFraudAlerts();
        });
    }
    
    const payoutFilter = document.getElementById('payoutFilter');
    if (payoutFilter) {
        payoutFilter.addEventListener('change', (e) => {
            currentPayoutFilter = e.target.value;
            loadPayoutRequests();
        });
    }
    
    // Search
    const searchActive = document.getElementById('searchActiveCampaigns');
    if (searchActive) {
        searchActive.addEventListener('input', filterActiveCampaigns);
    }
    
    const searchSuppliers = document.getElementById('searchSuppliers');
    if (searchSuppliers) {
        searchSuppliers.addEventListener('input', filterSuppliers);
    }
    
    const searchMarketers = document.getElementById('searchMarketers');
    if (searchMarketers) {
        searchMarketers.addEventListener('input', filterMarketers);
    }
    
    // Settings forms
    const campaignSettingsForm = document.getElementById('campaignSettingsForm');
    if (campaignSettingsForm) {
        campaignSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveCampaignSettings();
        });
    }
    
    const fraudRulesForm = document.getElementById('fraudRulesForm');
    if (fraudRulesForm) {
        fraudRulesForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveFraudRules();
        });
    }
    
    const commissionForm = document.getElementById('commissionForm');
    if (commissionForm) {
        commissionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Commission settings coming soon', 'info');
        });
    }
    
    // Modal close buttons
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    // Approval buttons
    const approveBtn = document.getElementById('approveCampaignBtn');
    const rejectBtn = document.getElementById('rejectCampaignBtn');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            const campaignId = approveBtn.getAttribute('data-campaign-id');
            const notes = document.getElementById('approvalNotes')?.value || '';
            approveCampaign(campaignId, notes);
        });
    }
    
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            const campaignId = rejectBtn.getAttribute('data-campaign-id');
            const notes = document.getElementById('approvalNotes')?.value || '';
            rejectCampaign(campaignId, notes);
        });
    }
    
    // Click outside modal to close
    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading(true, 'Loading admin dashboard...');
    
    const isAuth = await checkAdminAuth();
    
    if (isAdmin) {
        initCharts();
        
        // Debug - check what campaigns exist
        const debug = await debugCheckCampaigns();
        
        await Promise.all([
            loadDashboardStats(),
            loadPendingCampaigns(),
            loadActiveCampaigns(),
            loadFraudAlerts(),
            loadPayoutRequests(),
            loadSuppliers(),
            loadMarketers(),
            loadSettings()
        ]);
        
        // If no pending campaigns found but database has them, show alert
        if (debug.pending && debug.pending.length > 0) {
            console.log(`✅ Found ${debug.pending.length} pending campaigns in database`);
        } else if (debug.campaigns && debug.campaigns.length > 0) {
            console.log('⚠️ Campaigns exist but none with status "pending"');
        } else if (!debug.campaigns || debug.campaigns.length === 0) {
            console.log('ℹ️ No campaigns found in database at all');
        }
        
    } else {
        showAccessDenied();
    }
    
    showLoading(false);
    setupEventListeners();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Make functions global for onclick
window.openApprovalModal = openApprovalModal;
window.approveCampaign = approveCampaign;
window.rejectCampaign = rejectCampaign;
window.processPayout = processPayout;
window.completePayout = completePayout;
window.resolveFraudAlert = resolveFraudAlert;
window.ignoreFraudAlert = ignoreFraudAlert;
window.viewCampaignLeads = viewCampaignLeads;
window.viewSupplierCampaigns = viewSupplierCampaigns;
window.viewMarketerLeads = viewMarketerLeads;
window.pauseCampaign = pauseCampaign;
window.verifySupplier = verifySupplier;
window.closeModal = closeModal;
window.loadPendingCampaigns = loadPendingCampaigns; // Make reload available globally