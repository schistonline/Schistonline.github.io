// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let supplierProfile = null;
let campaigns = [];
let packages = [];
let products = [];
let selectedPackage = null;
let performanceChart = null;
let walletBalance = 0;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadSupplierProfile();
    await loadWalletBalance();
    await loadPackages();
    await loadProducts();
    await loadCampaigns();
    setupEventListeners();
    initChart();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=supplier-sponsored.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function loadSupplierProfile() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', currentUser.id)
            .single();
            
        if (error) throw error;
        supplierProfile = data;
    } catch (error) {
        console.error('Error loading supplier profile:', error);
        showToast('Error loading supplier profile');
    }
}

async function loadWalletBalance() {
    try {
        // Get wallet balance (you may have a separate wallet table)
        const { data, error } = await sb
            .from('supplier_wallets')
            .select('balance')
            .eq('supplier_id', supplierProfile.id)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error;
        
        walletBalance = data?.balance || 0;
        document.getElementById('walletBalance').textContent = `UGX ${formatNumber(walletBalance)}`;
        
    } catch (error) {
        console.error('Error loading wallet balance:', error);
    }
}

// ============================================
// LOAD PACKAGES
// ============================================
async function loadPackages() {
    try {
        const { data, error } = await sb
            .from('supplier_spotlight_packages')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });
            
        if (error) throw error;
        
        packages = data || [];
        renderPackages();
        renderPackageSelector();
        
    } catch (error) {
        console.error('Error loading packages:', error);
        showToast('Failed to load packages');
    }
}

function renderPackages() {
    const container = document.getElementById('packagesGrid');
    if (!container) return;
    
    container.innerHTML = packages.map(pkg => `
        <div class="package-card" onclick="selectPackage(${pkg.id})">
            ${pkg.badge_text ? `<div class="package-badge">${pkg.badge_text}</div>` : ''}
            <div class="package-name">${escapeHtml(pkg.package_name)}</div>
            <div class="package-price">UGX ${formatNumber(pkg.price)} <small>for ${pkg.duration_days} days</small></div>
            <div class="package-duration">${pkg.duration_days} days of exposure</div>
            <ul class="package-features">
                ${(pkg.benefits || []).map(benefit => `
                    <li><i class="fas fa-check-circle"></i> ${escapeHtml(benefit)}</li>
                `).join('')}
            </ul>
            <div class="package-footer">
                <button class="btn-primary" onclick="event.stopPropagation(); selectPackage(${pkg.id})">Choose Package</button>
            </div>
        </div>
    `).join('');
}

function renderPackageSelector() {
    const container = document.getElementById('packageSelector');
    if (!container) return;
    
    container.innerHTML = `
        <div class="package-option" onclick="selectPackageOption(null)">
            <div class="package-option-name">Custom Campaign</div>
            <div class="package-option-price">Set your own</div>
            <div class="package-option-duration">Flexible budget & duration</div>
        </div>
        ${packages.map(pkg => `
            <div class="package-option" data-package-id="${pkg.id}" onclick="selectPackageOption(${pkg.id})">
                <div class="package-option-name">${escapeHtml(pkg.package_name)}</div>
                <div class="package-option-price">UGX ${formatNumber(pkg.price)}</div>
                <div class="package-option-duration">${pkg.duration_days} days</div>
            </div>
        `).join('')}
    `;
}

