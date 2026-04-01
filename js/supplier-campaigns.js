// ============================================
// SUPPLIER CAMPAIGNS MANAGEMENT - COMPLETE STANDALONE VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let currentUser = null;
let supplierData = null;
let currentTab = 'active';
let campaigns = [];
let products = [];
let currentLeadToVerify = null;

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

function getStatusClass(status) {
    const classes = {
        'active': 'status-active',
        'pending': 'status-pending',
        'ended': 'status-ended',
        'cancelled': 'status-ended',
        'draft': 'status-draft',
        'paused': 'status-paused'
    };
    return classes[status] || 'status-draft';
}

function getStatusLabel(status) {
    const labels = {
        'active': 'Active',
        'pending': 'Pending Approval',
        'ended': 'Ended',
        'cancelled': 'Cancelled',
        'draft': 'Draft',
        'paused': 'Paused'
    };
    return labels[status] || status;
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkSupplierAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            window.location.href = 'login.html?redirect=supplier-campaigns.html';
            return false;
        }
        
        currentUser = user;
        
        // Check if user is a supplier
        const { data: supplier, error: supplierError } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', currentUser.id)
            .single();
        
        if (supplierError || !supplier) {
            console.error('User is not a supplier');
            return false;
        }
        
        supplierData = supplier;
        return true;
        
    } catch (error) {
        console.error('Auth error:', error);
        return false;
    }
}

function showNoSupplierAccess() {
    const container = document.getElementById('campaignsList');
    if (container) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-store" style="font-size: 56px; color: #6B21E5; margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 12px;">Supplier Access Required</h3>
                <p style="color: #64748B; margin-bottom: 24px;">You need to be a verified supplier to create and manage campaigns.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <a href="become-supplier.html" style="padding: 12px 24px; background: #6B21E5; color: white; text-decoration: none; border-radius: 40px; font-weight: 600;">
                        <i class="fas fa-rocket"></i> Become a Supplier
                    </a>
                </div>
            </div>
        `;
    }
    
    const walletSection = document.querySelector('.wallet-section');
    if (walletSection) walletSection.style.display = 'none';
    
    const campaignStats = document.querySelector('.campaign-stats');
    if (campaignStats) campaignStats.style.display = 'none';
}

// ============================================
// WALLET & PRODUCTS
// ============================================

async function loadWallet() {
    try {
        // Get wallet
        let { data: wallet, error } = await sb
            .from('wallets')
            .select('supplier_balance')
            .eq('user_id', currentUser.id)
            .single();
        
        if (error && error.code === 'PGRST116') {
            // Create wallet if doesn't exist
            const { data: newWallet, error: createError } = await sb
                .from('wallets')
                .insert({
                    user_id: currentUser.id,
                    supplier_balance: 0,
                    marketer_balance: 0
                })
                .select()
                .single();
            
            if (!createError) wallet = newWallet;
        }
        
        const balanceEl = document.getElementById('walletBalance');
        if (balanceEl && wallet) {
            balanceEl.textContent = formatCurrency(wallet.supplier_balance || 0);
        }
        
    } catch (error) {
        console.error('Error loading wallet:', error);
    }
}

async function loadProducts() {
    try {
        const { data, error } = await sb
            .from('ads')
            .select('id, title, image_urls, price')
            .eq('supplier_id', supplierData.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        products = data || [];
        
        const select = document.getElementById('productSelect');
        if (select) {
            select.innerHTML = '<option value="">Choose a product to promote</option>' +
                products.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('');
        }
        
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

async function loadCampaigns() {
    try {
        const { data, error } = await sb
            .from('campaigns')
            .select(`
                *,
                ads:ad_id (
                    title,
                    image_urls
                )
            `)
            .eq('supplier_id', supplierData.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        campaigns = data || [];
        
        // Load leads count for each campaign
        for (const campaign of campaigns) {
            const { data: leads, error: leadsError } = await sb
                .from('leads')
                .select('id, status')
                .eq('campaign_id', campaign.id);
            
            if (!leadsError) {
                campaign.leads_count = leads?.length || 0;
                campaign.verified_leads_count = leads?.filter(l => l.status === 'verified').length || 0;
                campaign.pending_leads_count = leads?.filter(l => l.status === 'pending').length || 0;
            } else {
                campaign.leads_count = 0;
                campaign.verified_leads_count = 0;
                campaign.pending_leads_count = 0;
            }
        }
        
        updateStats();
        renderCampaigns();
        
    } catch (error) {
        console.error('Error loading campaigns:', error);
        const container = document.getElementById('campaignsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 48px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 16px;"></i>
                    <h3 style="margin-bottom: 8px;">Error Loading Campaigns</h3>
                    <p style="color: #64748B;">Please refresh the page</p>
                </div>
            `;
        }
    }
}

