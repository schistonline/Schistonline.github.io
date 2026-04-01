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
let products = [];
let categories = [];
let suppliers = [];
let sponsored = [];
let tests = [];
let currentPage = 1;
let totalPages = 1;
let rankingChart = null;
let ctrChart = null;
let conversionChart = null;
let revenueChart = null;
let searchChart = null;

// Ranking weights (default values)
let rankingWeights = {
    sales: 40,
    engagement: 30,
    quality: 20,
    reliability: 10,
    salesTotal: 40,
    sales30: 30,
    sales7: 30,
    views: 40,
    clicks: 30,
    inquiries: 30,
    rating: 40,
    conversion: 60,
    responseRate: 40,
    completionRate: 60,
    boost7: 10,
    boost30: 5
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await checkAdminStatus();
    await loadInitialData();
    setupEventListeners();
    setupCharts();
    await loadProducts();
    await loadSponsored();
    await loadTests();
    await loadCategories();
    await loadSuppliers();
    await loadStats();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=admin-rankings.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function checkAdminStatus() {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('is_admin, admin_role')
            .eq('id', currentUser.id)
            .single();
            
        if (error) throw error;
        
        if (!data.is_admin) {
            showToast('Admin access required');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        window.location.href = 'index.html';
    }
}

// ============================================
// LOAD INITIAL DATA
// ============================================
async function loadInitialData() {
    try {
        // Load saved weights from database or use defaults
        const { data, error } = await sb
            .from('admin_settings')
            .select('*')
            .eq('setting_key', 'ranking_weights')
            .single();
            
        if (data && data.setting_value) {
            rankingWeights = { ...rankingWeights, ...data.setting_value };
            updateWeightInputs();
        }
    } catch (error) {
        console.error('Error loading weights:', error);
    }
}

async function loadStats() {
    try {
        // Get average ranking score
        const { data: avgData } = await sb
            .from('ads')
            .select('ranking_score')
            .not('ranking_score', 'is', null);
            
        const avgScore = avgData?.reduce((sum, a) => sum + (a.ranking_score || 0), 0) / (avgData?.length || 1);
        document.getElementById('avgScore').textContent = Math.round(avgScore) || 0;
        
        // Count top 100 products
        const { count: topCount } = await sb
            .from('ads')
            .select('*', { count: 'exact', head: true })
            .gt('ranking_score', 50);
            
        document.getElementById('topProducts').textContent = topCount || 0;
        
        // Count sponsored products
        const { count: sponsoredCount } = await sb
            .from('sponsored_products')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
            
        document.getElementById('sponsoredCount').textContent = sponsoredCount || 0;
        
        // Last update time
        document.getElementById('lastUpdate').textContent = moment().format('HH:mm');
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadCategories() {
    try {
        const { data, error } = await sb
            .from('categories')
            .select('id, name')
            .eq('is_active', true)
            .order('name');
            
        if (error) throw error;
        
        categories = data || [];
        
        // Populate category filter
        const select = document.getElementById('categoryFilter');
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
        
        // Populate category grid
        renderCategoryGrid();
        
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadSuppliers() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select('id, business_name')
            .order('business_name')
            .limit(100);
            
        if (error) throw error;
        
        suppliers = data || [];
        
        // Populate supplier filter
        const select = document.getElementById('supplierFilter');
        suppliers.forEach(sup => {
            const option = document.createElement('option');
            option.value = sup.id;
            option.textContent = sup.business_name;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// ============================================
// PRODUCT MANAGEMENT
// ============================================
async function loadProducts() {
    try {
        const filters = getProductFilters();
        
        let query = sb
            .from('ads')
            .select(`
                *,
                categories!inner (name),
                suppliers!inner (
                    business_name,
                    verification_status
                )
            `)
            .eq('status', 'active')
            .order(filters.sortBy === 'ranking' ? 'ranking_score' : 
                   filters.sortBy === 'sales' ? 'total_sales' :
                   filters.sortBy === 'views' ? 'view_count' : 'inquiry_count', 
                   { ascending: false });
        
        if (filters.search) {
            query = query.ilike('title', `%${filters.search}%`);
        }
        
        if (filters.category) {
            query = query.eq('category_id', filters.category);
        }
        
        if (filters.supplier) {
            query = query.eq('supplier_id', filters.supplier);
        }
        
        // Pagination
        const from = (currentPage - 1) * 20;
        const to = from + 20 - 1;
        
        const { data, error, count } = await query
            .range(from, to)
            .select('*', { count: 'exact' });
            
        if (error) throw error;
        
        products = data || [];
        totalPages = Math.ceil((count || 0) / 20);
        
        renderProductsTable();
        renderPagination();
        
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Failed to load products');
    }
}

function getProductFilters() {
    return {
        search: document.getElementById('searchProducts')?.value || '',
        category: document.getElementById('categoryFilter')?.value || '',
        supplier: document.getElementById('supplierFilter')?.value || '',
        sortBy: document.getElementById('sortBy')?.value || 'ranking'
    };
}

function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    
    tbody.innerHTML = products.map(product => {
        const score = product.ranking_score || 0;
        const scorePercent = Math.min(score, 100);
        
        return `
            <tr>
                <td>
                    <div class="product-info">
                        <div class="product-image">
                            ${product.image_urls?.[0] ? 
                                `<img src="${product.image_urls[0]}" alt="${product.title}">` : 
                                '<i class="fas fa-box"></i>'
                            }
                        </div>
                        <div class="product-details">
                            <div class="product-title">${escapeHtml(product.title)}</div>
                            <div class="product-sku">SKU: ${product.sku || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td>${product.categories?.name || 'N/A'}</td>
                <td>${product.suppliers?.business_name || 'N/A'}</td>
                <td>${product.total_sales || 0}</td>
                <td>${product.view_count || 0}</td>
                <td>${product.inquiry_count || 0}</td>
                <td>${(product.avg_rating || 0).toFixed(1)} ⭐</td>
                <td>
                    <div class="ranking-score">${Math.round(score)}</div>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${scorePercent}%"></div>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="adjustRanking(${product.id}, '${escapeHtml(product.title)}', ${score})" title="Adjust Score">
                            <i class="fas fa-sliders-h"></i>
                        </button>
                        <button class="btn-icon" onclick="viewProductDetails(${product.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination() {
    const container = document.getElementById('pagination');
    let html = '';
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="page-dots">...</span>`;
        }
    }
    
    container.innerHTML = html;
}

window.goToPage = function(page) {
    currentPage = page;
    loadProducts();
};

// ============================================
// RANKING WEIGHTS MANAGEMENT
// ============================================
function updateWeightInputs() {
    document.getElementById('salesWeight').textContent = rankingWeights.sales + '%';
    document.getElementById('engagementWeight').textContent = rankingWeights.engagement + '%';
    document.getElementById('qualityWeight').textContent = rankingWeights.quality + '%';
    document.getElementById('reliabilityWeight').textContent = rankingWeights.reliability + '%';
    
    document.getElementById('salesWeightSlider').value = rankingWeights.sales;
    document.getElementById('engagementWeightSlider').value = rankingWeights.engagement;
    document.getElementById('qualityWeightSlider').value = rankingWeights.quality;
    document.getElementById('reliabilityWeightSlider').value = rankingWeights.reliability;
    
    document.getElementById('salesTotalWeight').value = rankingWeights.salesTotal;
    document.getElementById('sales30Weight').value = rankingWeights.sales30;
    document.getElementById('sales7Weight').value = rankingWeights.sales7;
    document.getElementById('viewsWeight').value = rankingWeights.views;
    document.getElementById('clicksWeight').value = rankingWeights.clicks;
    document.getElementById('inquiriesWeight').value = rankingWeights.inquiries;
    document.getElementById('ratingWeight').value = rankingWeights.rating;
    document.getElementById('conversionWeight').value = rankingWeights.conversion;
    document.getElementById('responseRateWeight').value = rankingWeights.responseRate;
    document.getElementById('completionRateWeight').value = rankingWeights.completionRate;
    document.getElementById('boost7Days').value = rankingWeights.boost7;
    document.getElementById('boost30Days').value = rankingWeights.boost30;
}

// Weight slider handlers
document.getElementById('salesWeightSlider')?.addEventListener('input', (e) => {
    rankingWeights.sales = parseInt(e.target.value);
    document.getElementById('salesWeight').textContent = rankingWeights.sales + '%';
});

document.getElementById('engagementWeightSlider')?.addEventListener('input', (e) => {
    rankingWeights.engagement = parseInt(e.target.value);
    document.getElementById('engagementWeight').textContent = rankingWeights.engagement + '%';
});

document.getElementById('qualityWeightSlider')?.addEventListener('input', (e) => {
    rankingWeights.quality = parseInt(e.target.value);
    document.getElementById('qualityWeight').textContent = rankingWeights.quality + '%';
});

document.getElementById('reliabilityWeightSlider')?.addEventListener('input', (e) => {
    rankingWeights.reliability = parseInt(e.target.value);
    document.getElementById('reliabilityWeight').textContent = rankingWeights.reliability + '%';
});

// Save weights
document.getElementById('saveWeightsBtn')?.addEventListener('click', async () => {
    try {
        // Collect all weight values
        rankingWeights = {
            sales: parseInt(document.getElementById('salesWeightSlider').value),
            engagement: parseInt(document.getElementById('engagementWeightSlider').value),
            quality: parseInt(document.getElementById('qualityWeightSlider').value),
            reliability: parseInt(document.getElementById('reliabilityWeightSlider').value),
            salesTotal: parseInt(document.getElementById('salesTotalWeight').value),
            sales30: parseInt(document.getElementById('sales30Weight').value),
            sales7: parseInt(document.getElementById('sales7Weight').value),
            views: parseInt(document.getElementById('viewsWeight').value),
            clicks: parseInt(document.getElementById('clicksWeight').value),
            inquiries: parseInt(document.getElementById('inquiriesWeight').value),
            rating: parseInt(document.getElementById('ratingWeight').value),
            conversion: parseInt(document.getElementById('conversionWeight').value),
            responseRate: parseInt(document.getElementById('responseRateWeight').value),
            completionRate: parseInt(document.getElementById('completionRateWeight').value),
            boost7: parseInt(document.getElementById('boost7Days').value),
            boost30: parseInt(document.getElementById('boost30Days').value)
        };
        
        // Save to database
        const { error } = await sb
            .from('admin_settings')
            .upsert({
                setting_key: 'ranking_weights',
                setting_value: rankingWeights,
                updated_at: new Date().toISOString(),
                updated_by: currentUser.id
            }, { onConflict: 'setting_key' });
            
        if (error) throw error;
        
        // Trigger recalculation
        await recalculateScores();
        
        showSuccess('Ranking weights saved successfully');
        
    } catch (error) {
        console.error('Error saving weights:', error);
        showToast('Failed to save weights');
    }
});

// Recalculate scores
document.getElementById('recalculateBtn')?.addEventListener('click', recalculateScores);

async function recalculateScores() {
    try {
        showToast('Recalculating scores...', 'info');
        
        const { error } = await sb.rpc('update_product_ranking_score');
        
        if (error) throw error;
        
        showSuccess('Scores recalculated successfully');
        await loadProducts();
        await loadStats();
        
    } catch (error) {
        console.error('Error recalculating scores:', error);
        showToast('Failed to recalculate scores');
    }
}

// ============================================
// SPONSORED PRODUCTS
// ============================================
async function loadSponsored() {
    try {
        const { data, error } = await sb
            .from('sponsored_products')
            .select(`
                *,
                ads!inner (
                    id,
                    title,
                    image_urls
                ),
                suppliers!inner (
                    business_name
                )
            `)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        sponsored = data || [];
        renderSponsored();
        
    } catch (error) {
        console.error('Error loading sponsored:', error);
    }
}

function renderSponsored() {
    const grid = document.getElementById('sponsoredGrid');
    
    grid.innerHTML = sponsored.map(s => {
        const spentPercent = (s.spent / s.budget) * 100;
        const daysLeft = Math.ceil((new Date(s.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        
        return `
            <div class="sponsored-card">
                <div class="sponsored-header-card">
                    <div class="sponsored-product">${escapeHtml(s.ads?.title || 'Product')}</div>
                    <span class="sponsored-badge ${s.status}">${s.status}</span>
                </div>
                <div class="sponsored-details">
                    <div class="detail-row">
                        <span class="detail-label">Supplier:</span>
                        <span class="detail-value">${escapeHtml(s.suppliers?.business_name || 'N/A')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Campaign:</span>
                        <span class="detail-value">${escapeHtml(s.campaign_name)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Budget:</span>
                        <span class="detail-value">UGX ${formatNumber(s.budget)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Spent:</span>
                        <span class="detail-value">UGX ${formatNumber(s.spent || 0)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${spentPercent}%"></div>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Impressions:</span>
                        <span class="detail-value">${s.impressions || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Clicks:</span>
                        <span class="detail-value">${s.clicks || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">CTR:</span>
                        <span class="detail-value">${s.impressions ? ((s.clicks / s.impressions) * 100).toFixed(2) : 0}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Days Left:</span>
                        <span class="detail-value">${daysLeft}</span>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="btn-icon" onclick="editSponsored(${s.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="pauseSponsored(${s.id})" title="Pause">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="btn-icon" onclick="endSponsored(${s.id})" title="End">
                        <i class="fas fa-stop"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// A/B TESTS
// ============================================
async function loadTests() {
    try {
        const { data, error } = await sb
            .from('ranking_tests')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        tests = data || [];
        renderTests();
        
    } catch (error) {
        console.error('Error loading tests:', error);
    }
}

function renderTests() {
    const grid = document.getElementById('testsGrid');
    
    grid.innerHTML = tests.map(test => {
        const improvement = ((test.results?.conversion_rate || 0) - (test.baseline?.conversion_rate || 0)) * 100;
        
        return `
            <div class="test-card">
                <div class="test-header">
                    <span class="test-name">${escapeHtml(test.test_name)}</span>
                    <span class="test-status ${test.status}">${test.status}</span>
                </div>
                <div class="test-metrics">
                    <div class="test-metric">
                        <span class="metric-value">${test.traffic_percentage}%</span>
                        <span class="metric-label">Traffic</span>
                    </div>
                    <div class="test-metric">
                        <span class="metric-value">${test.impressions || 0}</span>
                        <span class="metric-label">Impressions</span>
                    </div>
                    <div class="test-metric">
                        <span class="metric-value">${test.conversions || 0}</span>
                        <span class="metric-label">Conversions</span>
                    </div>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Improvement:</span>
                    <span class="detail-value ${improvement > 0 ? 'up' : 'down'}">
                        ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Started:</span>
                    <span class="detail-value">${formatDate(test.start_date)}</span>
                </div>
                <div class="action-buttons" style="margin-top: 12px;">
                    <button class="btn-icon" onclick="viewTestResults(${test.id})" title="View Results">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn-icon" onclick="pauseTest(${test.id})" title="Pause">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="btn-icon" onclick="endTest(${test.id})" title="End Test">
                        <i class="fas fa-stop"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// CHARTS
// ============================================
function setupCharts() {
    // Distribution Chart
    const ctx1 = document.getElementById('distributionChart').getContext('2d');
    rankingChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['0-20', '21-40', '41-60', '61-80', '81-100'],
            datasets: [{
                label: 'Number of Products',
                data: [45, 78, 123, 89, 34],
                backgroundColor: 'rgba(11, 79, 108, 0.8)',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // CTR Chart
    const ctx2 = document.getElementById('ctrChart').getContext('2d');
    ctrChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: ['1', '2', '3', '4', '5', '6-10', '11-20'],
            datasets: [{
                label: 'Click-through Rate',
                data: [12.5, 8.3, 6.1, 4.8, 3.9, 2.1, 0.8],
                borderColor: 'rgba(16, 185, 129, 1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    // Conversion Chart
    const ctx3 = document.getElementById('conversionChart').getContext('2d');
    conversionChart = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: ['Top 10', '11-50', '51-100', '100+'],
            datasets: [{
                label: 'Conversion Rate %',
                data: [5.2, 3.1, 1.8, 0.7],
                backgroundColor: 'rgba(245, 158, 11, 0.8)'
            }]
        }
    });
    
    // Revenue Chart
    const ctx4 = document.getElementById('revenueChart').getContext('2d');
    revenueChart = new Chart(ctx4, {
        type: 'doughnut',
        data: {
            labels: ['Electronics', 'Fashion', 'Home & Garden', 'Automotive', 'Others'],
            datasets: [{
                data: [45, 25, 15, 10, 5],
                backgroundColor: [
                    'rgba(11, 79, 108, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(139, 92, 246, 0.8)'
                ]
            }]
        }
    });
    
    // Search Chart
    const ctx5 = document.getElementById('searchChart').getContext('2d');
    searchChart = new Chart(ctx5, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Searches',
                data: [1250, 1400, 1350, 1600, 1800, 950, 1100],
                borderColor: 'rgba(11, 79, 108, 1)',
                yAxisID: 'y'
            }, {
                label: 'Conversions',
                data: [45, 52, 48, 63, 71, 38, 42],
                borderColor: 'rgba(16, 185, 129, 1)',
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left' },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

function renderCategoryGrid() {
    const grid = document.getElementById('categoryGrid');
    
    const categoryStats = categories.slice(0, 6).map(cat => ({
        name: cat.name,
        products: Math.floor(Math.random() * 500) + 100,
        revenue: Math.floor(Math.random() * 10000000) + 1000000
    }));
    
    grid.innerHTML = categoryStats.map(cat => `
        <div class="category-card">
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-metrics">
                <span>${cat.products} products</span>
                <span>UGX ${formatNumber(cat.revenue)}</span>
            </div>
        </div>
    `).join('');
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.adjustRanking = function(productId, productTitle, currentScore) {
    document.getElementById('adjustProductName').textContent = productTitle;
    document.getElementById('currentScore').value = currentScore;
    document.getElementById('manualBoost').value = 0;
    document.getElementById('adjustReason').value = '';
    document.getElementById('adjustScoreModal').dataset.productId = productId;
    document.getElementById('adjustScoreModal').classList.add('show');
};

window.saveAdjustment = async function() {
    const productId = document.getElementById('adjustScoreModal').dataset.productId;
    const boost = parseInt(document.getElementById('manualBoost').value);
    const reason = document.getElementById('adjustReason').value;
    
    try {
        // Update product with manual boost
        const { error } = await sb
            .from('ads')
            .update({
                manual_boost: boost,
                boost_reason: reason,
                boost_updated_at: new Date().toISOString(),
                boost_updated_by: currentUser.id
            })
            .eq('id', productId);
            
        if (error) throw error;
        
        // Recalculate scores
        await recalculateScores();
        
        showSuccess('Ranking adjusted successfully');
        closeAdjustScoreModal();
        
    } catch (error) {
        console.error('Error adjusting ranking:', error);
        showToast('Failed to adjust ranking');
    }
};

window.showAddSponsored = function() {
    document.getElementById('sponsoredModal').classList.add('show');
};

window.saveSponsored = async function() {
    // Implementation for saving sponsored product
    showSuccess('Sponsored product added');
    closeSponsoredModal();
};

window.showCreateTest = function() {
    document.getElementById('testModal').classList.add('show');
};

window.saveTest = async function() {
    // Implementation for saving test
    showSuccess('Test created successfully');
    closeTestModal();
};

// Modal close functions
window.closeSponsoredModal = () => document.getElementById('sponsoredModal').classList.remove('show');
window.closeTestModal = () => document.getElementById('testModal').classList.remove('show');
window.closeAdjustScoreModal = () => document.getElementById('adjustScoreModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatNumber(num) {
    return num?.toLocaleString('en-UG') || '0';
}

function formatDate(dateString) {
    return moment(dateString).format('MMM D, YYYY');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('show');
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    
    // Filter events
    document.getElementById('searchProducts')?.addEventListener('input', debounce(() => {
        currentPage = 1;
        loadProducts();
    }, 500));
    
    document.getElementById('categoryFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadProducts();
    });
    
    document.getElementById('supplierFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadProducts();
    });
    
    document.getElementById('sortBy')?.addEventListener('change', () => {
        currentPage = 1;
        loadProducts();
    });
    
    // Analytics period change
    document.getElementById('analyticsPeriod')?.addEventListener('change', updateCharts);
    
    // Add sponsored button
    document.getElementById('addSponsoredBtn')?.addEventListener('click', showAddSponsored);
    
    // Create test button
    document.getElementById('createTestBtn')?.addEventListener('click', showCreateTest);
    
    // Product search in modal
    document.getElementById('productSearch')?.addEventListener('input', debounce(searchProducts, 500));
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSponsoredModal();
                closeTestModal();
                closeAdjustScoreModal();
                closeSuccessModal();
            }
        });
    });
}

async function searchProducts(e) {
    const query = e.target.value;
    if (query.length < 2) return;
    
    try {
        const { data, error } = await sb
            .from('ads')
            .select('id, title, sku, image_urls')
            .ilike('title', `%${query}%`)
            .limit(10);
            
        if (error) throw error;
        
        const results = document.getElementById('productResults');
        results.innerHTML = data.map(p => `
            <div class="product-result-item" onclick="selectProduct(${p.id})">
                <div class="product-result-image">
                    ${p.image_urls?.[0] ? 
                        `<img src="${p.image_urls[0]}" alt="${p.title}">` : 
                        '<i class="fas fa-box"></i>'
                    }
                </div>
                <div class="product-result-info">
                    <div class="product-result-title">${escapeHtml(p.title)}</div>
                    <div class="product-result-sku">SKU: ${p.sku || 'N/A'}</div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error searching products:', error);
    }
}

function selectProduct(productId) {
    // Implementation for selecting product
    document.getElementById('productSearch').value = 'Product selected';
    document.getElementById('productResults').innerHTML = '';
}

function updateCharts() {
    // Update chart data based on selected period
    showToast('Updating charts...', 'info');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make functions globally available
window.adjustRanking = adjustRanking;
window.saveAdjustment = saveAdjustment;
window.showAddSponsored = showAddSponsored;
window.saveSponsored = saveSponsored;
window.showCreateTest = showCreateTest;
window.saveTest = saveTest;
window.closeSponsoredModal = closeSponsoredModal;
window.closeTestModal = closeTestModal;
window.closeAdjustScoreModal = closeAdjustScoreModal;
window.closeSuccessModal = closeSuccessModal;
window.goToPage = goToPage;
window.selectProduct = selectProduct;