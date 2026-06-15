// ============================================
// BROWSE RFQS - SUPPLIER VIEW
// BuyUganda.online
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const BrowseRFQs = {
    currentUser: null,
    supplier: null,
    allRFQs: [],
    filteredRFQs: [],
    currentFilter: 'all',
    searchTerm: '',
    currentRFQ: null,

    async init() {
        console.log('🚀 Browse RFQs initializing...');
        this.showLoading(true);
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadRFQs();
            this.setupEventListeners();
            this.showLoading(false);
            console.log('✅ Browse RFQs ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showLoading(false);
            this.showToast('Error loading RFQs', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            
            if (!user) {
                window.location.href = 'login.html?redirect=browse-rfqs.html';
                return;
            }
            
            this.currentUser = user;
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },

    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id, business_name, category_ids')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier?.business_name);
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.supplier = null;
        }
    },

    async loadRFQs() {
        try {
            // Get all pending RFQs
            const { data, error } = await sb
                .from('rfq_requests')
                .select(`
                    id,
                    rfq_number,
                    title,
                    description,
                    buyer_name,
                    buyer_email,
                    buyer_phone,
                    preferred_contact,
                    shipping_address,
                    shipping_district,
                    expected_delivery_date,
                    budget_min,
                    budget_max,
                    created_at,
                    rfq_items (
                        id,
                        product_name,
                        quantity,
                        unit,
                        specifications
                    )
                `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            this.allRFQs = data || [];
            this.filterRFQs();
            
        } catch (error) {
            console.error('Error loading RFQs:', error);
            this.allRFQs = [];
            this.renderEmpty();
        }
    },

    calculateMatchScore(rfq) {
        if (!this.supplier?.category_ids) return 0;
        
        const supplierCats = this.supplier.category_ids;
        let matchCount = 0;
        
        // Check if any product matches supplier's categories
        // Since rfq_items don't have category_id directly, we give a base score
        // For now, return 50 if there's any product
        if (rfq.rfq_items && rfq.rfq_items.length > 0) {
            return 50; // Default match score
        }
        
        return 0;
    },

    getMatchClass(score) {
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    },

    filterRFQs() {
        let filtered = [...this.allRFQs];
        
        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(rfq => 
                rfq.title?.toLowerCase().includes(term) ||
                rfq.buyer_name?.toLowerCase().includes(term) ||
                rfq.rfq_items?.some(item => item.product_name?.toLowerCase().includes(term))
            );
        }
        
        // Apply category filter
        if (this.currentFilter === 'new') {
            // Show RFQs from last 7 days
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = filtered.filter(rfq => new Date(rfq.created_at) > weekAgo);
        } else if (this.currentFilter === 'high_match') {
            filtered = filtered.filter(rfq => this.calculateMatchScore(rfq) >= 50);
        }
        
        this.filteredRFQs = filtered;
        this.renderRFQs();
        this.updateStats();
    },

    updateStats() {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const newCount = this.allRFQs.filter(r => new Date(r.created_at) > weekAgo).length;
        const highMatchCount = this.allRFQs.filter(r => this.calculateMatchScore(r) >= 50).length;
        
        document.getElementById('totalCount').textContent = this.allRFQs.length;
        document.getElementById('newCount').textContent = newCount;
        document.getElementById('matchingCount').textContent = highMatchCount;
    },

    renderRFQs() {
        const container = document.getElementById('rfqList');
        const loadingEl = document.getElementById('loadingState');
        const emptyEl = document.getElementById('emptyState');
        
        loadingEl.style.display = 'none';
        
        if (this.filteredRFQs.length === 0) {
            container.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        
        emptyEl.style.display = 'none';
        
        container.innerHTML = this.filteredRFQs.map(rfq => {
            const items = rfq.rfq_items || [];
            const itemCount = items.length;
            const createdDate = new Date(rfq.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
            const matchScore = this.calculateMatchScore(rfq);
            const matchClass = this.getMatchClass(matchScore);
            
            // Show first 2 products
            const previewItems = items.slice(0, 2);
            const hasMore = items.length > 2;
            
            return `
                <div class="rfq-card" onclick="BrowseRFQs.viewRFQ(${rfq.id})">
                    <div class="rfq-header">
                        <div class="rfq-title">${this.escapeHtml(rfq.title || 'RFQ Request')}</div>
                        ${matchScore > 0 ? `<div class="match-badge ${matchClass}">${matchScore}% Match</div>` : ''}
                    </div>
                    
                    <div class="buyer-info">
                        <i class="fas fa-user"></i>
                        <span>${this.escapeHtml(rfq.buyer_name)}</span>
                        <i class="fas fa-envelope" style="margin-left: auto;"></i>
                        <span style="font-size: 11px;">${rfq.preferred_contact || 'email'}</span>
                    </div>
                    
                    <div class="products-preview">
                        ${previewItems.map(item => `
                            <div class="preview-item">
                                <span class="product-name">${this.escapeHtml(item.product_name)}</span>
                                <span class="product-qty">${item.quantity} ${item.unit || 'pcs'}</span>
                            </div>
                        `).join('')}
                        ${hasMore ? `<div class="more-items">+${items.length - 2} more items</div>` : ''}
                    </div>
                    
                    <div class="rfq-footer">
                        <span class="date"><i class="far fa-calendar-alt"></i> ${createdDate}</span>
                        <button class="quote-btn" onclick="event.stopPropagation(); BrowseRFQs.quoteNow(${rfq.id})">
                            Quote Now
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderEmpty() {
        const container = document.getElementById('rfqList');
        const loadingEl = document.getElementById('loadingState');
        const emptyEl = document.getElementById('emptyState');
        
        loadingEl.style.display = 'none';
        container.innerHTML = '';
        emptyEl.style.display = 'block';
    },

    async viewRFQ(rfqId) {
        const rfq = this.allRFQs.find(r => r.id === rfqId);
        if (!rfq) return;
        
        this.currentRFQ = rfq;
        const items = rfq.rfq_items || [];
        const createdDate = new Date(rfq.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const modalBody = document.getElementById('modalBody');
        
        modalBody.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">RFQ Number:</span>
                <span class="detail-value">${rfq.rfq_number || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${this.escapeHtml(rfq.title)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Buyer:</span>
                <span class="detail-value">${this.escapeHtml(rfq.buyer_name)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Contact:</span>
                <span class="detail-value">${rfq.buyer_email || rfq.buyer_phone || 'Not provided'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Contact Via:</span>
                <span class="detail-value">${rfq.preferred_contact || 'Email'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Posted:</span>
                <span class="detail-value">${createdDate}</span>
            </div>
            
            ${rfq.description ? `
                <div class="detail-row">
                    <span class="detail-label">Description:</span>
                    <span class="detail-value">${this.escapeHtml(rfq.description)}</span>
                </div>
            ` : ''}
            
            <div style="margin-top: 16px;">
                <strong>Products Required:</strong>
                <div class="items-list">
                    ${items.map(item => `
                        <div class="item-row">
                            <span><strong>${this.escapeHtml(item.product_name)}</strong></span>
                            <span>${item.quantity} ${item.unit || 'pcs'}</span>
                        </div>
                        ${item.specifications ? `<div style="font-size: 12px; color: #666; margin-top: -8px; margin-bottom: 8px;">${this.escapeHtml(item.specifications)}</div>` : ''}
                    `).join('')}
                </div>
            </div>
            
            ${rfq.shipping_address ? `
                <div class="detail-row" style="margin-top: 16px;">
                    <span class="detail-label">Shipping:</span>
                    <span class="detail-value">${this.escapeHtml(rfq.shipping_address)}</span>
                </div>
            ` : ''}
            
            ${rfq.expected_delivery_date ? `
                <div class="detail-row">
                    <span class="detail-label">Expected by:</span>
                    <span class="detail-value">${new Date(rfq.expected_delivery_date).toLocaleDateString()}</span>
                </div>
            ` : ''}
        `;
        
        document.getElementById('rfqModal').classList.add('show');
        
        // Setup quote button
        const quoteBtn = document.getElementById('quoteNowBtn');
        quoteBtn.onclick = () => this.quoteNow(rfq.id);
    },

    quoteNow(rfqId) {
        // Redirect to create quote page or open modal
        window.location.href = `create-quote.html?rfq_id=${rfqId}`;
    },

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterRFQs();
            });
        }
        
        // Filter chips
        const chips = document.querySelectorAll('.filter-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                chips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentFilter = chip.dataset.filter;
                this.filterRFQs();
            });
        });
    },

    closeModal() {
        document.getElementById('rfqModal').classList.remove('show');
    },

    showLoading(show) {
        const loadingEl = document.getElementById('loadingState');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = { success: '#4caf50', error: '#ff4444', info: '#0B4F6C' };
        toast.textContent = message;
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Global functions
window.BrowseRFQs = BrowseRFQs;
window.closeModal = () => BrowseRFQs.closeModal();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    BrowseRFQs.init();
});
