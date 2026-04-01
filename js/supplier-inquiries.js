// ============================================
// SUPPLIER INQUIRIES MANAGEMENT - COMPLETE FIXED
// ============================================

console.log('🚀 Supplier Inquiries loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let SupplierInquiries = {
    currentUser: null,
    supplier: null,
    inquiries: [],
    filteredInquiries: [],
    categories: [],
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentInquiry: null,
    currentTab: 'all',
    quoteItems: [],
    filters: {
        status: [],
        category: 'all',
        dateRange: 'all',
        search: ''
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Inquiries initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadCategories();
            await this.loadInquiries();
            this.setupEventListeners();
            
            console.log('✅ Supplier Inquiries initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading inquiries', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-inquiries.html';
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
    
    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name, display_name')
                .eq('is_active', true)
                .order('name');
            
            if (error) throw error;
            
            this.categories = data || [];
            
            // Populate category filter
            const select = document.getElementById('categoryFilter');
            if (select) {
                select.innerHTML = '<option value="all">All Categories</option>' + 
                    this.categories.map(c => `<option value="${c.id}">${c.display_name || c.name}</option>`).join('');
            }
            
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },
    
    async loadInquiries(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('inquiriesList').innerHTML = '';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('loadMore').style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            // Get inquiries that match this supplier's products or are general
            let query = sb
                .from('inquiry_requests')
                .select(`
                    *,
                    profiles!inquiry_requests_buyer_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        location,
                        is_verified
                    ),
                    inquiry_items (*),
                    inquiry_supplier_matches!left (
                        id,
                        supplier_id,
                        has_quoted
                    )
                `)
                .in('status', ['sent', 'pending'])
                .order('created_at', { ascending: false });
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            // Filter to only show relevant inquiries (either matched to this supplier or general)
            const relevantInquiries = (data || []).filter(inquiry => {
                // Check if this supplier is matched
                const isMatched = inquiry.inquiry_supplier_matches?.some(
                    match => match.supplier_id === this.supplier.id
                );
                
                // If not matched but it's a general inquiry (no specific supplier matches), still show it
                const isGeneral = !inquiry.inquiry_supplier_matches || inquiry.inquiry_supplier_matches.length === 0;
                
                return isMatched || isGeneral;
            });
            
            if (reset) {
                this.inquiries = relevantInquiries;
            } else {
                this.inquiries = [...this.inquiries, ...relevantInquiries];
            }
            
            this.filteredInquiries = [...this.inquiries];
            this.hasMore = relevantInquiries.length === this.itemsPerPage;
            
            this.updateStats();
            this.renderInquiries();
            
            document.getElementById('loadingState').style.display = 'none';
            
            if (this.filteredInquiries.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
            } else {
                document.getElementById('loadMore').style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading inquiries:', error);
            this.showToast('Error loading inquiries', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // UPDATE STATS
    // ============================================
    updateStats() {
        const now = new Date();
        
        const total = this.inquiries.length;
        
        const newInquiries = this.inquiries.filter(i => {
            const isNew = !i.inquiry_supplier_matches?.some(m => m.supplier_id === this.supplier.id && m.has_quoted);
            return isNew;
        }).length;
        
        const quoted = this.inquiries.filter(i => 
            i.inquiry_supplier_matches?.some(m => m.supplier_id === this.supplier.id && m.has_quoted)
        ).length;
        
        const urgent = this.inquiries.filter(i => {
            const daysLeft = Math.ceil((new Date(i.expires_at) - now) / (1000 * 60 * 60 * 24));
            return daysLeft <= 2;
        }).length;
        
        document.getElementById('totalInquiries').textContent = total;
        document.getElementById('newInquiries').textContent = newInquiries;
        document.getElementById('quotedInquiries').textContent = quoted;
        document.getElementById('urgentInquiries').textContent = urgent;
    },
    
    // ============================================
    // RENDER INQUIRIES
    // ============================================
    renderInquiries() {
        const container = document.getElementById('inquiriesList');
        
        if (this.filteredInquiries.length === 0) return;
        
        container.innerHTML = this.filteredInquiries.map(inquiry => this.renderInquiryCard(inquiry)).join('');
    },
    
    renderInquiryCard(inquiry) {
        const buyer = inquiry.profiles || {};
        const buyerName = buyer.business_name || buyer.full_name || 'Buyer';
        const buyerInitials = buyerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const items = inquiry.inquiry_items || [];
        const previewItems = items.slice(0, 2);
        const hasQuoted = inquiry.inquiry_supplier_matches?.some(
            m => m.supplier_id === this.supplier.id && m.has_quoted
        );
        
        // Check if urgent
        const now = new Date();
        const expiryDate = new Date(inquiry.expires_at);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 2;
        
        // Determine status
        let status = 'new';
        let statusText = 'New';
        
        if (hasQuoted) {
            status = 'quoted';
            statusText = 'Quoted';
        } else if (isUrgent) {
            status = 'urgent';
            statusText = 'Urgent';
        }
        
        // Format date
        const createdDate = new Date(inquiry.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        
        return `
            <div class="inquiry-card ${status}" data-inquiry-id="${inquiry.id}" onclick="SupplierInquiries.viewInquiry(${inquiry.id})">
                <div class="inquiry-header">
                    <div class="inquiry-info">
                        <h3>${this.escapeHtml(inquiry.title || 'Untitled Inquiry')}</h3>
                        <div class="inquiry-number">${inquiry.inquiry_number || ''} • ${createdDate}</div>
                    </div>
                    <span class="inquiry-badge ${status}">${statusText}</span>
                </div>
                
                <div class="buyer-info">
                    <div class="buyer-avatar">
                        ${buyer.avatar_url ? 
                            `<img src="${buyer.avatar_url}" alt="${buyerName}">` : 
                            buyerInitials
                        }
                    </div>
                    <div class="buyer-details">
                        <div class="buyer-name">${this.escapeHtml(buyerName)}</div>
                        <div class="buyer-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${this.escapeHtml(buyer.location || 'Uganda')}
                            ${buyer.is_verified ? ' • <i class="fas fa-check-circle" style="color: var(--secondary);"></i> Verified' : ''}
                        </div>
                    </div>
                </div>
                
                <div class="products-list">
                    <div class="products-header">
                        <span>Requested Items (${items.length})</span>
                    </div>
                    ${previewItems.map(item => `
                        <div class="product-item">
                            <span class="product-name">${this.escapeHtml(item.product_name)}</span>
                            <span class="product-qty">x${item.quantity}</span>
                        </div>
                    `).join('')}
                    ${items.length > 2 ? `
                        <div class="product-item" style="justify-content: center; color: var(--gray-500);">
                            +${items.length - 2} more items
                        </div>
                    ` : ''}
                </div>
                
                <div class="inquiry-footer">
                    <div class="inquiry-date ${isUrgent ? 'urgent' : ''}">
                        <i class="fas fa-clock"></i>
                        ${isUrgent ? `${daysLeft} days left` : `Expires ${this.formatDate(inquiry.expires_at)}`}
                    </div>
                    <div class="inquiry-actions" onclick="event.stopPropagation()">
                        ${!hasQuoted ? `
                            <button class="action-btn quote" onclick="SupplierInquiries.quickQuote(${inquiry.id})" title="Create Quote">
                                <i class="fas fa-file-invoice"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn" onclick="SupplierInquiries.viewInquiry(${inquiry.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // VIEW INQUIRY DETAILS
    // ============================================
    async viewInquiry(inquiryId) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) return;
        
        this.currentInquiry = inquiry;
        
        const buyer = inquiry.profiles || {};
        const items = inquiry.inquiry_items || [];
        const hasQuoted = inquiry.inquiry_supplier_matches?.some(
            m => m.supplier_id === this.supplier.id && m.has_quoted
        );
        
        const modalBody = document.getElementById('inquiryModalBody');
        const modalFooter = document.getElementById('inquiryModalFooter');
        
        modalBody.innerHTML = `
            <div class="inquiry-detail-section">
                <h4>Inquiry Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Number:</span>
                    <span class="detail-value">${inquiry.inquiry_number || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Title:</span>
                    <span class="detail-value">${this.escapeHtml(inquiry.title || 'Untitled')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${hasQuoted ? 'Quoted' : 'New'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Created:</span>
                    <span class="detail-value">${this.formatDate(inquiry.created_at)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Expires:</span>
                    <span class="detail-value">${this.formatDate(inquiry.expires_at)}</span>
                </div>
            </div>
            
            <div class="inquiry-detail-section">
                <h4>Buyer Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${this.escapeHtml(buyer.business_name || buyer.full_name || 'Buyer')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Location:</span>
                    <span class="detail-value">${this.escapeHtml(buyer.location || 'Uganda')}</span>
                </div>
                ${buyer.phone ? `
                <div class="detail-row">
                    <span class="detail-label">Phone:</span>
                    <span class="detail-value">${buyer.phone}</span>
                </div>
                ` : ''}
                ${buyer.email ? `
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${buyer.email}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="inquiry-detail-section">
                <h4>Requested Items</h4>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Quantity</th>
                            <th>Target Price</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${this.escapeHtml(item.product_name)}</td>
                                <td>${item.quantity}</td>
                                <td>${item.preferred_unit_price ? 'UGX ' + this.formatNumber(item.preferred_unit_price) : 'Not specified'}</td>
                                <td>${this.escapeHtml(item.notes || '')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            ${inquiry.description ? `
            <div class="inquiry-detail-section">
                <h4>Additional Requirements</h4>
                <p>${this.escapeHtml(inquiry.description)}</p>
            </div>
            ` : ''}
            
            ${inquiry.shipping_address ? `
            <div class="inquiry-detail-section">
                <h4>Delivery Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Address:</span>
                    <span class="detail-value">${this.escapeHtml(inquiry.shipping_address)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">District:</span>
                    <span class="detail-value">${this.escapeHtml(inquiry.shipping_district || '')}</span>
                </div>
            </div>
            ` : ''}
        `;
        
        modalFooter.innerHTML = `
            ${!hasQuoted ? `
                <button class="btn-success" onclick="SupplierInquiries.quickQuote(${inquiry.id})">
                    <i class="fas fa-file-invoice"></i> Create Quote
                </button>
            ` : ''}
            <button class="btn-secondary" onclick="SupplierInquiries.closeInquiryModal()">Close</button>
        `;
        
        document.getElementById('inquiryModal').classList.add('show');
    },
    
    // ============================================
    // QUICK QUOTE - FIXED VERSION
    // ============================================
    quickQuote(inquiryId) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) return;
        
        this.currentInquiry = inquiry;
        
        // Set default valid until (7 days from now)
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 7);
        document.getElementById('quickQuoteValidUntil').value = validUntil.toISOString().split('T')[0];
        
        // Set inquiry ID
        document.getElementById('quickQuoteInquiryId').value = inquiry.id;
        
        // Load buyer info
        const buyer = inquiry.profiles || {};
        document.getElementById('quickQuoteBuyerInfo').innerHTML = `
            <h4>Quote for ${this.escapeHtml(buyer.business_name || buyer.full_name || 'Buyer')}</h4>
            <div class="buyer-detail-row">
                <span class="buyer-detail-label">Location:</span>
                <span class="buyer-detail-value">${this.escapeHtml(buyer.location || 'Uganda')}</span>
            </div>
            <div class="buyer-detail-row">
                <span class="buyer-detail-label">Inquiry:</span>
                <span class="buyer-detail-value">${inquiry.inquiry_number}</span>
            </div>
        `;
        
        // Create quote items from inquiry items and store the inquiry_item_id
        this.quoteItems = (inquiry.inquiry_items || []).map(item => ({
            id: item.id, // Store the inquiry_item_id for later use
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.preferred_unit_price || 0,
            notes: item.notes || ''
        }));
        
        this.renderQuickQuoteItems();
        this.updateQuickQuoteSummary();
        
        document.getElementById('quickQuoteModal').classList.add('show');
    },
    
    renderQuickQuoteItems() {
        const container = document.getElementById('quickQuoteItemsContainer');
        
        container.innerHTML = this.quoteItems.map((item, index) => `
            <div class="quote-item">
                <div class="quote-item-header">
                    <span>Item ${index + 1}</span>
                </div>
                <div class="quote-item-fields">
                    <input type="text" 
                           value="${this.escapeHtml(item.product_name)}"
                           readonly
                           placeholder="Product name">
                    <input type="number" 
                           value="${item.quantity}"
                           readonly
                           placeholder="Qty">
                    <input type="number" 
                           id="price-${index}"
                           value="${item.unit_price}"
                           min="0"
                           step="100"
                           onchange="SupplierInquiries.updateQuoteItemPrice(${index}, this.value)"
                           placeholder="Price">
                </div>
                <input type="text" 
                       id="notes-${index}"
                       value="${this.escapeHtml(item.notes)}"
                       placeholder="Notes (optional)"
                       style="width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--gray-300); border-radius: var(--radius-sm);"
                       onchange="SupplierInquiries.updateQuoteItemNotes(${index}, this.value)">
            </div>
        `).join('');
    },
    
    updateQuoteItemPrice(index, price) {
        if (this.quoteItems[index]) {
            this.quoteItems[index].unit_price = parseFloat(price) || 0;
            this.updateQuickQuoteSummary();
        }
    },
    
    updateQuoteItemNotes(index, notes) {
        if (this.quoteItems[index]) {
            this.quoteItems[index].notes = notes;
        }
    },
    
    updateQuickQuoteSummary() {
        const subtotal = this.quoteItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        document.getElementById('quickQuoteSubtotal').textContent = `UGX ${this.formatNumber(subtotal)}`;
        document.getElementById('quickQuoteTotal').textContent = `UGX ${this.formatNumber(subtotal)}`;
    },
    
    // ============================================
    // SEND QUICK QUOTE - FIXED with inquiry_item_id
    // ============================================
    async sendQuickQuote() {
        const inquiryId = document.getElementById('quickQuoteInquiryId').value;
        const validUntil = document.getElementById('quickQuoteValidUntil').value;
        const paymentTerms = document.getElementById('quickQuotePaymentTerms').value;
        const deliveryTerms = document.getElementById('quickQuoteDeliveryTerms').value;
        const leadTime = document.getElementById('quickQuoteLeadTime').value;
        const notes = document.getElementById('quickQuoteNotes').value;
        
        if (!validUntil) {
            this.showToast('Please select valid until date', 'error');
            return;
        }
        
        // Validate all items have prices
        for (const item of this.quoteItems) {
            if (item.unit_price <= 0) {
                this.showToast('Please enter prices for all items', 'error');
                return;
            }
        }
        
        try {
            const total = this.quoteItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
            const quoteNumber = 'QTE-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            
            // Create quote
            const { data: quote, error: quoteError } = await sb
                .from('supplier_quotes')
                .insert({
                    quote_number: quoteNumber,
                    inquiry_id: parseInt(inquiryId),
                    supplier_id: this.supplier.id,
                    valid_until: new Date(validUntil).toISOString(),
                    status: 'sent',
                    total_amount: total,
                    currency: 'UGX',
                    payment_terms: [paymentTerms],
                    delivery_terms: [deliveryTerms],
                    lead_time_days: leadTime ? parseInt(leadTime) : null,
                    notes: notes || null,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
                
            if (quoteError) throw quoteError;
            
            // Create quote items with inquiry_item_id (FIXED)
            const quoteItems = this.quoteItems.map(item => ({
                supplier_quote_id: quote.id,
                inquiry_item_id: item.id, // This is the critical fix - using the stored inquiry_item_id
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.unit_price * item.quantity,
                notes: item.notes || null
            }));
            
            const { error: itemsError } = await sb
                .from('supplier_quote_items')
                .insert(quoteItems);
                
            if (itemsError) {
                console.error('Items error details:', itemsError);
                throw itemsError;
            }
            
            // Update inquiry match status
            await sb
                .from('inquiry_supplier_matches')
                .upsert({
                    inquiry_id: parseInt(inquiryId),
                    supplier_id: this.supplier.id,
                    has_quoted: true
                }, { onConflict: 'inquiry_id, supplier_id' });
            
            // Create notification for buyer
            await sb
                .from('notifications')
                .insert({
                    user_id: this.currentInquiry.buyer_id,
                    type: 'quote_received',
                    title: 'New Quotation Received',
                    message: `You've received a quotation for your inquiry: ${this.currentInquiry.title}`,
                    link: `/buyer-quote.html?id=${quote.id}`
                });
            
            this.closeQuickQuoteModal();
            this.showToast('Quote sent successfully!', 'success');
            
            // Refresh inquiries
            await this.loadInquiries(true);
            
        } catch (error) {
            console.error('Error sending quote:', error);
            this.showToast('Error sending quote: ' + error.message, 'error');
        }
    },
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterInquiries(status) {
        this.currentTab = status;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === status);
        });
        
        this.applyClientFilters();
    },
    
    applyFilters() {
        const statusFilters = [];
        document.querySelectorAll('.status-filter:checked').forEach(cb => {
            statusFilters.push(cb.value);
        });
        
        this.filters.status = statusFilters;
        this.filters.category = document.getElementById('categoryFilter').value;
        this.filters.dateRange = document.getElementById('dateRange').value;
        
        this.applyClientFilters();
        this.closeFilterPanel();
    },
    
    applyClientFilters() {
        const now = new Date();
        
        this.filteredInquiries = this.inquiries.filter(inquiry => {
            const hasQuoted = inquiry.inquiry_supplier_matches?.some(
                m => m.supplier_id === this.supplier.id && m.has_quoted
            );
            const daysLeft = Math.ceil((new Date(inquiry.expires_at) - now) / (1000 * 60 * 60 * 24));
            const isUrgent = daysLeft <= 2;
            
            // Tab filter
            if (this.currentTab === 'new' && (hasQuoted || isUrgent)) return false;
            if (this.currentTab === 'quoted' && !hasQuoted) return false;
            if (this.currentTab === 'urgent' && !isUrgent) return false;
            
            // Status filter
            if (this.filters.status.length > 0) {
                let statusMatch = false;
                if (this.filters.status.includes('new') && !hasQuoted && !isUrgent) statusMatch = true;
                if (this.filters.status.includes('quoted') && hasQuoted) statusMatch = true;
                if (this.filters.status.includes('urgent') && isUrgent) statusMatch = true;
                if (this.filters.status.includes('expiring') && daysLeft <= 3 && daysLeft > 0) statusMatch = true;
                
                if (!statusMatch) return false;
            }
            
            // Search filter
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                const buyerName = (inquiry.profiles?.business_name || inquiry.profiles?.full_name || '').toLowerCase();
                const title = (inquiry.title || '').toLowerCase();
                
                if (!buyerName.includes(searchTerm) && !title.includes(searchTerm)) {
                    return false;
                }
            }
            
            // Date range filter
            if (this.filters.dateRange !== 'all') {
                const inquiryDate = new Date(inquiry.created_at);
                const now = new Date();
                
                if (this.filters.dateRange === 'today') {
                    if (inquiryDate.toDateString() !== now.toDateString()) return false;
                } else if (this.filters.dateRange === 'week') {
                    const weekAgo = new Date(now.setDate(now.getDate() - 7));
                    if (inquiryDate < weekAgo) return false;
                } else if (this.filters.dateRange === 'month') {
                    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                    if (inquiryDate < monthAgo) return false;
                }
            }
            
            return true;
        });
        
        this.renderInquiries();
        
        if (this.filteredInquiries.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            document.getElementById('emptyState').style.display = 'none';
        }
    },
    
    resetFilters() {
        document.querySelectorAll('.status-filter').forEach(cb => cb.checked = false);
        document.getElementById('categoryFilter').value = 'all';
        document.getElementById('dateRange').value = 'all';
        
        this.filters = {
            status: [],
            category: 'all',
            dateRange: 'all',
            search: this.filters.search
        };
        
        this.filteredInquiries = [...this.inquiries];
        this.renderInquiries();
        this.closeFilterPanel();
        
        if (this.filteredInquiries.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            document.getElementById('emptyState').style.display = 'none';
        }
    },
    
    handleSearch() {
        const searchTerm = document.getElementById('searchInput').value;
        this.filters.search = searchTerm;
        this.applyClientFilters();
    },
    
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    
    closeFilterPanel() {
        document.getElementById('filterPanel').style.display = 'none';
    },
    
    loadMoreInquiries() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadInquiries(false);
    },
    
    refreshInquiries() {
        this.loadInquiries(true);
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeInquiryModal() {
        document.getElementById('inquiryModal').classList.remove('show');
    },
    
    closeQuickQuoteModal() {
        document.getElementById('quickQuoteModal').classList.remove('show');
        // Reset form
        document.getElementById('quickQuoteNotes').value = '';
        document.getElementById('quickQuoteLeadTime').value = '7';
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Search with debounce
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.handleSearch(), 500);
        });
        
        // Filter button
        document.getElementById('filterBtn').addEventListener('click', () => {
            this.toggleFilterPanel();
        });
        
        // Apply filters
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });
        
        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.filterInquiries(tab);
            });
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeInquiryModal();
                    this.closeQuickQuoteModal();
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierInquiries.init();
});

// Global functions
window.SupplierInquiries = SupplierInquiries;
window.filterInquiries = (status) => SupplierInquiries.filterInquiries(status);
window.loadMoreInquiries = () => SupplierInquiries.loadMoreInquiries();
window.refreshInquiries = () => SupplierInquiries.refreshInquiries();
window.closeInquiryModal = () => SupplierInquiries.closeInquiryModal();
window.closeQuickQuoteModal = () => SupplierInquiries.closeQuickQuoteModal();
window.updateQuoteItemPrice = (index, price) => SupplierInquiries.updateQuoteItemPrice(index, price);
window.updateQuoteItemNotes = (index, notes) => SupplierInquiries.updateQuoteItemNotes(index, notes);
window.sendQuickQuote = () => SupplierInquiries.sendQuickQuote();