function updateStats() {
    const activeCampaigns = campaigns.filter(c => c.status === 'active');
    const totalSpent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0);
    const totalLeads = campaigns.reduce((sum, c) => sum + (c.leads_count || 0), 0);
    
    const activeEl = document.getElementById('totalCampaigns');
    const spentEl = document.getElementById('totalSpent');
    const leadsEl = document.getElementById('totalLeads');
    
    if (activeEl) activeEl.textContent = activeCampaigns.length;
    if (spentEl) spentEl.textContent = formatCurrency(totalSpent);
    if (leadsEl) leadsEl.textContent = totalLeads;
}

function renderCampaigns() {
    const container = document.getElementById('campaignsList');
    if (!container) return;
    
    let filteredCampaigns = campaigns.filter(c => {
        if (currentTab === 'active') return c.status === 'active';
        if (currentTab === 'pending') return c.status === 'pending';
        if (currentTab === 'ended') return ['ended', 'cancelled'].includes(c.status);
        if (currentTab === 'draft') return c.status === 'draft';
        return true;
    });
    
    if (filteredCampaigns.length === 0) {
        const tabNames = {
            'active': 'active',
            'pending': 'pending',
            'ended': 'ended',
            'draft': 'draft'
        };
        
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 48px 20px;">
                <i class="fas fa-megaphone" style="font-size: 48px; color: #94A3B8; margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">No ${tabNames[currentTab]} campaigns</h3>
                <p style="color: #64748B; margin-bottom: 16px;">Create your first campaign to start getting leads</p>
                <button onclick="document.getElementById('createCampaignBtn').click()" style="padding: 10px 24px; background: #6B21E5; color: white; border: none; border-radius: 30px; cursor: pointer;">
                    <i class="fas fa-plus"></i> Create Campaign
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredCampaigns.map(campaign => {
        const spent = campaign.spent || 0;
        const budget = campaign.budget || 0;
        const progress = budget > 0 ? (spent / budget) * 100 : 0;
        const remainingLeads = (budget > 0 && campaign.cost_per_lead > 0) 
            ? Math.floor((budget - spent) / campaign.cost_per_lead) 
            : 0;
        const statusClass = getStatusClass(campaign.status);
        const statusLabel = getStatusLabel(campaign.status);
        const productTitle = campaign.ads?.title || 'Unknown Product';
        const productImage = campaign.ads?.image_urls?.[0] || campaign.image_url || 'https://via.placeholder.com/80x80/6B21E5/FFFFFF?text=Product';
        
        return `
            <div class="campaign-item" data-id="${campaign.id}" style="background: white; border-radius: 20px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <div style="display: flex; padding: 16px;">
                    <div style="width: 70px; height: 70px; border-radius: 12px; overflow: hidden; margin-right: 12px; flex-shrink: 0;">
                        <img src="${productImage}" alt="${escapeHtml(productTitle)}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div>
                                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(campaign.name)}</h3>
                                <p style="font-size: 12px; color: #64748B;">${escapeHtml(productTitle)}</p>
                            </div>
                            <div class="campaign-status ${statusClass}" style="padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; background: ${statusClass === 'status-active' ? '#D1FAE5' : statusClass === 'status-pending' ? '#FEF3C7' : '#F1F5F9'}; color: ${statusClass === 'status-active' ? '#10B981' : statusClass === 'status-pending' ? '#F59E0B' : '#64748B'};">
                                ${statusLabel}
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 12px;">
                            <div>
                                <span style="color: #64748B;">Budget:</span>
                                <span style="font-weight: 500;">${formatCurrency(budget)}</span>
                            </div>
                            <div>
                                <span style="color: #64748B;">Spent:</span>
                                <span style="font-weight: 500;">${formatCurrency(spent)}</span>
                            </div>
                            <div>
                                <span style="color: #64748B;">CPL:</span>
                                <span style="font-weight: 500; color: #6B21E5;">${formatCurrency(campaign.cost_per_lead)}</span>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748B; margin-bottom: 4px;">
                                <span>Progress</span>
                                <span>${Math.round(progress)}%</span>
                            </div>
                            <div class="progress-bar" style="height: 6px; background: #E2E8F0; border-radius: 3px; overflow: hidden;">
                                <div class="progress-fill" style="width: ${progress}%; height: 100%; background: #6B21E5; border-radius: 3px;"></div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 16px; margin-bottom: 16px; font-size: 12px;">
                            <div>
                                <i class="fas fa-users"></i>
                                <span style="color: #64748B;"> Leads:</span>
                                <span style="font-weight: 500;">${campaign.leads_count || 0}</span>
                                <span style="font-size: 10px; color: #10B981;"> (${campaign.verified_leads_count || 0} verified)</span>
                            </div>
                            <div>
                                <i class="fas fa-chart-line"></i>
                                <span style="color: #64748B;"> Remaining:</span>
                                <span style="font-weight: 500;">${remainingLeads}</span>
                            </div>
                            ${campaign.target_leads ? `
                                <div>
                                    <i class="fas fa-bullseye"></i>
                                    <span style="color: #64748B;"> Target:</span>
                                    <span style="font-weight: 500;">${campaign.target_leads}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div style="display: flex; gap: 12px;">
                            <button onclick="viewLeads('${campaign.id}')" style="flex: 1; padding: 8px; background: #F1F5F9; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                                <i class="fas fa-users"></i> View Leads (${campaign.pending_leads_count || 0} pending)
                            </button>
                            ${campaign.status === 'active' ? `
                                <button onclick="pauseCampaign('${campaign.id}')" style="padding: 8px 16px; background: #FEF3C7; border: none; border-radius: 30px; font-size: 12px; cursor: pointer; color: #D97706;">
                                    <i class="fas fa-pause"></i> Pause
                                </button>
                            ` : campaign.status === 'draft' ? `
                                <button onclick="launchCampaign('${campaign.id}')" style="padding: 8px 16px; background: #6B21E5; border: none; border-radius: 30px; font-size: 12px; cursor: pointer; color: white;">
                                    <i class="fas fa-rocket"></i> Launch
                                </button>
                                <button onclick="editCampaign('${campaign.id}')" style="padding: 8px 16px; background: #F1F5F9; border: none; border-radius: 30px; font-size: 12px; cursor: pointer;">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            ` : campaign.status === 'paused' ? `
                                <button onclick="resumeCampaign('${campaign.id}')" style="padding: 8px 16px; background: #10B981; border: none; border-radius: 30px; font-size: 12px; cursor: pointer; color: white;">
                                    <i class="fas fa-play"></i> Resume
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// CAMPAIGN ACTIONS
// ============================================

async function createCampaign(formData) {
    showLoading(true, 'Creating campaign...');
    
    try {
        const { data, error } = await sb
            .from('campaigns')
            .insert({
                supplier_id: supplierData.id,
                ad_id: formData.productId,
                name: formData.name,
                description: formData.description,
                promo_message: formData.promoMessage,
                budget: formData.budget,
                cost_per_lead: formData.costPerLead,
                target_leads: formData.targetLeads || null,
                target_regions: formData.targetRegions || [],
                start_date: formData.startDate || null,
                end_date: formData.endDate || null,
                status: 'pending',
                spent: 0
            })
            .select()
            .single();
        
        if (error) throw error;
        
        campaigns.unshift(data);
        renderCampaigns();
        updateStats();
        
        showToast('Campaign created! Waiting for admin approval.', 'success');
        closeModal('createCampaignModal');
        
    } catch (error) {
        console.error('Error creating campaign:', error);
        showToast(error.message || 'Failed to create campaign. Please try again.', 'error');
    }
    
    showLoading(false);
}

async function pauseCampaign(campaignId) {
    if (!confirm('Pause this campaign? Marketers will no longer be able to promote it.')) return;
    
    showLoading(true, 'Pausing campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({ status: 'paused' })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        // Update local state
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign) campaign.status = 'paused';
        
        renderCampaigns();
        updateStats();
        showToast('Campaign paused', 'success');
        
    } catch (error) {
        console.error('Error pausing campaign:', error);
        showToast('Error pausing campaign', 'error');
    }
    
    showLoading(false);
}

async function resumeCampaign(campaignId) {
    if (!confirm('Resume this campaign? It will become available to marketers again.')) return;
    
    showLoading(true, 'Resuming campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({ status: 'active' })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign) campaign.status = 'active';
        
        renderCampaigns();
        updateStats();
        showToast('Campaign resumed', 'success');
        
    } catch (error) {
        console.error('Error resuming campaign:', error);
        showToast('Error resuming campaign', 'error');
    }
    
    showLoading(false);
}

async function launchCampaign(campaignId) {
    if (!confirm('Launch this campaign? It will become available to marketers.')) return;
    
    showLoading(true, 'Launching campaign...');
    
    try {
        const { error } = await sb
            .from('campaigns')
            .update({ 
                status: 'active', 
                start_date: new Date().toISOString() 
            })
            .eq('id', campaignId);
        
        if (error) throw error;
        
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign) {
            campaign.status = 'active';
            campaign.start_date = new Date().toISOString();
        }
        
        renderCampaigns();
        updateStats();
        showToast('Campaign launched! Marketers can now promote it.', 'success');
        
    } catch (error) {
        console.error('Error launching campaign:', error);
        showToast('Error launching campaign', 'error');
    }
    
    showLoading(false);
}

async function editCampaign(campaignId) {
    showToast('Edit feature coming soon', 'info');
}

// ============================================
// LEAD MANAGEMENT
// ============================================

async function viewLeads(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    
    showLoading(true, 'Loading leads...');
    
    try {
        const { data: leads, error } = await sb
            .from('leads')
            .select(`
                *,
                profiles:marketer_id (full_name, phone, email)
            `)
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        showLeadsModal(campaign, leads || []);
        
    } catch (error) {
        console.error('Error loading leads:', error);
        showToast('Error loading leads', 'error');
    }
    
    showLoading(false);
}

function showLeadsModal(campaign, leads) {
    // Remove existing modal if any
    const existingModal = document.getElementById('leadsModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'leadsModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 2000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background: white; width: 100%; max-width: 600px; border-radius: 24px; margin: 40px auto; overflow: hidden;">
            <div style="padding: 20px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0;">Leads for: ${escapeHtml(campaign.name)}</h3>
                <button id="closeLeadsModal" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            <div style="padding: 20px; max-height: 500px; overflow-y: auto;">
                ${leads.length === 0 ? `
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-users" style="font-size: 48px; color: #94A3B8; margin-bottom: 16px;"></i>
                        <p style="color: #64748B;">No leads yet. Share your campaign to get leads!</p>
                    </div>
                ` : `
                    <div class="leads-list">
                        ${leads.map(lead => `
                            <div style="padding: 16px; border-bottom: 1px solid #E2E8F0;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <strong>${escapeHtml(lead.profiles?.full_name || 'Anonymous')}</strong>
                                    <span style="padding: 2px 8px; border-radius: 12px; font-size: 11px; background: ${lead.status === 'pending' ? '#FEF3C7' : lead.status === 'verified' ? '#D1FAE5' : '#FEE2E2'}; color: ${lead.status === 'pending' ? '#F59E0B' : lead.status === 'verified' ? '#10B981' : '#EF4444'}">
                                        ${lead.status.toUpperCase()}
                                    </span>
                                </div>
                                <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">
                                    <i class="fas fa-phone"></i> ${escapeHtml(lead.profiles?.phone || lead.lead_data?.phone || 'No phone')}
                                </div>
                                <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">
                                    <i class="fas fa-calendar"></i> ${formatDateTime(lead.created_at)}
                                </div>
                                ${lead.lead_type ? `
                                    <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">
                                        <i class="fas fa-tag"></i> Type: ${lead.lead_type.toUpperCase()}
                                    </div>
                                ` : ''}
                                ${lead.status === 'pending' ? `
                                    <div style="margin-top: 12px;">
                                        <button onclick="verifyLead('${lead.id}')" style="padding: 6px 16px; background: #10B981; color: white; border: none; border-radius: 20px; font-size: 12px; cursor: pointer;">
                                            <i class="fas fa-check"></i> Verify Lead
                                        </button>
                                        <button onclick="rejectLead('${lead.id}')" style="margin-left: 8px; padding: 6px 16px; background: #EF4444; color: white; border: none; border-radius: 20px; font-size: 12px; cursor: pointer;">
                                            <i class="fas fa-times"></i> Reject
                                        </button>
                                    </div>
                                ` : lead.status === 'verified' && lead.reward_amount ? `
                                    <div style="margin-top: 8px; font-size: 13px; color: #10B981;">
                                        <i class="fas fa-money-bill-wave"></i> Paid: ${formatCurrency(lead.reward_amount)}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('closeLeadsModal').onclick = () => modal.remove();
    
    // Click outside to close
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

async function verifyLead(leadId) {
    showLoading(true, 'Verifying lead...');
    
    try {
        const { data: lead, error: leadError } = await sb
            .from('leads')
            .select('*, campaigns:campaign_id (cost_per_lead)')
            .eq('id', leadId)
            .single();
        
        if (leadError) throw leadError;
        
        // Calculate reward amount
        const rewardAmount = lead.campaigns?.cost_per_lead || 0;
        
        // Update lead status
        const { error: updateError } = await sb
            .from('leads')
            .update({
                status: 'verified',
                verified_by: currentUser.id,
                verified_at: new Date().toISOString(),
                reward_amount: rewardAmount
            })
            .eq('id', leadId);
        
        if (updateError) throw updateError;
        
        // Update marketer's wallet
        const { data: wallet } = await sb
            .from('wallets')
            .select('marketer_balance')
            .eq('user_id', lead.marketer_id)
            .single();
        
        if (wallet) {
            await sb
                .from('wallets')
                .update({
                    marketer_balance: (wallet.marketer_balance || 0) + rewardAmount,
                    total_earned: (wallet.total_earned || 0) + rewardAmount
                })
                .eq('user_id', lead.marketer_id);
        }
        
        // Update campaign spent
        const { data: campaign } = await sb
            .from('campaigns')
            .select('spent')
            .eq('id', lead.campaign_id)
            .single();
        
        if (campaign) {
            await sb
                .from('campaigns')
                .update({
                    spent: (campaign.spent || 0) + rewardAmount
                })
                .eq('id', lead.campaign_id);
        }
        
        // Record transaction
        await sb
            .from('transactions')
            .insert({
                user_id: lead.marketer_id,
                type: 'earning',
                amount: rewardAmount,
                balance_before: wallet?.marketer_balance || 0,
                balance_after: (wallet?.marketer_balance || 0) + rewardAmount,
                description: `Lead verification for campaign`,
                reference_id: leadId,
                reference_type: 'lead',
                status: 'completed',
                completed_at: new Date().toISOString()
            });
        
        showToast('Lead verified! Marketer has been paid.', 'success');
        
        // Close modal and refresh
        const modal = document.getElementById('leadsModal');
        if (modal) modal.remove();
        
        await loadCampaigns();
        
    } catch (error) {
        console.error('Error verifying lead:', error);
        showToast('Error verifying lead', 'error');
    }
    
    showLoading(false);
}

async function rejectLead(leadId) {
    if (!confirm('Reject this lead? The marketer will not be paid.')) return;
    
    showLoading(true, 'Rejecting lead...');
    
    try {
        const { error } = await sb
            .from('leads')
            .update({
                status: 'rejected',
                notes: 'Rejected by supplier'
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        showToast('Lead rejected', 'success');
        
        // Close modal and refresh
        const modal = document.getElementById('leadsModal');
        if (modal) modal.remove();
        
        await loadCampaigns();
        
    } catch (error) {
        console.error('Error rejecting lead:', error);
        showToast('Error rejecting lead', 'error');
    }
    
    showLoading(false);
}

// ============================================
// TOP UP FUNCTION
// ============================================

async function topUpWallet(amount, method, phone, network) {
    showLoading(true, 'Processing payment...');
    
    try {
        // In production, integrate with MTN/Airtel API
        // For MVP, simulate payment
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Get current wallet
        const { data: wallet, error: walletError } = await sb
            .from('wallets')
            .select('supplier_balance')
            .eq('user_id', currentUser.id)
            .single();
        
        if (walletError) throw walletError;
        
        const newBalance = (wallet?.supplier_balance || 0) + amount;
        
        const { error: updateError } = await sb
            .from('wallets')
            .update({ supplier_balance: newBalance })
            .eq('user_id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Record transaction
        await sb
            .from('transactions')
            .insert({
                user_id: currentUser.id,
                type: 'deposit',
                amount: amount,
                balance_before: wallet?.supplier_balance || 0,
                balance_after: newBalance,
                description: `Wallet top up via ${method}`,
                status: 'completed',
                completed_at: new Date().toISOString()
            });
        
        await loadWallet();
        showToast(`Successfully added ${formatCurrency(amount)} to your wallet!`, 'success');
        closeModal('topupModal');
        
    } catch (error) {
        console.error('Error topping up:', error);
        showToast('Payment failed. Please try again.', 'error');
    }
    
    showLoading(false);
}

function updateCampaignSummary() {
    const budget = parseFloat(document.getElementById('campaignBudget')?.value) || 0;
    const cpl = parseFloat(document.getElementById('costPerLead')?.value) || 0;
    const estimatedLeads = budget > 0 && cpl > 0 ? Math.floor(budget / cpl) : 0;
    
    const summaryBudget = document.getElementById('summaryBudget');
    const summaryCPL = document.getElementById('summaryCPL');
    const summaryLeads = document.getElementById('summaryLeads');
    
    if (summaryBudget) summaryBudget.textContent = formatCurrency(budget);
    if (summaryCPL) summaryCPL.textContent = formatCurrency(cpl);
    if (summaryLeads) summaryLeads.textContent = estimatedLeads;
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
    // Create campaign button
    const createBtn = document.getElementById('createCampaignBtn');
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            await loadProducts();
            openModal('createCampaignModal');
        });
    }
    
    // Top up button
    const topupBtn = document.getElementById('topupBtn');
    if (topupBtn) {
        topupBtn.addEventListener('click', () => {
            openModal('topupModal');
        });
    }
    
    // Tab switching
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.getAttribute('data-tab');
            renderCampaigns();
        });
    });
    
    // Create campaign form
    const campaignForm = document.getElementById('createCampaignForm');
    if (campaignForm) {
        campaignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                productId: document.getElementById('productSelect')?.value,
                name: document.getElementById('campaignName')?.value,
                description: document.getElementById('campaignDescription')?.value,
                promoMessage: document.getElementById('promoMessage')?.value,
                budget: parseFloat(document.getElementById('campaignBudget')?.value),
                costPerLead: parseFloat(document.getElementById('costPerLead')?.value),
                targetLeads: parseInt(document.getElementById('targetLeads')?.value) || null,
                targetRegions: Array.from(document.getElementById('targetRegions')?.selectedOptions || []).map(opt => opt.value),
                startDate: document.getElementById('startDate')?.value || null,
                endDate: document.getElementById('endDate')?.value || null
            };
            
            if (!formData.productId) {
                showToast('Please select a product', 'error');
                return;
            }
            
            if (!formData.name) {
                showToast('Please enter a campaign name', 'error');
                return;
            }
            
            if (formData.budget < 10000) {
                showToast('Minimum budget is UGX 10,000', 'error');
                return;
            }
            
            if (formData.costPerLead < 500 || formData.costPerLead > 5000) {
                showToast('Cost per lead must be between UGX 500 and 5,000', 'error');
                return;
            }
            
            await createCampaign(formData);
        });
    }
    
    // Campaign summary updates
    const budgetInput = document.getElementById('campaignBudget');
    const cplInput = document.getElementById('costPerLead');
    if (budgetInput && cplInput) {
        budgetInput.addEventListener('input', updateCampaignSummary);
        cplInput.addEventListener('input', updateCampaignSummary);
    }
    
    // Top up form
    const topupForm = document.getElementById('topupForm');
    if (topupForm) {
        topupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const amount = parseFloat(document.getElementById('topupAmount')?.value);
            const method = document.getElementById('paymentMethod')?.value;
            const phone = document.getElementById('mobileNumber')?.value;
            const network = document.getElementById('selectedNetwork')?.value;
            
            if (amount < 10000) {
                showToast('Minimum top up is UGX 10,000', 'error');
                return;
            }
            
            if (method === 'mobile_money' && (!phone || phone.length < 10)) {
                showToast('Please enter a valid mobile money number', 'error');
                return;
            }
            
            await topUpWallet(amount, method, phone, network);
        });
    }
    
    // Payment method switching
    const paymentMethods = document.querySelectorAll('.payment-method');
    paymentMethods.forEach(method => {
        method.addEventListener('click', () => {
            paymentMethods.forEach(m => m.classList.remove('active'));
            method.classList.add('active');
            const methodValue = method.getAttribute('data-method');
            const paymentMethodInput = document.getElementById('paymentMethod');
            if (paymentMethodInput) paymentMethodInput.value = methodValue;
            
            const mobileMoneyFields = document.getElementById('mobileMoneyFields');
            const cardFields = document.getElementById('cardFields');
            
            if (mobileMoneyFields) mobileMoneyFields.style.display = methodValue === 'mobile_money' ? 'block' : 'none';
            if (cardFields) cardFields.style.display = methodValue === 'card' ? 'block' : 'none';
        });
    });
    
    // Network selection
    const networkOptions = document.querySelectorAll('.network-option');
    networkOptions.forEach(option => {
        option.addEventListener('click', () => {
            networkOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            const selectedNetwork = document.getElementById('selectedNetwork');
            if (selectedNetwork) selectedNetwork.value = option.getAttribute('data-network');
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

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading(true, 'Loading your campaigns...');
    
    const isSupplier = await checkSupplierAuth();
    
    if (currentUser && supplierData) {
        await Promise.all([
            loadWallet(),
            loadCampaigns()
        ]);
    } else {
        showNoSupplierAccess();
    }
    
    showLoading(false);
    setupEventListeners();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Make functions global for onclick
window.viewLeads = viewLeads;
window.verifyLead = verifyLead;
window.rejectLead = rejectLead;
window.pauseCampaign = pauseCampaign;
window.resumeCampaign = resumeCampaign;
window.launchCampaign = launchCampaign;
window.editCampaign = editCampaign;
window.closeModal = closeModal;