// ============================================
// LOAD PRODUCTS
// ============================================
async function loadProducts() {
    try {
        const { data, error } = await sb
            .from('ads')
            .select('id, title, price, image_urls, status')
            .eq('supplier_id', supplierProfile.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        products = data || [];
        
        const productSelect = document.getElementById('campaignProduct');
        if (productSelect) {
            productSelect.innerHTML = '<option value="">Choose a product to promote</option>' +
                products.map(p => `<option value="${p.id}">${escapeHtml(p.title)} - UGX ${formatNumber(p.price)}</option>`).join('');
        }
        
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Failed to load products');
    }
}

// ============================================
// LOAD CAMPAIGNS
// ============================================
async function loadCampaigns() {
    showLoading(true);
    
    try {
        const { data, error } = await sb
            .from('sponsored_products')
            .select(`
                *,
                ads!inner (
                    id,
                    title,
                    image_urls
                )
            `)
            .eq('supplier_id', supplierProfile.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        campaigns = data || [];
        
        updateStats();
        renderCampaigns('active');
        renderCampaigns('pending');
        renderCampaigns('ended');
        renderTopProducts();
        
    } catch (error) {
        console.error('Error loading campaigns:', error);
        showToast('Failed to load campaigns');
    } finally {
        showLoading(false);
    }
}

function updateStats() {
    const active = campaigns.filter(c => c.status === 'active').length;
    const impressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const clicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const spent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0);
    
    document.getElementById('activeCampaigns').textContent = active;
    document.getElementById('totalImpressions').textContent = formatNumber(impressions);
    document.getElementById('totalClicks').textContent = formatNumber(clicks);
    document.getElementById('totalSpent').textContent = `UGX ${formatNumber(spent)}`;
}

function renderCampaigns(status) {
    const container = document.getElementById(`${status}Campaigns`);
    if (!container) return;
    
    const filtered = campaigns.filter(c => c.status === status);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">No ${status} campaigns</div>`;
        return;
    }
    
    container.innerHTML = filtered.map(campaign => {
        const product = campaign.ads || {};
        const spentPercent = campaign.budget ? (campaign.spent / campaign.budget) * 100 : 0;
        const daysLeft = Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const ctr = campaign.impressions ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : 0;
        
        return `
            <div class="campaign-card" data-campaign-id="${campaign.id}">
                <div class="campaign-header">
                    <div>
                        <h3 class="campaign-title">${escapeHtml(campaign.campaign_name || product.title || 'Campaign')}</h3>
                        <div class="campaign-product">${escapeHtml(product.title || 'Unknown Product')}</div>
                    </div>
                    <span class="status-badge ${campaign.status}">${campaign.status}</span>
                </div>
                
                <div class="campaign-progress">
                    <div class="progress-label">
                        <span>Budget Used</span>
                        <span>UGX ${formatNumber(campaign.spent || 0)} / UGX ${formatNumber(campaign.budget || 0)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${spentPercent}%"></div>
                    </div>
                </div>
                
                <div class="campaign-stats">
                    <div class="campaign-stat">
                        <span class="stat-number">${formatNumber(campaign.impressions || 0)}</span>
                        <span class="stat-label">Impressions</span>
                    </div>
                    <div class="campaign-stat">
                        <span class="stat-number">${formatNumber(campaign.clicks || 0)}</span>
                        <span class="stat-label">Clicks</span>
                    </div>
                    <div class="campaign-stat">
                        <span class="stat-number">${ctr}%</span>
                        <span class="stat-label">CTR</span>
                    </div>
                </div>
                
                <div class="campaign-footer">
                    <div class="campaign-dates">
                        <i class="far fa-calendar"></i>
                        ${daysLeft > 0 ? `${daysLeft} days left` : 'Ended'}
                    </div>
                    <div class="campaign-actions">
                        <button class="action-btn" onclick="viewCampaign(${campaign.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${campaign.status === 'active' ? `
                            <button class="action-btn warning" onclick="showPauseModal(${campaign.id})" title="Pause">
                                <i class="fas fa-pause"></i>
                            </button>
                            <button class="action-btn danger" onclick="showEndModal(${campaign.id})" title="End">
                                <i class="fas fa-stop"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// PACKAGE SELECTION
// ============================================
window.selectPackage = function(packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return;
    
    // Fill campaign form with package details
    document.getElementById('campaignDuration').value = pkg.duration_days;
    document.getElementById('dailyBudget').value = Math.round(pkg.price / pkg.duration_days / 1000) * 1000;
    
    // Show campaign modal
    document.getElementById('campaignModal').classList.add('show');
};

window.selectPackageOption = function(packageId) {
    // Remove selected class from all options
    document.querySelectorAll('.package-option').forEach(opt => opt.classList.remove('selected'));
    
    if (packageId) {
        // Package selected
        const option = document.querySelector(`.package-option[data-package-id="${packageId}"]`);
        if (option) option.classList.add('selected');
        
        const pkg = packages.find(p => p.id === packageId);
        selectedPackage = pkg;
        
        // Hide custom duration
        document.getElementById('customDuration').style.display = 'none';
        
        // Update summary
        document.getElementById('summaryDuration').textContent = `${pkg.duration_days} days`;
        document.getElementById('summaryDaily').textContent = `UGX ${formatNumber(Math.round(pkg.price / pkg.duration_days / 1000) * 1000)}`;
        document.getElementById('summaryTotal').textContent = `UGX ${formatNumber(pkg.price)}`;
        
    } else {
        // Custom campaign
        selectedPackage = null;
        document.getElementById('customDuration').style.display = 'block';
        updateCampaignSummary();
    }
}

function updateCampaignSummary() {
    const duration = parseInt(document.getElementById('campaignDuration').value) || 7;
    const daily = parseInt(document.getElementById('dailyBudget').value) || 5000;
    const total = duration * daily;
    
    document.getElementById('summaryDuration').textContent = `${duration} days`;
    document.getElementById('summaryDaily').textContent = `UGX ${formatNumber(daily)}`;
    document.getElementById('summaryTotal').textContent = `UGX ${formatNumber(total)}`;
}

// ============================================
// CREATE CAMPAIGN
// ============================================
async function createCampaign() {
    const productId = document.getElementById('campaignProduct').value;
    const campaignName = document.getElementById('campaignName').value || 'Sponsored Campaign';
    const targetAudience = document.getElementById('targetAudience').value;
    const targetRegions = Array.from(document.getElementById('targetRegions').selectedOptions).map(o => o.value);
    const terms = document.getElementById('acceptTerms').checked;
    
    if (!productId) {
        showToast('Please select a product', 'error');
        return;
    }
    
    if (!terms) {
        showToast('Please accept the terms', 'error');
        return;
    }
    
    let duration, dailyBudget, totalBudget;
    
    if (selectedPackage) {
        duration = selectedPackage.duration_days;
        dailyBudget = Math.round(selectedPackage.price / selectedPackage.duration_days / 1000) * 1000;
        totalBudget = selectedPackage.price;
    } else {
        duration = parseInt(document.getElementById('campaignDuration').value) || 7;
        dailyBudget = parseInt(document.getElementById('dailyBudget').value) || 5000;
        totalBudget = duration * dailyBudget;
    }
    
    // Check wallet balance
    if (walletBalance < totalBudget) {
        showToast('Insufficient balance. Please add funds.', 'error');
        document.getElementById('fundsModal').classList.add('show');
        return;
    }
    
    showLoading(true, 'Creating campaign...');
    
    try {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + duration);
        
        const campaignData = {
            ad_id: productId,
            supplier_id: supplierProfile.id,
            campaign_name: campaignName,
            budget: totalBudget,
            spent: 0,
            bid_type: selectedPackage ? 'fixed' : 'cpc',
            bid_amount: dailyBudget,
            priority: selectedPackage?.display_priority || 1,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            target_audience: { type: targetAudience },
            target_categories: [],
            target_regions: targetRegions,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            status: 'pending' // Admin approval
        };
        
        const { data, error } = await sb
            .from('sponsored_products')
            .insert(campaignData)
            .select()
            .single();
            
        if (error) throw error;
        
        // Deduct from wallet (you'll implement wallet system)
        await deductFromWallet(totalBudget);
        
        showSuccess('Campaign created successfully! It will start after admin approval.');
        closeCampaignModal();
        await loadCampaigns();
        
    } catch (error) {
        console.error('Error creating campaign:', error);
        showToast('Failed to create campaign', 'error');
    } finally {
        showLoading(false);
    }
}

async function deductFromWallet(amount) {
    // Implement wallet deduction
    walletBalance -= amount;
    document.getElementById('walletBalance').textContent = `UGX ${formatNumber(walletBalance)}`;
}

// ============================================
// CAMPAIGN ACTIONS
// ============================================
window.viewCampaign = function(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    
    const details = document.getElementById('campaignDetails');
    const product = campaign.ads || {};
    const ctr = campaign.impressions ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : 0;
    const spentPercent = campaign.budget ? (campaign.spent / campaign.budget) * 100 : 0;
    
    details.innerHTML = `
        <div class="campaign-detail">
            <h4>${escapeHtml(campaign.campaign_name || product.title || 'Campaign')}</h4>
            <p class="text-muted">Product: ${escapeHtml(product.title || 'Unknown')}</p>
            
            <div class="detail-section">
                <h5>Performance</h5>
                <div class="detail-row">
                    <span>Impressions:</span>
                    <span class="value">${formatNumber(campaign.impressions || 0)}</span>
                </div>
                <div class="detail-row">
                    <span>Clicks:</span>
                    <span class="value">${formatNumber(campaign.clicks || 0)}</span>
                </div>
                <div class="detail-row">
                    <span>CTR:</span>
                    <span class="value">${ctr}%</span>
                </div>
                <div class="detail-row">
                    <span>Conversions:</span>
                    <span class="value">${campaign.conversions || 0}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h5>Budget</h5>
                <div class="detail-row">
                    <span>Total Budget:</span>
                    <span class="value">UGX ${formatNumber(campaign.budget || 0)}</span>
                </div>
                <div class="detail-row">
                    <span>Spent:</span>
                    <span class="value">UGX ${formatNumber(campaign.spent || 0)}</span>
                </div>
                <div class="detail-row">
                    <span>Remaining:</span>
                    <span class="value">UGX ${formatNumber((campaign.budget || 0) - (campaign.spent || 0))}</span>
                </div>
                <div class="progress-bar" style="margin-top: 10px;">
                    <div class="progress-fill" style="width: ${spentPercent}%"></div>
                </div>
            </div>
            
            <div class="detail-section">
                <h5>Schedule</h5>
                <div class="detail-row">
                    <span>Start Date:</span>
                    <span class="value">${formatDate(campaign.start_date)}</span>
                </div>
                <div class="detail-row">
                    <span>End Date:</span>
                    <span class="value">${formatDate(campaign.end_date)}</span>
                </div>
                <div class="detail-row">
                    <span>Status:</span>
                    <span class="value ${campaign.status}">${campaign.status}</span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('detailsModal').classList.add('show');
};

window.showPauseModal = function(campaignId) {
    document.getElementById('pauseModal').dataset.campaignId = campaignId;
    document.getElementById('pauseModal').classList.add('show');
};

window.pauseCampaign = async function() {
    const campaignId = document.getElementById('pauseModal').dataset.campaignId;
    
    try {
        const { error } = await sb
            .from('sponsored_products')
            .update({ status: 'paused' })
            .eq('id', campaignId);
            
        if (error) throw error;
        
        showToast('Campaign paused');
        closePauseModal();
        await loadCampaigns();
        
    } catch (error) {
        console.error('Error pausing campaign:', error);
        showToast('Failed to pause campaign', 'error');
    }
};

window.showEndModal = function(campaignId) {
    document.getElementById('endModal').dataset.campaignId = campaignId;
    document.getElementById('endModal').classList.add('show');
};

window.endCampaign = async function() {
    const campaignId = document.getElementById('endModal').dataset.campaignId;
    
    try {
        const campaign = campaigns.find(c => c.id === parseInt(campaignId));
        
        // Calculate refund
        const daysLeft = Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const dailyRate = campaign.budget / Math.ceil((new Date(campaign.end_date) - new Date(campaign.start_date)) / (1000 * 60 * 60 * 24));
        const refund = Math.max(0, daysLeft * dailyRate);
        
        // Update campaign
        const { error } = await sb
            .from('sponsored_products')
            .update({ 
                status: 'ended',
                ended_early: true,
                refund_amount: refund
            })
            .eq('id', campaignId);
            
        if (error) throw error;
        
        // Refund to wallet
        if (refund > 0) {
            walletBalance += refund;
            document.getElementById('walletBalance').textContent = `UGX ${formatNumber(walletBalance)}`;
        }
        
        showToast('Campaign ended. Refund processed.');
        closeEndModal();
        await loadCampaigns();
        
    } catch (error) {
        console.error('Error ending campaign:', error);
        showToast('Failed to end campaign', 'error');
    }
};

// ============================================
// ANALYTICS
// ============================================
function initChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: getLast30Days(),
            datasets: [
                {
                    label: 'Impressions',
                    data: generateRandomData(30, 100, 1000),
                    borderColor: '#0B4F6C',
                    backgroundColor: 'rgba(11, 79, 108, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Clicks',
                    data: generateRandomData(30, 5, 50),
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Impressions'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Clicks'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function getLast30Days() {
    const labels = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    return labels;
}

function generateRandomData(count, min, max) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min + 1)) + min);
}

function updateMetrics() {
    // Calculate metrics from actual campaign data
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalSpent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0);
    
    const avgCTR = totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0;
    const avgCPC = totalClicks ? totalSpent / totalClicks : 0;
    const avgImpressions = campaigns.length ? Math.round(totalImpressions / campaigns.length) : 0;
    
    // ROI calculation (you'd need revenue data)
    const roi = 0;
    
    document.getElementById('avgCTR').textContent = `${avgCTR}%`;
    document.getElementById('avgCPC').textContent = `UGX ${formatNumber(Math.round(avgCPC))}`;
    document.getElementById('avgImpressions').textContent = formatNumber(avgImpressions);
    document.getElementById('roi').textContent = `${roi}%`;
}

function renderTopProducts() {
    const container = document.getElementById('topProducts');
    
    // Sort campaigns by performance
    const productPerformance = campaigns
        .filter(c => c.impressions > 0)
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 5);
    
    if (productPerformance.length === 0) {
        container.innerHTML = '<p class="text-muted">No performance data yet</p>';
        return;
    }
    
    container.innerHTML = productPerformance.map((campaign, index) => {
        const product = campaign.ads || {};
        const ctr = campaign.impressions ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : 0;
        
        return `
            <div class="product-stat-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${escapeHtml(product.title || 'Unknown')}</div>
                    <div class="product-metrics">
                        <span>${formatNumber(campaign.impressions || 0)} impressions</span>
                        <span>${formatNumber(campaign.clicks || 0)} clicks</span>
                    </div>
                </div>
                <div class="product-stats">
                    <span class="product-ctr">${ctr}% CTR</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// PAYMENT FUNCTIONS
// ============================================
document.getElementById('paymentMethod')?.addEventListener('change', function() {
    const method = this.value;
    document.getElementById('mobileMoneyFields').style.display = method === 'mobile_money' ? 'block' : 'none';
    document.getElementById('bankFields').style.display = method === 'bank_transfer' ? 'block' : 'none';
});

document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        document.getElementById('customAmount').value = this.dataset.amount;
    });
});

