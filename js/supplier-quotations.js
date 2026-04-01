// ============================================
// SUPPLIER QUOTATIONS MANAGEMENT - SOURCEX
// ============================================

console.log('🚀 Supplier Quotations loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierQuotations = {
    currentUser: null,
    supplier: null,
    
    // Data
    rfqs: [],
    quotations: [],
    combinedItems: [],
    
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentTab: 'all',
    currentRFQ: null,
    currentQuote: null,
    quoteItems: [],
    
    filters: {
        types: [],
        status: [],
        dateRange: 'all',
        search: ''
    },

    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Quotations initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadRFQs();
            await this.loadQuotations();
            this.setupEventListeners();
            
            console.log('✅ Supplier Quotations initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading quotations', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-quotations.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },

    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('*')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier.business_name);
            
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
        }
    },

    async loadRFQs(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
        }
        
        try {
            const { data: matches, error: matchError } = await sb
                .from('rfq_matches')
                .select(`
                    rfq_id,
                    status,
                    match_score,
                    viewed_at,
                    rfq_requests!inner (
                        id,
                        rfq_number,
                        title,
                        description,
                        buyer_name,
                        buyer_email,
                        buyer_phone,
                        buyer_company,
                        preferred_contact,
                        contact_details,
                        expected_delivery_date,
                        shipping_address,
                        shipping_district,
                        status as rfq_status,
                        expires_at,
                        created_at,
                        rfq_items (*)
                    )
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
                
            if (matchError) throw matchError;
            
            this.rfqs = (matches || []).map(m => ({
                ...m.rfq_requests,
                match_status: m.status,
                match_score: m.match_score,
                viewed_at: m.viewed_at
            }));
            
            console.log(`✅ Loaded ${this.rfqs.length} RFQs`);
            
        } catch (error) {
            console.error('Error loading RFQs:', error);
            this.rfqs = [];
        }
    },

    async loadQuotations(reset = true) {
        if (!this.supplier) return;
        
        try {
            const { data, error } = await sb
                .from('supplier_quotes')
                .select(`
                    *,
                    rfq_requests!inner (
                        id,
                        rfq_number,
                        title,
                        buyer_name,
                        buyer_email,
                        buyer_phone,
                        buyer_company,
                        preferred_contact
                    )
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            this.quotations = data || [];
            console.log(`✅ Loaded ${this.quotations.length} quotations`);
            
            this.combineAndRender();
            
        } catch (error) {
            console.error('Error loading quotations:', error);
            this.quotations = [];
        }
    },

    combineAndRender() {
        this.combinedItems = [];
        
        this.rfqs.forEach(rfq => {
            const hasQuote = this.quotations.some(q => q.rfq_id === rfq.id);
            if (!hasQuote || rfq.match_status === 'pending') {
                this.combinedItems.push({
                    type: 'rfq',
                    data: rfq,
                    status: rfq.match_status === 'pending' ? 'pending' : 'new',
                    date: rfq.created_at
                });
            }
        });
        
        this.quotations.forEach(quote => {
            this.combinedItems.push({
                type: 'quote',
                data: quote,
                status: quote.status,
                date: quote.created_at
            });
        });
        
        this.combinedItems.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        this.updateStats();
        this.renderQuotations();
    },

    updateStats() {
        const pendingRFQs = this.rfqs.filter(r => r.match_status === 'pending').length;
        const drafts = this.quotations.filter(q => q.status === 'draft').length;
        const sent = this.quotations.filter(q => q.status === 'sent').length;
        const accepted = this.quotations.filter(q => q.status === 'accepted').length;
        
        document.getElementById('totalQuotes').textContent = this.combinedItems.length;
        document.getElementById('pendingQuotes').textContent = pendingRFQs;
        document.getElementById('draftQuotes').textContent = drafts;
        document.getElementById('sentQuotes').textContent = sent;
        document.getElementById('acceptedQuotes').textContent = accepted;
    },

    renderQuotations() {
        const container = document.getElementById('quotationsList');
        const loadingEl = document.getElementById('loadingState');
        const emptyEl = document.getElementById('emptyState');
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (this.combinedItems.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            if (container) container.innerHTML = '';
            return;
        }
        
        if (emptyEl) emptyEl.style.display = 'none';
        
        let filtered = this.applyFilters(this.combinedItems);
        
        container.innerHTML = filtered.map(item => 
            item.type === 'rfq' ? this.renderRFQCard(item.data) : this.renderQuoteCard(item.data)
        ).join('');
    },

    renderRFQCard(rfq) {
        const items = rfq.rfq_items || [];
        const itemCount = items.length;
        const createdDate = new Date(rfq.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        
        const contactIcon = this.getContactIcon(rfq.preferred_contact);
        
        return `
            <div class="rfq-card" data-rfq-id="${rfq.id}" onclick="SupplierQuotations.viewRFQ(${rfq.id})">
                <div class="rfq-badge">RFQ</div>
                
                <div class="rfq-header">
                    <div class="rfq-title">
                        <h3>${this.escapeHtml(rfq.title)}</h3>
                        <span class="rfq-number">${rfq.rfq_number || 'RFQ'}</span>
                    </div>
                    <span class="status-badge pending">New</span>
                </div>
                
                <div class="rfq-meta">
                    <span class="meta-item"><i class="far fa-user"></i> ${this.escapeHtml(rfq.buyer_name)}</span>
                    <span class="meta-item"><i class="far fa-calendar"></i> ${createdDate}</span>
                    <span class="meta-item"><i class="fas fa-box"></i> ${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                    <span class="meta-item contact-preference">${contactIcon} ${rfq.preferred_contact}</span>
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
                    <div class="buyer-contact"><i class="fas fa-envelope"></i> ${rfq.buyer_email}</div>
                    <button class="quote-now-btn" onclick="event.stopPropagation(); SupplierQuotations.createQuoteFromRFQ(${rfq.id})">
                        <i class="fas fa-file-invoice"></i> Quote Now
                    </button>
                </div>
            </div>
        `;
    },

    renderQuoteCard(quote) {
        const rfq = quote.rfq_requests || {};
        const createdDate = new Date(quote.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        
        const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'Not set';
        const isExpiring = this.checkIfExpiring(quote.valid_until);
        
        return `
            <div class="quote-card ${quote.status}" data-quote-id="${quote.id}" onclick="SupplierQuotations.viewQuote(${quote.id})">
                <div class="quote-badge">Quote</div>
                
                <div class="quote-header">
                    <div class="quote-title">
                        <h3>${this.escapeHtml(rfq.title || 'Quote')}</h3>
                        <span class="quote-number">${quote.quote_number || 'Draft'}</span>
                    </div>
                    <span class="status-badge ${quote.status}">${this.formatStatus(quote.status)}</span>
                </div>
                
                <div class="quote-meta">
                    <span class="meta-item"><i class="far fa-user"></i> ${this.escapeHtml(rfq.buyer_name || 'Buyer')}</span>
                    <span class="meta-item"><i class="far fa-calendar"></i> ${createdDate}</span>
                    <span class="meta-item"><i class="fas fa-tag"></i> UGX ${this.formatNumber(quote.total_amount)}</span>
                </div>
                
                <div class="quote-details">
                    <div class="detail-item">
                        <span class="detail-label">Valid Until:</span>
                        <span class="detail-value ${isExpiring ? 'expiring' : ''}">${validUntil}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Payment:</span>
                        <span class="detail-value">${this.formatPaymentTerms(quote.payment_terms?.[0])}</span>
                    </div>
                </div>
                
                <div class="quote-footer">
                    <div class="buyer-contact"><i class="fas fa-envelope"></i> ${rfq.buyer_email || 'No email'}</div>
                    <div class="quote-actions" onclick="event.stopPropagation()">
                        <button class="action-btn reply" onclick="SupplierQuotations.openReplyModal(${quote.id}, 'quote')" title="Reply">
                            <i class="fas fa-reply"></i>
                        </button>
                        ${quote.status === 'draft' ? `
                            <button class="action-btn" onclick="SupplierQuotations.editQuote(${quote.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn" onclick="SupplierQuotations.sendQuote(${quote.id})">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            <button class="action-btn delete" onclick="SupplierQuotations.deleteQuote(${quote.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn view" onclick="SupplierQuotations.viewQuote(${quote.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // ============================================
    // RFQ ACTIONS
    // ============================================
    async viewRFQ(rfqId) {
        const rfq = this.rfqs.find(r => r.id === rfqId);
        if (!rfq) return;
        
        this.currentRFQ = rfq;
        
        if (!rfq.viewed_at) {
            await sb
                .from('rfq_matches')
                .update({ viewed_at: new Date().toISOString() })
                .eq('rfq_id', rfqId)
                .eq('supplier_id', this.supplier.id);
        }
        
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
            <button class="btn-success" onclick="SupplierQuotations.openReplyModal(${rfq.id}, 'rfq')">
                <i class="fas fa-reply"></i> Reply
            </button>
            <button class="btn-primary" onclick="SupplierQuotations.createQuoteFromRFQ(${rfq.id})">
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
        
        document.getElementById('createQuoteTitle').textContent = 'Create Quotation';
        document.getElementById('quoteId').value = '';
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
        const card = document.getElementById('buyerInfoCard');
        const info = document.getElementById('buyerInfo');
        const contactPref = document.getElementById('contactPreference');
        
        card.style.display = 'block';
        
        info.innerHTML = `
            <div class="buyer-detail-row"><span class="buyer-detail-label">Name:</span><span class="buyer-detail-value">${this.escapeHtml(rfq.buyer_name)}</span></div>
            <div class="buyer-detail-row"><span class="buyer-detail-label">Email:</span><span class="buyer-detail-value">${this.escapeHtml(rfq.buyer_email)}</span></div>
            ${rfq.buyer_phone ? `<div class="buyer-detail-row"><span class="buyer-detail-label">Phone:</span><span class="buyer-detail-value">${rfq.buyer_phone}</span></div>` : ''}
        `;
        
        contactPref.innerHTML = `<i class="fas fa-bell"></i> Buyer prefers: <strong>${rfq.preferred_contact}</strong> ${this.getContactIcon(rfq.preferred_contact)}`;
    },

    // ============================================
    // QUOTE ACTIONS
    // ============================================
    async viewQuote(quoteId) {
        const quote = this.quotations.find(q => q.id === quoteId);
        if (!quote) return;
        
        this.currentQuote = quote;
        
        const rfq = quote.rfq_requests || {};
        const items = quote.items || [];
        const createdDate = new Date(quote.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const modalBody = document.getElementById('quoteModalBody');
        const modalFooter = document.getElementById('quoteModalFooter');
        
        modalBody.innerHTML = `
            <div class="detail-section">
                <h4>Quote Information</h4>
                <div class="detail-row"><span class="detail-label">Number:</span><span class="detail-value">${quote.quote_number || 'Draft'}</span></div>
                <div class="detail-row"><span class="detail-label">RFQ:</span><span class="detail-value">${rfq.rfq_number || 'N/A'} - ${this.escapeHtml(rfq.title || '')}</span></div>
                <div class="detail-row"><span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${quote.status}">${this.formatStatus(quote.status)}</span></span></div>
                <div class="detail-row"><span class="detail-label">Created:</span><span class="detail-value">${createdDate}</span></div>
                <div class="detail-row"><span class="detail-label">Valid Until:</span><span class="detail-value">${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'Not set'}</span></div>
            </div>
            
            <div class="detail-section">
                <h4>Buyer</h4>
                <div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${this.escapeHtml(rfq.buyer_name || 'N/A')}</span></div>
                <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${this.escapeHtml(rfq.buyer_email || 'N/A')}</span></div>
                ${rfq.buyer_phone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${rfq.buyer_phone}</span></div>` : ''}
            </div>
            
            <div class="detail-section">
                <h4>Items</h4>
                <table class="items-table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                    <tbody>
                        ${items.map(item => `
                            <tr><td>${this.escapeHtml(item.product_name)}</td><td>${item.quantity}</td><td>UGX ${this.formatNumber(item.unit_price)}</td><td>UGX ${this.formatNumber(item.unit_price * item.quantity)}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="total-amount"><strong>Total: UGX ${this.formatNumber(quote.total_amount)}</strong></div>
            </div>
            
            <div class="detail-section">
                <h4>Terms</h4>
                <div class="detail-row"><span class="detail-label">Payment:</span><span class="detail-value">${this.formatPaymentTerms(quote.payment_terms?.[0])}</span></div>
                <div class="detail-row"><span class="detail-label">Delivery:</span><span class="detail-value">${this.formatDeliveryTerms(quote.delivery_terms?.[0])}</span></div>
                ${quote.lead_time_days ? `<div class="detail-row"><span class="detail-label">Lead Time:</span><span class="detail-value">${quote.lead_time_days} days</span></div>` : ''}
            </div>
            
            ${quote.notes ? `<div class="detail-section"><h4>Notes</h4><p>${this.escapeHtml(quote.notes)}</p></div>` : ''}
        `;
        
        modalFooter.innerHTML = `
            <button class="btn-success" onclick="SupplierQuotations.openReplyModal(${quote.id}, 'quote')">
                <i class="fas fa-reply"></i> Reply
            </button>
            ${quote.status === 'draft' ? `
                <button class="btn-primary" onclick="SupplierQuotations.editQuote(${quote.id})">Edit</button>
                <button class="btn-success" onclick="SupplierQuotations.sendQuote(${quote.id})">Send</button>
            ` : ''}
            <button class="btn-secondary" onclick="closeQuoteModal()">Close</button>
        `;
        
        document.getElementById('quoteModal').classList.add('show');
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

    removeQuoteItem(index) {
        this.quoteItems.splice(index, 1);
        this.renderQuoteItems();
    },

    updateQuoteItem(index, field, value) {
        this.quoteItems[index][field] = field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value;
        this.updateQuoteSummary();
        this.renderQuoteItems();
    },

    renderQuoteItems() {
        const container = document.getElementById('quoteItemsContainer');
        
        container.innerHTML = this.quoteItems.map((item, index) => `
            <div class="quote-item">
                <div class="quote-item-header">
                    <span>Item ${index + 1}</span>
                    <button type="button" class="remove-item-btn" onclick="SupplierQuotations.removeQuoteItem(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="quote-item-fields">
                    <input type="text" placeholder="Product name" value="${this.escapeHtml(item.product_name)}" onchange="SupplierQuotations.updateQuoteItem(${index}, 'product_name', this.value)">
                    <input type="number" placeholder="Qty" value="${item.quantity}" min="1" onchange="SupplierQuotations.updateQuoteItem(${index}, 'quantity', this.value)">
                    <select onchange="SupplierQuotations.updateQuoteItem(${index}, 'unit', this.value)">
                        <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>Pcs</option>
                        <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>Kg</option>
                        <option value="ton" ${item.unit === 'ton' ? 'selected' : ''}>Ton</option>
                        <option value="meter" ${item.unit === 'meter' ? 'selected' : ''}>Meter</option>
                        <option value="liter" ${item.unit === 'liter' ? 'selected' : ''}>Liter</option>
                        <option value="carton" ${item.unit === 'carton' ? 'selected' : ''}>Carton</option>
                    </select>
                    <input type="number" placeholder="Unit price" value="${item.unit_price}" min="0" step="100" onchange="SupplierQuotations.updateQuoteItem(${index}, 'unit_price', this.value)">
                </div>
                <input type="text" placeholder="Notes (optional)" value="${this.escapeHtml(item.notes)}" style="width:100%; margin-top:8px; padding:8px; border:1px solid var(--gray-300); border-radius:var(--radius-sm);" onchange="SupplierQuotations.updateQuoteItem(${index}, 'notes', this.value)">
            </div>
        `).join('');
        
        this.updateQuoteSummary();
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
            const quoteId = document.getElementById('quoteId').value;
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
            
            let quoteData = {
                supplier_id: this.supplier.id,
                rfq_id: rfqId || null,
                items: items,
                valid_until: new Date(validUntil).toISOString(),
                status: status,
                total_amount: total,
                currency: 'UGX',
                payment_terms: [paymentTerms],
                delivery_terms: [deliveryTerms],
                lead_time_days: leadTime ? parseInt(leadTime) : null,
                notes: notes || null
            };
            
            if (quoteNumber) quoteData.quote_number = quoteNumber;
            
            let savedQuote;
            
            if (quoteId) {
                quoteData.updated_at = new Date().toISOString();
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .update(quoteData)
                    .eq('id', quoteId)
                    .select()
                    .single();
                if (error) throw error;
                savedQuote = data;
            } else {
                quoteData.created_at = new Date().toISOString();
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .insert(quoteData)
                    .select()
                    .single();
                if (error) throw error;
                savedQuote = data;
            }
            
            if (status === 'sent' && rfqId) {
                await sb
                    .from('rfq_matches')
                    .update({ status: 'quoted', updated_at: new Date().toISOString() })
                    .eq('rfq_id', rfqId)
                    .eq('supplier_id', this.supplier.id);
                
                const { data: rfq } = await sb
                    .from('rfq_requests')
                    .select('buyer_id')
                    .eq('id', rfqId)
                    .single();
                
                if (rfq) {
                    await sb.from('notifications').insert({
                        user_id: rfq.buyer_id,
                        type: 'quote_received',
                        title: 'New Quotation Received',
                        message: `You've received a quotation for your RFQ`,
                        link: `/buyer-quote.html?id=${savedQuote.id}`
                    });
                }
            }
            
            this.closeCreateQuoteModal();
            await this.loadRFQs();
            await this.loadQuotations();
            
            this.showToast(status === 'draft' ? 'Quote saved as draft' : 'Quote sent successfully!', 'success');
            
        } catch (error) {
            console.error('Error saving quote:', error);
            this.showToast('Error saving quote: ' + error.message, 'error');
        }
    },

    async editQuote(quoteId) {
        const quote = this.quotations.find(q => q.id === quoteId);
        if (!quote) return;
        
        this.currentQuote = quote;
        this.quoteItems = (quote.items || []).map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit || 'pcs',
            unit_price: item.unit_price,
            notes: item.notes || ''
        }));
        
        document.getElementById('createQuoteTitle').textContent = 'Edit Quotation';
        document.getElementById('quoteId').value = quote.id;
        document.getElementById('rfqId').value = quote.rfq_id || '';
        
        if (quote.valid_until) document.getElementById('validUntil').value = quote.valid_until.split('T')[0];
        
        document.getElementById('paymentTerms').value = quote.payment_terms?.[0] || 'advance_full';
        document.getElementById('deliveryTerms').value = quote.delivery_terms?.[0] || 'ex_warehouse';
        document.getElementById('leadTime').value = quote.lead_time_days || '7';
        document.getElementById('quoteNotes').value = quote.notes || '';
        
        if (quote.rfq_id) {
            const rfq = this.rfqs.find(r => r.id === quote.rfq_id);
            if (rfq) this.renderBuyerInfo(rfq);
        }
        
        this.renderQuoteItems();
        document.getElementById('createQuoteModal').classList.add('show');
    },

    async sendQuote(quoteId) {
        if (!confirm('Send this quotation to the buyer?')) return;
        
        try {
            const { error } = await sb
                .from('supplier_quotes')
                .update({ status: 'sent', updated_at: new Date().toISOString() })
                .eq('id', quoteId);
            
            if (error) throw error;
            
            this.showToast('Quote sent successfully', 'success');
            await this.loadQuotations();
            
        } catch (error) {
            console.error('Error sending quote:', error);
            this.showToast('Error sending quote', 'error');
        }
    },

    deleteQuote(quoteId) {
        this.currentQuote = this.quotations.find(q => q.id === quoteId);
        document.getElementById('deleteModal').classList.add('show');
    },

    async confirmDelete() {
        if (!this.currentQuote) return;
        
        try {
            const { error } = await sb
                .from('supplier_quotes')
                .delete()
                .eq('id', this.currentQuote.id);
            
            if (error) throw error;
            
            this.showToast('Quote deleted', 'success');
            this.closeDeleteModal();
            await this.loadQuotations();
            
        } catch (error) {
            console.error('Error deleting quote:', error);
            this.showToast('Error deleting quote', 'error');
        }
    },

    // ============================================
    // REPLY FUNCTIONALITY
    // ============================================
    openReplyModal(itemId, type) {
        if (type === 'quote') {
            this.currentReplyQuote = this.quotations.find(q => q.id === itemId);
        } else {
            this.currentReplyRFQ = this.rfqs.find(r => r.id === itemId);
        }
        document.getElementById('replyModal').classList.add('show');
        document.getElementById('replyMessage').value = '';
    },

    closeReplyModal() {
        document.getElementById('replyModal').classList.remove('show');
        this.currentReplyQuote = null;
        this.currentReplyRFQ = null;
    },

    replyViaWhatsApp() {
        let buyerPhone = '';
        let message = '';
        
        if (this.currentReplyQuote) {
            const rfq = this.currentReplyQuote.rfq_requests || {};
            buyerPhone = rfq.buyer_phone || '';
            message = this.generateReplyMessage(this.currentReplyQuote, rfq);
        } else if (this.currentReplyRFQ) {
            buyerPhone = this.currentReplyRFQ.buyer_phone || '';
            message = this.generateRFQReplyMessage(this.currentReplyRFQ);
        }
        
        if (!buyerPhone) {
            this.showToast('No phone number available for this buyer', 'error');
            return;
        }
        
        const cleanNumber = buyerPhone.replace(/\D/g, '');
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
        
        this.trackReply('whatsapp');
        window.open(whatsappUrl, '_blank');
        this.closeReplyModal();
    },

    replyViaEmail() {
        let buyerEmail = '';
        let subject = '';
        let body = '';
        
        if (this.currentReplyQuote) {
            const rfq = this.currentReplyQuote.rfq_requests || {};
            buyerEmail = rfq.buyer_email || '';
            subject = `Re: Quotation ${this.currentReplyQuote.quote_number || 'from SourceX'}`;
            body = this.generateReplyMessage(this.currentReplyQuote, rfq);
        } else if (this.currentReplyRFQ) {
            buyerEmail = this.currentReplyRFQ.buyer_email || '';
            subject = `Re: RFQ ${this.currentReplyRFQ.rfq_number || 'Request'}`;
            body = this.generateRFQReplyMessage(this.currentReplyRFQ);
        }
        
        if (!buyerEmail) {
            this.showToast('No email address available for this buyer', 'error');
            return;
        }
        
        this.trackReply('email');
        window.location.href = `mailto:${buyerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        this.closeReplyModal();
    },

    replyViaPhone() {
        let buyerPhone = '';
        
        if (this.currentReplyQuote) {
            const rfq = this.currentReplyQuote.rfq_requests || {};
            buyerPhone = rfq.buyer_phone || '';
        } else if (this.currentReplyRFQ) {
            buyerPhone = this.currentReplyRFQ.buyer_phone || '';
        }
        
        if (!buyerPhone) {
            this.showToast('No phone number available for this buyer', 'error');
            return;
        }
        
        this.trackReply('phone');
        window.location.href = `tel:${buyerPhone}`;
        this.closeReplyModal();
    },

    async replyViaPlatform() {
        let receiverId = '';
        let message = '';
        
        if (this.currentReplyQuote) {
            const rfq = this.currentReplyQuote.rfq_requests || {};
            receiverId = rfq.buyer_id;
            message = this.generateReplyMessage(this.currentReplyQuote, rfq);
        } else if (this.currentReplyRFQ) {
            receiverId = this.currentReplyRFQ.buyer_id;
            message = this.generateRFQReplyMessage(this.currentReplyRFQ);
        }
        
        if (!receiverId) {
            this.showToast('Unable to send message', 'error');
            return;
        }
        
        await this.sendInAppMessage(receiverId, message);
        this.closeReplyModal();
    },

    async sendReply() {
        const message = document.getElementById('replyMessage').value.trim();
        if (!message) {
            this.showToast('Please enter a message', 'error');
            return;
        }
        
        let receiverId = '';
        
        if (this.currentReplyQuote) {
            const rfq = this.currentReplyQuote.rfq_requests || {};
            receiverId = rfq.buyer_id;
        } else if (this.currentReplyRFQ) {
            receiverId = this.currentReplyRFQ.buyer_id;
        }
        
        if (!receiverId) {
            this.showToast('Unable to send message', 'error');
            return;
        }
        
        await this.sendInAppMessage(receiverId, message);
        this.closeReplyModal();
    },

    async sendInAppMessage(receiverId, message) {
        try {
            const { data: existingConv } = await sb
                .from('conversations')
                .select('id')
                .or(`and(participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${receiverId}),and(participant_one_id.eq.${receiverId},participant_two_id.eq.${this.currentUser.id})`)
                .maybeSingle();
            
            let conversationId;
            
            if (existingConv) {
                conversationId = existingConv.id;
            } else {
                const { data: newConv } = await sb
                    .from('conversations')
                    .insert({
                        participant_one_id: this.currentUser.id,
                        participant_two_id: receiverId
                    })
                    .select()
                    .single();
                conversationId = newConv.id;
            }
            
            const { error } = await sb
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: this.currentUser.id,
                    receiver_id: receiverId,
                    content: message,
                    message_type: 'text'
                });
            
            if (error) throw error;
            
            this.trackReply('platform');
            this.showToast('Message sent successfully', 'success');
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('Failed to send message', 'error');
        }
    },

    generateReplyMessage(quote, rfq) {
        const items = quote.items || [];
        let itemsText = '';
        items.forEach(item => {
            itemsText += `\n- ${item.product_name}: ${item.quantity} units @ UGX ${this.formatNumber(item.unit_price)} = UGX ${this.formatNumber(item.unit_price * item.quantity)}`;
        });
        
        return `
Hello ${rfq.buyer_name || 'Buyer'},

Thank you for your interest in our products. Here is the quotation for your request:

QUOTATION DETAILS:
${itemsText}

Subtotal: UGX ${this.formatNumber(quote.total_amount)}
Payment Terms: ${this.formatPaymentTerms(quote.payment_terms?.[0])}
Delivery Terms: ${this.formatDeliveryTerms(quote.delivery_terms?.[0])}
Valid Until: ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'Not specified'}
${quote.notes ? `\nAdditional Notes:\n${quote.notes}` : ''}

We look forward to working with you.

Best regards,
${this.supplier?.business_name || 'SourceX Supplier'}
        `.trim();
    },

    generateRFQReplyMessage(rfq) {
        const items = rfq.rfq_items || [];
        let itemsText = '';
        items.forEach(item => {
            itemsText += `\n- ${item.product_name}: ${item.quantity} ${item.unit || 'pcs'}`;
        });
        
        return `
Hello ${rfq.buyer_name || 'Buyer'},

Thank you for your RFQ. We have reviewed your requirements and can supply the following items:

RFQ ITEMS:
${itemsText}

We would be happy to provide you with a detailed quotation. Please let us know:
- Your preferred delivery timeline
- Any specific quality requirements
- Your budget range

We look forward to serving you.

Best regards,
${this.supplier?.business_name || 'SourceX Supplier'}
        `.trim();
    },

    async trackReply(method) {
        try {
            const adId = this.currentReplyQuote?.ad_id || this.currentReplyRFQ?.ad_id || null;
            
            await sb
                .from('ad_engagement')
                .insert({
                    ad_id: adId,
                    user_id: this.currentUser.id,
                    action: method,
                    performed_at: new Date().toISOString(),
                    metadata: {
                        quote_id: this.currentReplyQuote?.id,
                        rfq_id: this.currentReplyRFQ?.id,
                        type: this.currentReplyQuote ? 'quote_reply' : 'rfq_reply'
                    }
                });
        } catch (error) {
            console.error('Error tracking reply:', error);
        }
    },

    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterQuotations(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.renderQuotations();
    },

    applyFilters(items) {
        return items.filter(item => {
            if (this.filters.types.length > 0 && !this.filters.types.includes(item.type)) return false;
            if (this.filters.status.length > 0 && !this.filters.status.includes(item.status)) return false;
            
            if (this.filters.dateRange !== 'all') {
                const itemDate = new Date(item.date);
                const now = new Date();
                if (this.filters.dateRange === 'today' && itemDate.toDateString() !== now.toDateString()) return false;
                if (this.filters.dateRange === 'week') {
                    const weekAgo = new Date(now.setDate(now.getDate() - 7));
                    if (itemDate < weekAgo) return false;
                }
                if (this.filters.dateRange === 'month') {
                    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                    if (itemDate < monthAgo) return false;
                }
            }
            
            if (this.filters.search) {
                const searchLower = this.filters.search.toLowerCase();
                if (item.type === 'rfq') {
                    const rfq = item.data;
                    if (!rfq.title?.toLowerCase().includes(searchLower) &&
                        !rfq.buyer_name?.toLowerCase().includes(searchLower)) return false;
                } else {
                    const quote = item.data;
                    const rfq = quote.rfq_requests || {};
                    if (!rfq.title?.toLowerCase().includes(searchLower) &&
                        !rfq.buyer_name?.toLowerCase().includes(searchLower) &&
                        !quote.quote_number?.toLowerCase().includes(searchLower)) return false;
                }
            }
            return true;
        });
    },

    handleSearch() {
        this.filters.search = document.getElementById('searchInput').value;
        this.renderQuotations();
    },

    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },

    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeRFQModal() { document.getElementById('rfqModal').classList.remove('show'); },
    closeQuoteModal() { document.getElementById('quoteModal').classList.remove('show'); },
    closeCreateQuoteModal() { document.getElementById('createQuoteModal').classList.remove('show'); this.quoteItems = []; },
    closeDeleteModal() { document.getElementById('deleteModal').classList.remove('show'); this.currentQuote = null; },
    closeSuccessModal() { document.getElementById('successModal').classList.remove('show'); },

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    formatStatus(status) {
        const map = { 'draft': 'Draft', 'sent': 'Sent', 'accepted': 'Accepted', 'rejected': 'Rejected', 'expired': 'Expired', 'pending': 'New' };
        return map[status] || status;
    },

    formatPaymentTerms(term) {
        const map = { 'advance_full': '100% Advance', 'advance_partial': '50% Advance', 'credit_7': '7 Days Credit', 'credit_15': '15 Days Credit', 'credit_30': '30 Days Credit', 'negotiable': 'Negotiable' };
        return map[term] || term || 'Not specified';
    },

    formatDeliveryTerms(term) {
        const map = { 'ex_warehouse': 'Ex-Warehouse', 'fob': 'FOB', 'cif': 'CIF', 'door_delivery': 'Door Delivery', 'pickup': 'Buyer Pickup' };
        return map[term] || term || 'Not specified';
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

    checkIfExpiring(dateString) {
        if (!dateString) return false;
        const daysLeft = Math.ceil((new Date(dateString) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft <= 3;
    },

    formatNumber(num) { return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0'; },
    escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; },

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
            searchTimeout = setTimeout(() => this.handleSearch(), 500);
        });
        
        document.getElementById('filterBtn').addEventListener('click', () => this.toggleFilterPanel());
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterQuotations(e.target.dataset.tab));
        });
        
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                    this.closeRFQModal(); this.closeQuoteModal(); this.closeCreateQuoteModal(); this.closeDeleteModal(); this.closeSuccessModal(); this.closeReplyModal();
                }
            });
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeRFQModal(); this.closeQuoteModal(); this.closeCreateQuoteModal(); this.closeDeleteModal(); this.closeReplyModal();
            }
        });
    }
};

// ============================================
// GLOBAL FUNCTIONS
// ============================================
window.SupplierQuotations = SupplierQuotations;
window.filterQuotations = (status) => SupplierQuotations.filterQuotations(status);
window.loadMoreQuotes = () => {};
window.closeRFQModal = () => SupplierQuotations.closeRFQModal();
window.closeQuoteModal = () => SupplierQuotations.closeQuoteModal();
window.closeCreateQuoteModal = () => SupplierQuotations.closeCreateQuoteModal();
window.closeDeleteModal = () => SupplierQuotations.closeDeleteModal();
window.closeSuccessModal = () => SupplierQuotations.closeSuccessModal();
window.closeReplyModal = () => SupplierQuotations.closeReplyModal();
window.addQuoteItem = () => SupplierQuotations.addQuoteItem();
window.saveQuoteAsDraft = () => SupplierQuotations.saveQuoteAsDraft();
window.sendQuote = () => SupplierQuotations.sendQuote();
window.confirmDelete = () => SupplierQuotations.confirmDelete();
window.replyViaWhatsApp = () => SupplierQuotations.replyViaWhatsApp();
window.replyViaEmail = () => SupplierQuotations.replyViaEmail();
window.replyViaPhone = () => SupplierQuotations.replyViaPhone();
window.replyViaPlatform = () => SupplierQuotations.replyViaPlatform();
window.sendReply = () => SupplierQuotations.sendReply();

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierQuotations.init();
});