// ============================================
// SUPPLIER QUOTATIONS MANAGEMENT
// BuyUganda.online
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierQuotations = {
    currentUser: null,
    supplier: null,
    allQuotes: [],
    filteredQuotes: [],
    currentTab: 'all',
    currentQuote: null,
    quoteItems: [],
    isEditing: false,

    async init() {
        console.log('🚀 Supplier Quotations initializing...');
        this.showLoading(true);
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadQuotes();
            this.setupEventListeners();
            this.showLoading(false);
            console.log('✅ Supplier Quotations ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showLoading(false);
            this.showToast('Error loading quotes', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            
            if (!user) {
                window.location.href = 'login.html?redirect=supplier-quotations.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated');
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },

    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id, business_name')
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

    async loadQuotes() {
        try {
            if (!this.supplier) return;
            
            const { data, error } = await sb
                .from('supplier_quotes')
                .select(`
                    *,
                    rfq_requests (
                        id,
                        rfq_number,
                        title,
                        buyer_name,
                        buyer_email,
                        buyer_phone,
                        preferred_contact
                    )
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            this.allQuotes = data || [];
            console.log(`📋 Loaded ${this.allQuotes.length} quotes`);
            this.filterQuotes();
            
        } catch (error) {
            console.error('Error loading quotes:', error);
            this.allQuotes = [];
            this.filterQuotes();
        }
    },

    filterQuotes() {
        let filtered = [...this.allQuotes];
        
        if (this.currentTab !== 'all') {
            filtered = filtered.filter(q => q.status === this.currentTab);
        }
        
        this.filteredQuotes = filtered;
        this.renderQuotes();
        this.updateStats();
    },

    updateStats() {
        const drafts = this.allQuotes.filter(q => q.status === 'draft').length;
        const sent = this.allQuotes.filter(q => q.status === 'sent').length;
        const accepted = this.allQuotes.filter(q => q.status === 'accepted').length;
        
        document.getElementById('totalCount').textContent = this.allQuotes.length;
        document.getElementById('draftCount').textContent = drafts;
        document.getElementById('sentCount').textContent = sent;
        document.getElementById('acceptedCount').textContent = accepted;
    },

    renderQuotes() {
        const container = document.getElementById('quoteList');
        const loadingEl = document.getElementById('loadingState');
        const emptyEl = document.getElementById('emptyState');
        
        loadingEl.style.display = 'none';
        
        if (this.filteredQuotes.length === 0) {
            container.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        
        emptyEl.style.display = 'none';
        
        container.innerHTML = this.filteredQuotes.map(quote => {
            const rfq = quote.rfq_requests || {};
            const createdDate = new Date(quote.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
            const items = quote.items || [];
            const total = quote.total_amount || 0;
            
            return `
                <div class="quote-card">
                    <div class="quote-header">
                        <span class="quote-number">${quote.quote_number || 'Draft'}</span>
                        <span class="status-badge ${quote.status}">${this.capitalize(quote.status)}</span>
                    </div>
                    
                    <div class="buyer-name">
                        <i class="fas fa-user" style="font-size: 12px; color: #999; margin-right: 6px;"></i>
                        ${this.escapeHtml(rfq.buyer_name || 'Unknown Buyer')}
                    </div>
                    
                    <div class="quote-details">
                        <div class="detail-row">
                            <span class="detail-label">RFQ:</span>
                            <span class="detail-value">${this.escapeHtml(rfq.title || 'N/A')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Items:</span>
                            <span class="detail-value">${items.length} product(s)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Created:</span>
                            <span class="detail-value">${createdDate}</span>
                        </div>
                        ${quote.valid_until ? `
                            <div class="detail-row">
                                <span class="detail-label">Valid Until:</span>
                                <span class="detail-value">${new Date(quote.valid_until).toLocaleDateString()}</span>
                            </div>
                        ` : ''}
                        <div class="total-amount">
                            UGX ${this.formatNumber(total)}
                        </div>
                    </div>
                    
                    <div class="quote-footer">
                        ${quote.status === 'draft' ? `
                            <button class="quote-btn secondary" onclick="SupplierQuotations.editQuote(${quote.id})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="quote-btn primary" onclick="SupplierQuotations.sendQuote(${quote.id})">
                                <i class="fas fa-paper-plane"></i> Send
                            </button>
                            <button class="quote-btn danger" onclick="SupplierQuotations.deleteQuote(${quote.id})">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        ` : `
                            <button class="quote-btn primary" onclick="SupplierQuotations.viewQuoteDetails(${quote.id})">
                                <i class="fas fa-eye"></i> View Details
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    },

    newQuote() {
        this.isEditing = false;
        this.currentQuote = null;
        this.quoteItems = [{
            product_name: '',
            quantity: 1,
            unit: 'pcs',
            unit_price: 0
        }];
        
        this.openQuoteModal();
    },

    async editQuote(quoteId) {
        const quote = this.allQuotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        this.isEditing = true;
        this.currentQuote = quote;
        this.quoteItems = quote.items || [];
        
        this.openQuoteModal();
    },

    openQuoteModal() {
        const modal = document.getElementById('quoteModal');
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        
        modalTitle.textContent = this.isEditing ? 'Edit Quotation' : 'New Quotation';
        
        // Set default valid until (7 days from now)
        const defaultValidUntil = new Date();
        defaultValidUntil.setDate(defaultValidUntil.getDate() + 7);
        const defaultDate = defaultValidUntil.toISOString().split('T')[0];
        
        modalBody.innerHTML = `
            <div class="form-group">
                <label>Valid Until <span style="color:#ff4444">*</span></label>
                <input type="date" id="validUntil" value="${this.currentQuote?.valid_until?.split('T')[0] || defaultDate}">
            </div>
            
            <div class="form-group">
                <label>Payment Terms</label>
                <select id="paymentTerms">
                    <option value="advance_full" ${this.currentQuote?.payment_terms?.[0] === 'advance_full' ? 'selected' : ''}>100% Advance</option>
                    <option value="advance_partial" ${this.currentQuote?.payment_terms?.[0] === 'advance_partial' ? 'selected' : ''}>50% Advance</option>
                    <option value="credit_7" ${this.currentQuote?.payment_terms?.[0] === 'credit_7' ? 'selected' : ''}>7 Days Credit</option>
                    <option value="credit_15" ${this.currentQuote?.payment_terms?.[0] === 'credit_15' ? 'selected' : ''}>15 Days Credit</option>
                    <option value="credit_30" ${this.currentQuote?.payment_terms?.[0] === 'credit_30' ? 'selected' : ''}>30 Days Credit</option>
                    <option value="negotiable" ${this.currentQuote?.payment_terms?.[0] === 'negotiable' ? 'selected' : ''}>Negotiable</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Delivery Terms</label>
                <select id="deliveryTerms">
                    <option value="ex_warehouse" ${this.currentQuote?.delivery_terms?.[0] === 'ex_warehouse' ? 'selected' : ''}>Ex-Warehouse</option>
                    <option value="door_delivery" ${this.currentQuote?.delivery_terms?.[0] === 'door_delivery' ? 'selected' : ''}>Door Delivery</option>
                    <option value="pickup" ${this.currentQuote?.delivery_terms?.[0] === 'pickup' ? 'selected' : ''}>Buyer Pickup</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Lead Time (days)</label>
                <input type="number" id="leadTime" value="${this.currentQuote?.lead_time_days || 7}" min="1">
            </div>
            
            <label style="font-size: 14px; font-weight: 500; margin-bottom: 8px; display: block;">Items</label>
            <div class="items-list" id="quoteItemsContainer"></div>
            
            <button class="add-item-btn" onclick="SupplierQuotations.addItem()">
                <i class="fas fa-plus"></i> Add Item
            </button>
            
            <div class="form-group">
                <label>Notes (optional)</label>
                <textarea id="quoteNotes" rows="3" placeholder="Warranty, specifications, delivery details...">${this.currentQuote?.notes || ''}</textarea>
            </div>
            
            <div class="quote-summary">
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span id="subtotal">UGX 0</span>
                </div>
                <div class="summary-row total">
                    <span>Total:</span>
                    <span id="total">UGX 0</span>
                </div>
            </div>
        `;
        
        this.renderQuoteItems();
        this.updateSummary();
        
        modal.classList.add('show');
    },

    renderQuoteItems() {
        const container = document.getElementById('quoteItemsContainer');
        if (!container) return;
        
        container.innerHTML = this.quoteItems.map((item, index) => `
            <div class="quote-item">
                <div class="item-name">
                    <input type="text" placeholder="Product name" value="${this.escapeHtml(item.product_name)}" 
                           onchange="SupplierQuotations.updateItem(${index}, 'product_name', this.value)">
                </div>
                <div class="item-row">
                    <input type="number" placeholder="Qty" value="${item.quantity}" min="1" 
                           onchange="SupplierQuotations.updateItem(${index}, 'quantity', this.value)">
                    <select onchange="SupplierQuotations.updateItem(${index}, 'unit', this.value)">
                        <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>Pcs</option>
                        <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>Kg</option>
                        <option value="tons" ${item.unit === 'tons' ? 'selected' : ''}>Tons</option>
                        <option value="meters" ${item.unit === 'meters' ? 'selected' : ''}>Meters</option>
                        <option value="liters" ${item.unit === 'liters' ? 'selected' : ''}>Liters</option>
                    </select>
                    <input type="number" placeholder="Unit price" value="${item.unit_price}" min="0" 
                           onchange="SupplierQuotations.updateItem(${index}, 'unit_price', this.value)">
                    <button onclick="SupplierQuotations.removeItem(${index})" 
                            style="background: none; border: none; color: #f44336; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        this.updateSummary();
    },

    addItem() {
        this.quoteItems.push({
            product_name: '',
            quantity: 1,
            unit: 'pcs',
            unit_price: 0
        });
        this.renderQuoteItems();
    },

    removeItem(index) {
        this.quoteItems.splice(index, 1);
        this.renderQuoteItems();
    },

    updateItem(index, field, value) {
        if (this.quoteItems[index]) {
            this.quoteItems[index][field] = field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value;
            this.updateSummary();
            this.renderQuoteItems();
        }
    },

    updateSummary() {
        let subtotal = 0;
        for (const item of this.quoteItems) {
            subtotal += (item.quantity || 0) * (item.unit_price || 0);
        }
        
        document.getElementById('subtotal').textContent = `UGX ${this.formatNumber(subtotal)}`;
        document.getElementById('total').textContent = `UGX ${this.formatNumber(subtotal)}`;
    },

    async saveAsDraft() {
        await this.saveQuote('draft');
    },

    async sendQuote() {
        if (!this.validateQuote()) {
            this.showToast('Please add at least one item with product name, quantity, and price', 'error');
            return;
        }
        await this.saveQuote('sent');
    },

    validateQuote() {
        if (this.quoteItems.length === 0) return false;
        for (const item of this.quoteItems) {
            if (!item.product_name || item.quantity <= 0 || item.unit_price <= 0) {
                return false;
            }
        }
        return true;
    },

    async saveQuote(status) {
        if (!this.supplier) {
            this.showToast('Supplier profile not found', 'error');
            return;
        }
        
        const validUntil = document.getElementById('validUntil')?.value;
        const paymentTerms = document.getElementById('paymentTerms')?.value;
        const deliveryTerms = document.getElementById('deliveryTerms')?.value;
        const leadTime = document.getElementById('leadTime')?.value;
        const notes = document.getElementById('quoteNotes')?.value;
        
        const items = this.quoteItems.map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price
        }));
        
        const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        
        const quoteData = {
            supplier_id: this.supplier.id,
            items: items,
            total_amount: total,
            currency: 'UGX',
            payment_terms: [paymentTerms],
            delivery_terms: [deliveryTerms],
            lead_time_days: leadTime ? parseInt(leadTime) : null,
            notes: notes || null,
            status: status,
            valid_until: validUntil ? new Date(validUntil).toISOString() : null,
            updated_at: new Date().toISOString()
        };
        
        if (status === 'sent' && !this.isEditing) {
            quoteData.quote_number = 'QTE-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        }
        
        try {
            let result;
            
            if (this.isEditing && this.currentQuote) {
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .update(quoteData)
                    .eq('id', this.currentQuote.id)
                    .select()
                    .single();
                    
                if (error) throw error;
                result = data;
            } else {
                quoteData.created_at = new Date().toISOString();
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .insert(quoteData)
                    .select()
                    .single();
                    
                if (error) throw error;
                result = data;
            }
            
            this.closeQuoteModal();
            await this.loadQuotes();
            this.showToast(status === 'draft' ? 'Quote saved as draft' : 'Quote sent successfully!', 'success');
            
        } catch (error) {
            console.error('Error saving quote:', error);
            this.showToast(error.message || 'Error saving quote', 'error');
        }
    },

    async sendQuote(quoteId) {
        if (!confirm('Send this quotation to the buyer?')) return;
        
        try {
            const { error } = await sb
                .from('supplier_quotes')
                .update({ status: 'sent', updated_at: new Date().toISOString() })
                .eq('id', quoteId);
            
            if (error) throw error;
            
            await this.loadQuotes();
            this.showToast('Quote sent successfully!', 'success');
            
        } catch (error) {
            console.error('Error sending quote:', error);
            this.showToast('Error sending quote', 'error');
        }
    },

    async deleteQuote(quoteId) {
        if (!confirm('Are you sure you want to delete this quotation?')) return;
        
        try {
            const { error } = await sb
                .from('supplier_quotes')
                .delete()
                .eq('id', quoteId);
            
            if (error) throw error;
            
            await this.loadQuotes();
            this.showToast('Quote deleted', 'success');
            
        } catch (error) {
            console.error('Error deleting quote:', error);
            this.showToast('Error deleting quote', 'error');
        }
    },

    async viewQuoteDetails(quoteId) {
        const quote = this.allQuotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        const rfq = quote.rfq_requests || {};
        const items = quote.items || [];
        const createdDate = new Date(quote.created_at).toLocaleDateString();
        
        const modal = document.getElementById('quoteModal');
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const footer = document.querySelector('#quoteModal .modal-footer');
        
        modalTitle.textContent = 'Quote Details';
        
        modalBody.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Quote Number:</span>
                <span class="detail-value">${quote.quote_number || 'Draft'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Buyer:</span>
                <span class="detail-value">${this.escapeHtml(rfq.buyer_name || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="status-badge ${quote.status}">${this.capitalize(quote.status)}</span></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Created:</span>
                <span class="detail-value">${createdDate}</span>
            </div>
            ${quote.valid_until ? `
                <div class="detail-row">
                    <span class="detail-label">Valid Until:</span>
                    <span class="detail-value">${new Date(quote.valid_until).toLocaleDateString()}</span>
                </div>
            ` : ''}
            
            <div style="margin-top: 16px;">
                <strong>Items:</strong>
                <div class="items-list" style="margin-top: 8px;">
                    ${items.map(item => `
                        <div class="quote-item">
                            <div><strong>${this.escapeHtml(item.product_name)}</strong></div>
                            <div style="font-size: 13px; color: #666;">
                                ${item.quantity} ${item.unit || 'pcs'} × UGX ${this.formatNumber(item.unit_price)} = 
                                <strong>UGX ${this.formatNumber(item.unit_price * item.quantity)}</strong>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="quote-summary" style="margin-top: 16px;">
                <div class="summary-row total">
                    <span>Total Amount:</span>
                    <span>UGX ${this.formatNumber(quote.total_amount)}</span>
                </div>
            </div>
            
            ${quote.notes ? `
                <div style="margin-top: 16px;">
                    <strong>Notes:</strong>
                    <p style="margin-top: 8px; font-size: 13px; color: #666; background: #f8f9fa; padding: 12px; border-radius: 10px;">
                        ${this.escapeHtml(quote.notes)}
                    </p>
                </div>
            ` : ''}
        `;
        
        footer.innerHTML = `
            <button class="btn-secondary" onclick="closeQuoteModal()">Close</button>
            ${quote.status === 'draft' ? `
                <button class="btn-primary" onclick="SupplierQuotations.editQuote(${quote.id}); closeQuoteModal();">Edit</button>
                <button class="btn-primary" onclick="SupplierQuotations.sendQuote(${quote.id}); closeQuoteModal();">Send</button>
            ` : ''}
        `;
        
        modal.classList.add('show');
    },

    closeQuoteModal() {
        document.getElementById('quoteModal').classList.remove('show');
        this.isEditing = false;
        this.currentQuote = null;
    },

    setupEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.filterQuotes();
            });
        });
        
        // Modal buttons
        document.getElementById('saveDraftBtn')?.addEventListener('click', () => this.saveAsDraft());
        document.getElementById('sendQuoteBtn')?.addEventListener('click', () => this.sendQuote());
    },

    capitalize(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
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
    }
};

// Global functions
window.SupplierQuotations = SupplierQuotations;
window.closeQuoteModal = () => SupplierQuotations.closeQuoteModal();
window.addItem = () => SupplierQuotations.addItem();
window.removeItem = (i) => SupplierQuotations.removeItem(i);
window.updateItem = (i, f, v) => SupplierQuotations.updateItem(i, f, v);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    SupplierQuotations.init();
});