window.processPayment = async function() {
    const amount = document.getElementById('customAmount').value;
    const method = document.getElementById('paymentMethod').value;
    
    if (!amount || amount < 10000) {
        showToast('Please enter a valid amount (minimum UGX 10,000)', 'error');
        return;
    }
    
    showLoading(true, 'Processing payment...');
    
    try {
        // Here you would integrate with payment gateway
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Add to wallet
        walletBalance += parseInt(amount);
        document.getElementById('walletBalance').textContent = `UGX ${formatNumber(walletBalance)}`;
        
        showSuccess(`UGX ${formatNumber(parseInt(amount))} added to wallet`);
        closeFundsModal();
        
    } catch (error) {
        console.error('Payment error:', error);
        showToast('Payment failed', 'error');
    } finally {
        showLoading(false);
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loadingState');
    const messageEl = overlay?.querySelector('p');
    
    if (show) {
        if (overlay) {
            if (messageEl) messageEl.textContent = message;
            overlay.style.display = 'flex';
        }
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = 'toast show';
    
    if (type === 'success') toast.style.background = 'var(--secondary)';
    else if (type === 'error') toast.style.background = 'var(--danger)';
    else toast.style.background = 'rgba(0,0,0,0.8)';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('show');
}

function formatNumber(num) {
    return num?.toLocaleString('en-UG') || '0';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-UG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.closeCampaignModal = () => document.getElementById('campaignModal').classList.remove('show');
window.closeFundsModal = () => document.getElementById('fundsModal').classList.remove('show');
window.closeDetailsModal = () => document.getElementById('detailsModal').classList.remove('show');
window.closePauseModal = () => document.getElementById('pauseModal').classList.remove('show');
window.closeEndModal = () => document.getElementById('endModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Create campaign button
    document.getElementById('createCampaignBtn')?.addEventListener('click', () => {
        document.getElementById('campaignModal').classList.add('show');
    });
    
    // Add funds button
    document.getElementById('addFundsBtn')?.addEventListener('click', () => {
        document.getElementById('fundsModal').classList.add('show');
    });
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');
            
            if (tab === 'analytics') {
                setTimeout(() => performanceChart?.update(), 100);
                updateMetrics();
            }
        });
    });
    
    // Campaign form updates
    document.getElementById('campaignDuration')?.addEventListener('input', updateCampaignSummary);
    document.getElementById('dailyBudget')?.addEventListener('input', updateCampaignSummary);
    
    // Chart period change
    document.getElementById('chartPeriod')?.addEventListener('change', function() {
        // Update chart data based on period
        // This would fetch real data
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCampaignModal();
                closeFundsModal();
                closeDetailsModal();
                closePauseModal();
                closeEndModal();
                closeSuccessModal();
            }
        });
    });
}

// Make functions globally available
window.selectPackage = selectPackage;
window.selectPackageOption = selectPackageOption;
window.viewCampaign = viewCampaign;
window.showPauseModal = showPauseModal;
window.pauseCampaign = pauseCampaign;
window.showEndModal = showEndModal;
window.endCampaign = endCampaign;
window.processPayment = processPayment;
window.closeCampaignModal = closeCampaignModal;
window.closeFundsModal = closeFundsModal;
window.closeDetailsModal = closeDetailsModal;
window.closePauseModal = closePauseModal;
window.closeEndModal = closeEndModal;
window.closeSuccessModal = closeSuccessModal;