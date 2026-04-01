// ============================================
// BROWSE RFQS - SOURCEX
// ============================================

console.log('🚀 Browse RFQs loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const BrowseRFQs = {
    currentUser: null,
    supplier: null,
    categories: [],
    rfqs: [],
    filteredRFQs: [],
    selectedCategory: null,
    currentFilter: 'all',
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentRFQ: null,
    quoteItems: [],

    async init() {
        console.log('📊 Browse RFQs initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadCategories();
            await this.loadRFQs();
            this.setupEventListeners();
            
            console.log('✅ Browse RFQs initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading RFQs', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
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
            console.log('✅ Supplier loaded:', this.supplier.business_name);
        } catch (error) {
            console.error('Error loading supplier:', error);
        }
    },

    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name, display_name')
                .eq('is_active', true)
                .order('display_order');
            
            if (error) throw error;
            this.categories = data || [];
            this.renderCategories();
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },

    async loadRFQs() {
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            let query = sb
                .from('rfq_requests')
                .select(`
                    *,
                    rfq_items (*)
                `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            this.rfqs = data || [];
            this.filterRFQs();
            this.renderRFQs();
            this.updateStats();
            
            document.getElementById('loadingState').style.display = 'none';
            
        } catch (error) {
            console.error('Error loading RFQs:', error);
            this.showToast('Error loading RFQs', 'error');
        } finally {
            this.isLoading = false;
        }
    },

    filterRFQs() {
        let filtered = [...this.rfqs];
        
        // Filter by status
        if (this.currentFilter === 'new') {
            filtered = filtered.filter(rfq => !rfq.viewed);
        } else if (this.currentFilter === 'matching') {
            filtered = filtered.filter(rfq => this.calculateMatchScore(rfq) >= 50);
        } else if (this.currentFilter === 'my_category' && this.supplier?.category_ids) {
            const supplierCats = this.supplier.category_ids;
            filtered = filtered.filter(rfq => 
                rfq.rfq_items.some(item => 
                    supplierCats.includes(item.category_id)
                )
            );
        }
        
        // Filter by category
        if (this.selectedCategory) {
            filtered = filtered.filter(rfq =>
                rfq.rfq_items.some(item => 
                    item.category_id === this.selectedCategory
                )
            );
        }
        
        // Filter by search
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(rfq =>
                rfq.title?.toLowerCase().includes(searchTerm) ||
                rfq.buyer_name?.toLowerCase().includes(searchTerm) ||
                rfq.rfq_items.some(item => item.product_name?.toLowerCase().includes(searchTerm))
            );
        }
        
        this.filteredRFQs = filtered;
        this.renderRFQs();
    },

    renderCategories() {
        const container = document.getElementById('categoriesList');
        if (!container) return;
        
        container.innerHTML = this.categories.map(cat => `
            <button class="category-chip" data-category-id="${cat.id}" onclick="BrowseRFQs.selectCategory(${cat.id})">
                ${cat.display_name || cat.name}
                <span class="count">(${this.getCategoryCount(cat.id)})</span>
            </button>
        `).join('');
    },

    getCategoryCount(categoryId) {
        return this.rfqs.filter(rfq =>
            rfq.rfq_items.some(item => item.category_id === categoryId)
        ).length;
    },

    selectCategory(categoryId) {
        this.selectedCategory = this.selectedCategory === categoryId ? null : categoryId;
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.categoryId == categoryId && this.selectedCategory === categoryId);
        });
        this.filterRFQs();
    },

    calculateMatchScore(rfq) {
        if (!this.supplier?.category_ids) return 0;
        
        const supplierCats = this.supplier.category_ids;
        let matchCount = 0;
        
        rfq.rfq_items.forEach(item => {
            if (supplierCats.includes(item.category_id)) matchCount++;
        });
        
        const totalItems = rfq.rfq_items.length;
        const score = totalItems > 0 ? (matchCount / totalItems) * 100 : 0;
        return Math.round(score);
    },

    getMatchScoreClass(score) {
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    },

    renderRFQs() {
        const container = document.getElementById('rfqsList');
        const emptyEl = document.getElementById('emptyState');
        
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
            const scoreClass = this.getMatchScoreClass(matchScore);
            
            return `
                <div class="rfq-card" data-rfq-id="${rfq.id}" onclick="BrowseRFQs.viewRFQ(${rfq.id})">
                    <div class="rfq-badge">RFQ</div>
                    ${matchScore > 0 ? `<span class="match-score ${scoreClass}">${matchScore}% Match</span>` : ''}
                    
                    <div class="rfq-header">
                        <div class="rfq-title">
                            <h3>${this.escapeHtml(rfq.title)}</h3>
                            <span class="rfq-number">${rfq.rfq_number || 'RFQ'}</span>
                        </div>
                    </div>
                    
                    <div class="rfq-meta">
                        <span class="meta-item"><i class="far fa-user"></i> ${this.escapeHtml(rfq.buyer_name)}</span>
                        <span class="meta-item"><i class="far fa-calendar"></i> ${createdDate}</span>
                        <span class="meta-item"><i class="fas fa-box"></i> ${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                    </div>
                    
                    <div class="rfq-products">
                        ${items.slice(0, 2).map(item => `
                            <div class="product-preview">
                                <span class="product-name">${this.escapeHtml(item.product_name)}</span>
                                <span class="product-qty">${item.quantity} ${item.unit || 'pcs'}</span>
                            </div>
                        `).join('')}
                        ${items.length > 2 ? `<div class="more-products">+${items.length - 2} more products</div>` : ''}
                    </div>
                    
                    <div class="rfq-footer">
                        <div class="buyer-contact">
                            <i class="fas fa-envelope"></i> ${rfq.buyer_email}
                        </div>
                        <button class="quote-now-btn" onclick="event.stopPropagation(); BrowseRFQs.createQuoteFromRFQ(${rfq.id})">
                            <i class="fas fa-file-invoice"></i> Quote Now
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    updateStats() {
        const newRFQs = this.rfqs.filter(r => !r.viewed).length;
        const matchingRFQs = this.rfqs.filter(r => this.calculateMatchScore(r) >= 50).length;
        const myCategoryRFQs = this.supplier?.category_ids ? 
            this.rfqs.filter(r => r.rfq_items.some(item => this.supplier.category_ids.includes(item.category_id))).length : 0;
        
        document.getElementById('totalRFQs').textContent = this.rfqs.length;
        document.getElementById('newRFQs').textContent = newRFQs;
        document.getElementById('matchingRFQs').textContent = matchingRFQs;
        document.getElementById('myCategoryRFQs').textContent = myCategoryRFQs;
    },

    async viewRFQ(rfqId) {
        const rfq = this.rfqs.find(r => r.id === rfqId);
        if (!rfq) return;
        
        this.currentRFQ = rfq;
        
        const items = rfq.rfq_items || [];
        const createdDate = new Date(rfq.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const modalBody = document.getElementById('rfqModalBody');
        const modalFooter = document.getElementById('rfqModalFooter');
        
        modalBody.innerHTML = `
            <div class="detail-section">
                <h4>RFQ Information</h4>
                <div class="detail-row"><span class="detail-label">Number:</span><span class="detail-value">${rfq.rfq_number || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Title:</span><span class="detail-value">${this.escapeHtml(rfq.title)}</span></div>
                <div class="detail-row"><span class="detail-label">Created:</span><span class="detail-value">${createdDate}</span></div>
                <div class="detail-row"><span class="detail-label">Expires:</span><span class="detail-value">${rfq.expires_at ? new Date(rfq.expires_at).toLocaleDateString() : 'Not set'}</span></div>
            </div>
            
            <div class="detail-section">
                <h4>Buyer Information</h4>
                <div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${this.escapeHtml(rfq.buyer_name)}</span></div>
                <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${this.escapeHtml(rfq.buyer_email)}</span></div>
                ${rfq.buyer_phone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${rfq.buyer_phone}</span></div>` : ''}
                ${rfq.buyer_company ? `<div class="detail-row"><span class="detail-label">Company:</span><span class="detail-value">${this.escapeHtml(rfq.buyer_company)}</span></div>` : ''}
                <div class="detail-row"><span class="detail-label">Contact Method:</span><span class="detail-value">${rfq.preferred_contact} ${this.getContactIcon(rfq.preferred_contact)}</span></div>
            </div>
            
            <div class="detail-section">
                <h4>Products Required</h4>
                <div class="products-list">
                    ${items.map(item => `
                        <div class="product-item">
                            <div class="product-header">
                                <strong>${this.escapeHtml(item.product_name)}</strong>
                                <span class="product-quantity">${item.quantity} ${item.unit || 'pcs'}</span>
                            </div>
                            ${item.specifications ? `<div class="product-specs">${this.escapeHtml(JSON.stringify(item.specifications))}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${rfq.description ? `<div class="detail-section"><h4>Additional Requirements</h4><p class="description-text">${this.escapeHtml(rfq.description)}</p></div>` : ''}
            
            ${rfq.shipping_address ? `
            <div class="detail-section">
                <h4>Delivery Information</h4>
                <div class="detail-row"><span class="detail-label">Address:</span><span class="detail-value">${this.escapeHtml(rfq.shipping_address)}</span></div>
                ${rfq.shipping_district ? `<div class="detail-row"><span class="detail-label">District:</span><span class="detail-value">${this.escapeHtml(rfq.shipping_district)}</span></div>` : ''}
                ${rfq.expected_delivery_date ? `<div class="detail-row"><span class="detail-label">Expected By:</span><span class="detail-value">${new Date(rfq.expected_delivery_date).toLocaleDateString()}</span></div>` : ''}
            </div>
            ` : ''}
        `;
        
        modalFooter.innerHTML = `
            <button class="btn-primary" onclick="BrowseRFQs.createQuoteFromRFQ(${rfq.id})">
                <i class="fas fa-file-invoice"></i> Create Quote
            </button>
            <button class="btn-secondary" onclick="closeRFQModal()">Close</button>
        `;
        
        document.getElementById('rfqModal').classList.add('show');
    },

    createQuoteFromRFQ(rfqId) {
        const rfq = this.rfqs.find(r => r.id === rfqId);
        if (!rfq) return;
        
        this.currentRFQ = rfq;
        this.quoteItems = (rfq.rfq_items || []).map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit || 'pcs',
            unit_price: 0,
            notes: ''
        }));
        
        document.getElementById('rfqId').value = rfqId;
        
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 7);
        document.getElementById('validUntil').value = validUntil.toISOString().split('T')[0];
        
        document.getElementById('paymentTerms').value = 'advance_full';
        document.getElementById('deliveryTerms').value = 'ex_warehouse';
        document.getElementById('leadTime').value = '7';
        document.getElementById('quoteNotes').value = '';
        
        this.renderBuyerInfo(rfq);
        this.renderQuoteItems();
        document.getElementById('createQuoteModal').classList.add('show');
        closeRFQModal();
    },

    renderBuyerInfo(rfq) {
        const info = document.getElementById('buyerInfo');
        const contactPref = document.getElementById('contactPreference');
        
        info.innerHTML = `
            <div class="buyer-detail-row"><span class="buyer-detail-label">Name:</span><span class="buyer-detail-value">${this.escapeHtml(rfq.buyer_name)}</span></div>
            <div class="buyer-detail-row"><span class="buyer-detail-label">Email:</span><span class="buyer-detail-value">${this.escapeHtml(rfq.buyer_email)}</span></div>
            ${rfq.buyer_phone ? `<div class="buyer-detail-row"><span class="buyer-detail-label">Phone:</span><span class="buyer-detail-value">${rfq.buyer_phone}</span></div>` : ''}
        `;
        
        contactPref.innerHTML = `<i class="fas fa-bell"></i> Buyer prefers: <strong>${rfq.preferred_contact}</strong> ${this.getContactIcon(rfq.preferred_contact)}`;
    },

    renderQuoteItems() {
        const container = document.getElementById('quoteItemsContainer');
        
        container.innerHTML = this.quoteItems.map((item, index) => `
            <div class="quote-item">
                <div class="quote-item-header">
                    <span>Item ${index + 1}</span>
                    <button type="button" class="remove-item-btn" onclick="BrowseRFQs.removeQuoteItem(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="quote-item-fields">
                    <input type="text" placeholder="Product name" value="${this.escapeHtml(item.product_name)}" onchange="BrowseRFQs.updateQuoteItem(${index}, 'product_name', this.value)">
                    <input type="number" placeholder="Qty" value="${item.quantity}" min="1" onchange="BrowseRFQs.updateQuoteItem(${index}, 'quantity', this.value)">
                    <select onchange="BrowseRFQs.updateQuoteItem(${index}, 'unit', this.value)">
                        <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>Pcs</option>
                        <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>Kg</option>
                        <option value="ton" ${item.unit === 'ton' ? 'selected' : ''}>Ton</option>
                        <option value="meter" ${item.unit === 'meter' ? 'selected' : ''}>Meter</option>
                        <option value="liter" ${item.unit === 'liter' ? 'selected' : ''}>Liter</option>
                        <option value="carton" ${item.unit === 'carton' ? 'selected' : ''}>Carton</option>
                    </select>
                    <input type="number" placeholder="Unit price" value="${item.unit_price}" min="0" step="100" onchange="BrowseRFQs.updateQuoteItem(${index}, 'unit_price', this.value)">
                </div>
                <input type="text" placeholder="Notes (optional)" value="${this.escapeHtml(item.notes)}" style="width:100%; margin-top:8px; padding:8px; border:1px solid var(--gray-300); border-radius:var(--radius-sm);" onchange="BrowseRFQs.updateQuoteItem(${index}, 'notes', this.value)">
            </div>
        `).join('');
        
        this.updateQuoteSummary();
    },

    updateQuoteItem(index, field, value) {
        this.quoteItems[index][field] = field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value;
        this.updateQuoteSummary();
        this.renderQuoteItems();
    },

    removeQuoteItem(index) {
        this.quoteItems.splice(index, 1);
        this.renderQuoteItems();
    },

    addQuoteItem() {
        this.quoteItems.push({
            product_name: '',
            quantity: 1,
            unit: 'pcs',
            unit_price: 0,
            notes: ''
        });
        this.renderQuoteItems();
    },

    updateQuoteSummary() {
        const subtotal = this.quoteItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        document.getElementById('summarySubtotal').textContent = `UGX ${this.formatNumber(subtotal)}`;
        document.getElementById('summaryTotal').textContent = `UGX ${this.formatNumber(subtotal)}`;
    },

    async saveQuoteAsDraft() {
        await this.saveQuote('draft');
    },

    async sendQuote() {
        if (!this.validateQuote()) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        await this.saveQuote('sent');
    },

    validateQuote() {
        if (this.quoteItems.length === 0) return false;
        for (const item of this.quoteItems) {
            if (!item.product_name || item.quantity < 1 || item.unit_price <= 0) return false;
        }
        if (!document.getElementById('validUntil').value) return false;
        return true;
    },

    async saveQuote(status) {
        try {
            const rfqId = document.getElementById('rfqId').value;
            const validUntil = document.getElementById('validUntil').value;
            const paymentTerms = document.getElementById('paymentTerms').value;
            const deliveryTerms = document.getElementById('deliveryTerms').value;
            const leadTime = document.getElementById('leadTime').value;
            const notes = document.getElementById('quoteNotes').value;
            
            const items = this.quoteItems.map(item => ({
                product_name: item.product_name,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                notes: item.notes
            }));
            
            const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
            const quoteNumber = status === 'draft' ? null : ('QTE-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
            
            const quoteData = {
                supplier_id: this.supplier.id,
                rfq_id: rfqId,
                items: items,
                valid_until: new Date(validUntil).toISOString(),
                status: status,
                total_amount: total,
                currency: 'UGX',
                payment_terms: [paymentTerms],
                delivery_terms: [deliveryTerms],
                lead_time_days: leadTime ? parseInt(leadTime) : null,
                notes: notes || null,
                created_at: new Date().toISOString()
            };
            
            if (quoteNumber) quoteData.quote_number = quoteNumber;
            
            const { data: quote, error } = await sb
                .from('supplier_quotes')
                .insert(quoteData)
                .select()
                .single();
            
            if (error) throw error;
            
            if (status === 'sent') {
                await sb
                    .from('rfq_matches')
                    .insert({
                        rfq_id: rfqId,
                        supplier_id: this.supplier.id,
                        match_score: this.calculateMatchScore(this.currentRFQ),
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    });
                
                await sb
                    .from('rfq_requests')
                    .update({ status: 'sent' })
                    .eq('id', rfqId);
                
                await sb.from('notifications').insert({
                    user_id: this.currentRFQ.buyer_id,
                    type: 'quote_received',
                    title: 'New Quotation Received',
                    message: `You've received a quotation from ${this.supplier.business_name}`,
                    link: `/buyer-quote.html?id=${quote.id}`
                });
            }
            
            this.closeCreateQuoteModal();
            this.showToast(status === 'draft' ? 'Quote saved as draft' : 'Quote sent successfully!', 'success');
            
            if (status === 'sent') {
                document.getElementById('successModal').classList.add('show');
            }
            
        } catch (error) {
            console.error('Error saving quote:', error);
            this.showToast('Error saving quote: ' + error.message, 'error');
        }
    },

    getContactIcon(preference) {
        const icons = {
            'whatsapp': '<i class="fab fa-whatsapp" style="color: #25D366;"></i>',
            'email': '<i class="fas fa-envelope"></i>',
            'both': '<i class="fab fa-whatsapp" style="color: #25D366;"></i> <i class="fas fa-envelope"></i>',
            'platform': '<i class="fas fa-comment-dots"></i>',
            'phone': '<i class="fas fa-phone"></i>'
        };
        return icons[preference] || '<i class="fas fa-globe"></i>';
    },

    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    setupEventListeners() {
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.filterRFQs(), 500);
        });
        
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                    this.closeRFQModal();
                    this.closeCreateQuoteModal();
                    this.closeSuccessModal();
                }
            });
        });
    },

    closeRFQModal() { document.getElementById('rfqModal').classList.remove('show'); },
    closeCreateQuoteModal() { document.getElementById('createQuoteModal').classList.remove('show'); this.quoteItems = []; },
    closeSuccessModal() { document.getElementById('successModal').classList.remove('show'); }
};

// Filter functions
window.filterRFQs = (filter) => {
    BrowseRFQs.currentFilter = filter;
    document.querySelectorAll('.stat-chip').forEach(chip => {
        chip.classList.toggle('active', chip.textContent.includes(filter.toUpperCase()));
    });
    BrowseRFQs.filterRFQs();
};

window.loadMoreRFQs = () => {
    BrowseRFQs.currentPage++;
    BrowseRFQs.loadRFQs();
};

window.closeRFQModal = () => BrowseRFQs.closeRFQModal();
window.closeCreateQuoteModal = () => BrowseRFQs.closeCreateQuoteModal();
window.closeSuccessModal = () => BrowseRFQs.closeSuccessModal();
window.addQuoteItem = () => BrowseRFQs.addQuoteItem();
window.saveQuoteAsDraft = () => BrowseRFQs.saveQuoteAsDraft();
window.sendQuote = () => BrowseRFQs.sendQuote();
window.removeQuoteItem = (index) => BrowseRFQs.removeQuoteItem(index);
window.updateQuoteItem = (index, field, value) => BrowseRFQs.updateQuoteItem(index, field, value);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    BrowseRFQs.init();
});

window.BrowseRFQs = BrowseRFQs;