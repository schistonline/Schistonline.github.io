// ============================================
// SUPPLIER INQUIRIES - FIXED VERSION
// ============================================

console.log('📋 Supplier Inquiries loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierInquiries = {
    currentUser: null,
    supplier: null,
    inquiries: [],
    filteredInquiries: [],
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    filters: {
        status: 'all',
        date: 'all',
        sort: 'newest',
        search: ''
    },
    selectedInquiry: null,
    currentReplyInquiryId: null,
    subscriptions: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📋 Initializing inquiries page...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadInquiries();
            
            this.renderSupplierInfo();
            this.renderStats();
            this.renderInquiries();
            this.setupEventListeners();
            this.setupRealtimeSubscriptions();
            
            // Hide loading state
            const loadingState = document.getElementById('loadingState');
            if (loadingState) {
                loadingState.style.display = 'none';
            }
            
            console.log('✅ Inquiries page initialized');
        } catch (error) {
            console.error('Error initializing:', error);
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
                .select(`
                    *,
                    profile:profiles!suppliers_profile_id_fkey (*)
                `)
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
    
    // ============================================
    // LOAD INQUIRIES - FIXED VERSION
    // ============================================
    async loadInquiries() {
        try {
            if (!this.supplier?.id) {
                console.log('No supplier ID yet');
                return;
            }
            
            // First, get all inquiry IDs that match this supplier
            const { data: matches, error: matchesError } = await sb
                .from('inquiry_supplier_matches')
                .select('inquiry_id')
                .eq('supplier_id', this.supplier.id);
            
            if (matchesError) throw matchesError;
            
            const inquiryIds = matches?.map(m => m.inquiry_id) || [];
            
            if (inquiryIds.length === 0) {
                this.inquiries = [];
                this.filteredInquiries = [];
                this.totalCount = 0;
                return;
            }
            
            // Now get the inquiries with these IDs
            let query = sb
                .from('inquiry_requests')
                .select(`
                    *,
                    inquiry_items (
                        id,
                        product_id,
                        product_name,
                        quantity,
                        preferred_unit_price,
                        notes
                    )
                `)
                .in('id', inquiryIds);
            
            // Apply status filter
            if (this.filters.status !== 'all') {
                query = query.eq('status', this.filters.status);
            }
            
            // Date filter
            if (this.filters.date !== 'all') {
                const now = new Date();
                let startDate;
                
                switch (this.filters.date) {
                    case 'today':
                        startDate = new Date(now);
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        startDate = new Date(now);
                        startDate.setDate(startDate.getDate() - 7);
                        break;
                    case 'month':
                        startDate = new Date(now);
                        startDate.setMonth(startDate.getMonth() - 1);
                        break;
                }
                
                if (startDate) {
                    query = query.gte('created_at', startDate.toISOString());
                }
            }
            
            // Sort
            switch (this.filters.sort) {
                case 'newest':
                    query = query.order('created_at', { ascending: false });
                    break;
                case 'oldest':
                    query = query.order('created_at', { ascending: true });
                    break;
                case 'product':
                    query = query.order('title', { ascending: true });
                    break;
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            // Get buyer profiles separately (if we have buyer_ids)
            const buyerIds = data?.filter(d => d.buyer_id).map(d => d.buyer_id) || [];
            
            if (buyerIds.length > 0) {
                const { data: profiles, error: profilesError } = await sb
                    .from('profiles')
                    .select('id, full_name, email, phone, avatar_url')
                    .in('id', buyerIds);
                
                if (!profilesError && profiles) {
                    // Attach buyer profiles to inquiries
                    data?.forEach(inquiry => {
                        if (inquiry.buyer_id) {
                            const profile = profiles.find(p => p.id === inquiry.buyer_id);
                            if (profile) {
                                inquiry.buyer = profile;
                            }
                        }
                    });
                }
            }
            
            // Also get the supplier matches with quote info
            if (data && data.length > 0) {
                const inquiryIdList = data.map(d => d.id);
                const { data: matchData, error: matchDataError } = await sb
                    .from('inquiry_supplier_matches')
                    .select('*')
                    .in('inquiry_id', inquiryIdList)
                    .eq('supplier_id', this.supplier.id);
                
                if (!matchDataError && matchData) {
                    // Attach matches to inquiries
                    data.forEach(inquiry => {
                        inquiry.inquiry_supplier_matches = matchData.filter(m => m.inquiry_id === inquiry.id);
                    });
                }
            }
            
            this.inquiries = data || [];
            this.totalCount = this.inquiries.length;
            
            // Apply search filter
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                this.filteredInquiries = this.inquiries.filter(inquiry => {
                    return (inquiry.title?.toLowerCase().includes(searchTerm) ||
                           inquiry.description?.toLowerCase().includes(searchTerm) ||
                           inquiry.buyer?.full_name?.toLowerCase().includes(searchTerm) ||
                           inquiry.buyer?.email?.toLowerCase().includes(searchTerm));
                });
            } else {
                this.filteredInquiries = [...this.inquiries];
            }
            
            console.log(`✅ Loaded ${this.filteredInquiries.length} inquiries`);
            
        } catch (error) {
            console.error('Error loading inquiries:', error);
            this.showToast('Error loading inquiries', 'error');
            this.inquiries = [];
            this.filteredInquiries = [];
            this.totalCount = 0;
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderSupplierInfo() {
        const profile = this.supplier?.profile || {};
        const name = this.supplier?.business_name || 'Supplier';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        // Sidebar
        const sidebarInfo = document.getElementById('sidebarSupplierInfo');
        if (sidebarInfo) {
            sidebarInfo.innerHTML = `
                <div class="supplier-avatar-mini">
                    ${profile.avatar_url ? 
                        `<img src="${profile.avatar_url}" alt="${name}">` : 
                        `<span>${initials}</span>`
                    }
                </div>
                <div class="supplier-details-mini">
                    <h4>${this.escapeHtml(name)}</h4>
                    <p>${this.escapeHtml(profile.email || '')}</p>
                </div>
            `;
        }
        
        // Mobile sidebar
        const mobileInfo = document.getElementById('mobileSupplierInfo');
        if (mobileInfo) {
            mobileInfo.innerHTML = `
                <div class="supplier-avatar-mini">
                    ${profile.avatar_url ? 
                        `<img src="${profile.avatar_url}" alt="${name}">` : 
                        `<span>${initials}</span>`
                    }
                </div>
                <div class="supplier-details-mini">
                    <h4>${this.escapeHtml(name)}</h4>
                    <p>${this.escapeHtml(profile.email || '')}</p>
                </div>
            `;
        }
        
        // Update badge counts
        this.updateBadgeCounts();
    },
    
    updateBadgeCounts() {
        const newCount = this.inquiries.filter(i => i.status === 'new').length;
        
        const badge = document.getElementById('inquiryBadge');
        if (badge) {
            badge.textContent = newCount;
            badge.style.display = newCount > 0 ? 'inline' : 'none';
        }
        
        const mobileBadge = document.getElementById('mobileInquiryBadge');
        if (mobileBadge) {
            mobileBadge.textContent = newCount;
            mobileBadge.style.display = newCount > 0 ? 'inline' : 'none';
        }
    },
    
    renderStats() {
        const total = this.inquiries.length;
        const newCount = this.inquiries.filter(i => i.status === 'new').length;
        const repliedCount = this.inquiries.filter(i => i.status === 'replied').length;
        const quotedCount = this.inquiries.filter(i => i.status === 'quoted').length;
        const closedCount = this.inquiries.filter(i => i.status === 'closed').length;
        
        document.getElementById('totalInquiries').textContent = total;
        document.getElementById('newInquiries').textContent = newCount;
        document.getElementById('repliedInquiries').textContent = repliedCount;
        document.getElementById('quotedInquiries').textContent = quotedCount;
        document.getElementById('closedInquiries').textContent = closedCount;
        
        // Update badge counts
        this.updateBadgeCounts();
    },
    
    renderInquiries() {
        const container = document.getElementById('inquiryList');
        const emptyState = document.getElementById('emptyState');
        
        if (!container) return;
        
        // Calculate pagination
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageInquiries = this.filteredInquiries.slice(start, end);
        
        if (pageInquiries.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                emptyState.style.display = 'block';
            }
            this.renderPagination();
            return;
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        container.innerHTML = pageInquiries.map(inquiry => {
            const statusClass = inquiry.status || 'new';
            const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
            const buyerName = inquiry.buyer?.full_name || 'Anonymous';
            const productName = inquiry.inquiry_items?.[0]?.product_name || 'Unknown Product';
            const createdAt = new Date(inquiry.created_at);
            const timeAgo = this.getTimeAgo(createdAt);
            
            // Find supplier match for this inquiry
            const match = inquiry.inquiry_supplier_matches?.find(m => m.supplier_id === this.supplier.id);
            const hasQuoted = match?.has_quoted || false;
            
            return `
                <div class="inquiry-card status-${statusClass}" data-id="${inquiry.id}">
                    <div class="inquiry-card-header">
                        <div class="inquiry-title">${this.escapeHtml(inquiry.title || 'Inquiry')}</div>
                        <span class="inquiry-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="inquiry-card-body">
                        <div class="inquiry-message">${this.escapeHtml(inquiry.description || 'No message')}</div>
                    </div>
                    <div class="inquiry-card-footer">
                        <div class="inquiry-meta">
                            <span><i class="fas fa-user"></i> ${this.escapeHtml(buyerName)}</span>
                            <span><i class="fas fa-box"></i> ${this.escapeHtml(productName)}</span>
                            <span><i class="fas fa-clock"></i> ${timeAgo}</span>
                            ${hasQuoted ? '<span class="text-success"><i class="fas fa-check-circle"></i> Quoted</span>' : ''}
                        </div>
                        <div class="inquiry-actions">
                            ${statusClass !== 'closed' ? `
                                <button class="btn-action reply" data-id="${inquiry.id}">
                                    <i class="fas fa-reply"></i> Reply
                                </button>
                            ` : ''}
                            <button class="btn-action view" data-id="${inquiry.id}">
                                <i class="fas fa-eye"></i> View
                            </button>
                            ${statusClass !== 'quoted' && statusClass !== 'closed' ? `
                                <button class="btn-action quote" data-id="${inquiry.id}">
                                    <i class="fas fa-file-invoice"></i> Quote
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Attach event listeners to action buttons
        container.querySelectorAll('.btn-action.reply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openReplyModal(id);
            });
        });
        
        container.querySelectorAll('.btn-action.view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openDetailModal(id);
            });
        });
        
        container.querySelectorAll('.btn-action.quote').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openReplyModal(id, true);
            });
        });
        
        // Click on card to view details
        container.querySelectorAll('.inquiry-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                this.openDetailModal(id);
            });
        });
        
        this.renderPagination();
    },
    
    renderPagination() {
        const totalPages = Math.ceil(this.filteredInquiries.length / this.pageSize) || 1;
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageInfo = document.getElementById('pageInfo');
        
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
        }
        
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
        }
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    openDetailModal(inquiryId) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) {
            this.showToast('Inquiry not found', 'error');
            return;
        }
        
        this.selectedInquiry = inquiry;
        
        const body = document.getElementById('inquiryDetailBody');
        const footer = document.getElementById('inquiryDetailFooter');
        const modal = document.getElementById('inquiryDetailModal');
        
        if (!body || !modal) return;
        
        const statusClass = inquiry.status || 'new';
        const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
        const buyerName = inquiry.buyer?.full_name || 'Anonymous';
        const buyerEmail = inquiry.buyer?.email || 'N/A';
        const buyerPhone = inquiry.buyer?.phone || 'N/A';
        const product = inquiry.inquiry_items?.[0];
        const productName = product?.product_name || 'Unknown Product';
        const quantity = product?.quantity || 1;
        const price = product?.preferred_unit_price || 'N/A';
        const createdAt = new Date(inquiry.created_at);
        const timeAgo = this.getTimeAgo(createdAt);
        
        const match = inquiry.inquiry_supplier_matches?.find(m => m.supplier_id === this.supplier.id);
        const hasQuoted = match?.has_quoted || false;
        const quoteAmount = match?.quote_amount || null;
        
        body.innerHTML = `
            <div class="inquiry-detail-header">
                <h4 style="font-size: 18px; font-weight: 600;">${this.escapeHtml(inquiry.title)}</h4>
                <span class="inquiry-detail-status ${statusClass}">${statusLabel}</span>
            </div>
            
            <div class="inquiry-detail-product">
                <div class="product-name"><i class="fas fa-box"></i> ${this.escapeHtml(productName)}</div>
                <div class="product-meta">
                    <span>Quantity: ${quantity} unit(s)</span>
                    ${price !== 'N/A' ? `<span>Price: UGX ${this.formatNumber(price)}</span>` : ''}
                </div>
            </div>
            
            <div class="inquiry-detail-message">
                <div class="message-label"><i class="fas fa-comment"></i> Message</div>
                <div class="message-text">${this.escapeHtml(inquiry.description || 'No message')}</div>
            </div>
            
            <div class="inquiry-detail-meta">
                <div class="meta-item"><i class="fas fa-user"></i> ${this.escapeHtml(buyerName)}</div>
                <div class="meta-item"><i class="fas fa-envelope"></i> ${this.escapeHtml(buyerEmail)}</div>
                <div class="meta-item"><i class="fas fa-phone"></i> ${this.escapeHtml(buyerPhone)}</div>
                <div class="meta-item"><i class="fas fa-clock"></i> ${timeAgo}</div>
                ${hasQuoted ? `<div class="meta-item text-success"><i class="fas fa-check-circle"></i> Quoted: UGX ${this.formatNumber(quoteAmount)}</div>` : ''}
            </div>
        `;
        
        if (footer) {
            footer.innerHTML = `
                ${inquiry.status !== 'closed' ? `
                    <button class="btn-primary" onclick="SupplierInquiries.openReplyModal(${inquiry.id})">
                        <i class="fas fa-reply"></i> Reply
                    </button>
                ` : ''}
                ${inquiry.status !== 'quoted' && inquiry.status !== 'closed' ? `
                    <button class="btn-success" onclick="SupplierInquiries.openReplyModal(${inquiry.id}, true)">
                        <i class="fas fa-file-invoice"></i> Send Quote
                    </button>
                ` : ''}
                <button class="btn-secondary" onclick="SupplierInquiries.closeModal('inquiryDetailModal')">Close</button>
            `;
        }
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    },
    
    openReplyModal(inquiryId, isQuote = false) {
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) {
            this.showToast('Inquiry not found', 'error');
            return;
        }
        
        this.currentReplyInquiryId = inquiryId;
        
        const modal = document.getElementById('replyModal');
        const preview = document.getElementById('replyInquiryPreview');
        const quoteFields = document.getElementById('quoteFields');
        const sendAsQuote = document.getElementById('sendAsQuote');
        const replyBtn = document.getElementById('replySendBtn');
        const messageTextarea = document.getElementById('replyMessage');
        const priceInput = document.getElementById('quotePrice');
        const quantityInput = document.getElementById('quoteQuantity');
        
        if (!modal || !preview) return;
        
        // Show preview
        const buyerName = inquiry.buyer?.full_name || 'Anonymous';
        const productName = inquiry.inquiry_items?.[0]?.product_name || 'Unknown Product';
        const quantity = inquiry.inquiry_items?.[0]?.quantity || 1;
        
        preview.innerHTML = `
            <div style="background: var(--gray-50); padding: 12px; border-radius: 12px; margin-bottom: 16px;">
                <div><strong>From:</strong> ${this.escapeHtml(buyerName)}</div>
                <div><strong>Product:</strong> ${this.escapeHtml(productName)}</div>
                <div><strong>Quantity:</strong> ${quantity} unit(s)</div>
                <div style="margin-top: 8px; font-size: 13px; color: var(--gray-500);">
                    ${this.escapeHtml(inquiry.description?.substring(0, 100) || '')}${inquiry.description?.length > 100 ? '...' : ''}
                </div>
            </div>
        `;
        
        // Set quote checkbox
        sendAsQuote.checked = isQuote;
        quoteFields.style.display = isQuote ? 'block' : 'none';
        
        // Pre-fill quote fields if available
        const product = inquiry.inquiry_items?.[0];
        if (product) {
            if (product.preferred_unit_price) {
                priceInput.value = product.preferred_unit_price;
            }
            if (product.quantity) {
                quantityInput.value = product.quantity;
            }
        }
        
        // Update button text
        replyBtn.innerHTML = isQuote ? 
            '<i class="fas fa-file-invoice"></i> Send Quote' :
            '<i class="fas fa-paper-plane"></i> Send Reply';
        
        // Clear previous message
        messageTextarea.value = '';
        this.updateCharCount();
        
        // Show modal
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Focus on textarea
        setTimeout(() => messageTextarea?.focus(), 300);
        
        // Store isQuote state
        modal.dataset.isQuote = isQuote ? 'true' : 'false';
    },
    
    async sendReply() {
        const inquiryId = this.currentReplyInquiryId;
        const inquiry = this.inquiries.find(i => i.id === inquiryId);
        if (!inquiry) {
            this.showToast('Inquiry not found', 'error');
            return;
        }
        
        const message = document.getElementById('replyMessage').value.trim();
        if (!message) {
            this.showToast('Please enter a reply message', 'error');
            document.getElementById('replyMessage').focus();
            return;
        }
        
        const isQuote = document.getElementById('sendAsQuote').checked;
        const modal = document.getElementById('replyModal');
        
        // Show loading
        const sendBtn = document.getElementById('replySendBtn');
        const originalText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        sendBtn.disabled = true;
        
        try {
            // Update inquiry status
            const newStatus = isQuote ? 'quoted' : 'replied';
            
            const { error: updateError } = await sb
                .from('inquiry_requests')
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', inquiryId);
            
            if (updateError) throw updateError;
            
            // If quoting, create a quotation record
            if (isQuote) {
                const price = parseFloat(document.getElementById('quotePrice').value) || 0;
                const quantity = parseInt(document.getElementById('quoteQuantity').value) || 1;
                const validityDays = parseInt(document.getElementById('quoteValidity').value) || 7;
                
                const validUntil = new Date();
                validUntil.setDate(validUntil.getDate() + validityDays);
                
                const quoteNumber = 'QT-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                
                // Check if supplier_quotes table exists, if not use a simpler approach
                try {
                    // Try to save to supplier_quotes
                    const { data: quote, error: quoteError } = await sb
                        .from('supplier_quotes')
                        .insert({
                            quote_number: quoteNumber,
                            supplier_id: this.supplier.id,
                            inquiry_id: inquiryId,
                            buyer_id: inquiry.buyer_id,
                            product_id: inquiry.inquiry_items?.[0]?.product_id,
                            product_name: inquiry.inquiry_items?.[0]?.product_name || 'Product',
                            quantity: quantity,
                            unit_price: price,
                            total_amount: price * quantity,
                            currency: 'UGX',
                            message: message,
                            status: 'sent',
                            valid_until: validUntil.toISOString()
                        })
                        .select()
                        .single();
                    
                    if (!quoteError && quote) {
                        console.log('✅ Quote saved:', quote.id);
                    }
                } catch (quoteError) {
                    console.log('Quote table may not exist, continuing...', quoteError);
                }
                
                // Update supplier match
                const match = inquiry.inquiry_supplier_matches?.find(m => m.supplier_id === this.supplier.id);
                if (match) {
                    try {
                        await sb
                            .from('inquiry_supplier_matches')
                            .update({
                                has_quoted: true,
                                quote_amount: price * quantity,
                                quote_notes: message,
                                quoted_at: new Date().toISOString()
                            })
                            .eq('id', match.id);
                        console.log('✅ Supplier match updated');
                    } catch (matchError) {
                        console.error('Error updating match:', matchError);
                    }
                }
            }
            
            this.showToast(isQuote ? 'Quote sent successfully!' : 'Reply sent successfully!', 'success');
            
            // Close modal
            this.closeModal('replyModal');
            
            // Refresh data
            await this.loadInquiries();
            this.renderStats();
            this.renderInquiries();
            
        } catch (error) {
            console.error('Error sending reply:', error);
            this.showToast('Failed to send reply: ' + error.message, 'error');
        } finally {
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
        }
    },
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
        }
        document.body.style.overflow = '';
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    
    updateCharCount() {
        const message = document.getElementById('replyMessage');
        const countEl = document.getElementById('replyCount');
        
        if (message && countEl) {
            const count = message.value.length;
            countEl.textContent = count;
            
            if (count > 1800) {
                countEl.style.color = '#EF4444';
            } else if (count > 1500) {
                countEl.style.color = '#F59E0B';
            } else {
                countEl.style.color = '#6B7280';
            }
        }
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // REALTIME SUBSCRIPTIONS
    // ============================================
    setupRealtimeSubscriptions() {
        if (!this.supplier?.id) return;
        
        try {
            // Subscribe to new inquiry matches
            const subscription = sb
                .channel('inquiries-changes')
                .on('postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'inquiry_supplier_matches',
                        filter: `supplier_id=eq.${this.supplier.id}`
                    },
                    payload => {
                        console.log('New inquiry match:', payload);
                        this.loadInquiries().then(() => {
                            this.renderStats();
                            this.renderInquiries();
                            this.showToast('New inquiry received!', 'info');
                        });
                    }
                )
                .subscribe();
            
            this.subscriptions.push(subscription);
            
        } catch (error) {
            console.error('Error setting up realtime:', error);
        }
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Menu toggle
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                document.getElementById('mobileSidebar')?.classList.add('open');
                document.getElementById('sidebarBackdrop')?.classList.add('show');
            });
        }
        
        const closeSidebar = document.getElementById('closeSidebar');
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                document.getElementById('mobileSidebar')?.classList.remove('open');
                document.getElementById('sidebarBackdrop')?.classList.remove('show');
            });
        }
        
        const backdrop = document.getElementById('sidebarBackdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                document.getElementById('mobileSidebar')?.classList.remove('open');
                backdrop.classList.remove('show');
            });
        }
        
        // Search
        const searchToggle = document.getElementById('searchToggle');
        if (searchToggle) {
            searchToggle.addEventListener('click', () => {
                document.getElementById('searchBar')?.classList.toggle('show');
                setTimeout(() => {
                    document.getElementById('searchInquiryInput')?.focus();
                }, 300);
            });
        }
        
        const searchClose = document.getElementById('searchClose');
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                document.getElementById('searchBar')?.classList.remove('show');
            });
        }
        
        const searchInput = document.getElementById('searchInquiryInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value.trim();
                this.currentPage = 1;
                this.renderInquiries();
            });
        }
        
        // Filter toggle
        const filterToggle = document.getElementById('filterToggleBtn');
        if (filterToggle) {
            filterToggle.addEventListener('click', () => {
                document.getElementById('filterBar')?.classList.toggle('show');
            });
        }
        
        // Filter changes
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.currentPage = 1;
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                });
            });
        }
        
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => {
                this.filters.date = e.target.value;
                this.currentPage = 1;
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                });
            });
        }
        
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.filters.sort = e.target.value;
                this.currentPage = 1;
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                });
            });
        }
        
        // Clear filters
        const clearFilters = document.getElementById('clearFiltersBtn');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                document.getElementById('statusFilter').value = 'all';
                document.getElementById('dateFilter').value = 'all';
                document.getElementById('sortFilter').value = 'newest';
                document.getElementById('searchInquiryInput').value = '';
                this.filters = { status: 'all', date: 'all', sort: 'newest', search: '' };
                this.currentPage = 1;
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                });
            });
        }
        
        // Pagination
        const prevPage = document.getElementById('prevPage');
        if (prevPage) {
            prevPage.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderInquiries();
                }
            });
        }
        
        const nextPage = document.getElementById('nextPage');
        if (nextPage) {
            nextPage.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredInquiries.length / this.pageSize);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderInquiries();
                }
            });
        }
        
        // Refresh
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('spinning');
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                    refreshBtn.classList.remove('spinning');
                    this.showToast('Refreshed successfully', 'success');
                }).catch(() => {
                    refreshBtn.classList.remove('spinning');
                });
            });
        }
        
        // Stat cards filter
        document.querySelectorAll('.stat-card').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.dataset.status;
                document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                
                if (status === 'all') {
                    document.getElementById('statusFilter').value = 'all';
                } else {
                    document.getElementById('statusFilter').value = status;
                }
                
                this.filters.status = status;
                this.currentPage = 1;
                this.loadInquiries().then(() => {
                    this.renderStats();
                    this.renderInquiries();
                });
            });
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', () => {
                const modal = el.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });
        
        // Reply modal - send as quote toggle
        const sendAsQuote = document.getElementById('sendAsQuote');
        if (sendAsQuote) {
            sendAsQuote.addEventListener('change', (e) => {
                const quoteFields = document.getElementById('quoteFields');
                const replyBtn = document.getElementById('replySendBtn');
                
                if (e.target.checked) {
                    quoteFields.style.display = 'block';
                    replyBtn.innerHTML = '<i class="fas fa-file-invoice"></i> Send Quote';
                } else {
                    quoteFields.style.display = 'none';
                    replyBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reply';
                }
            });
        }
        
        // Reply modal - send button
        const replySendBtn = document.getElementById('replySendBtn');
        if (replySendBtn) {
            replySendBtn.addEventListener('click', () => this.sendReply());
        }
        
        // Reply modal - cancel
        const replyCancelBtn = document.getElementById('replyCancelBtn');
        if (replyCancelBtn) {
            replyCancelBtn.addEventListener('click', () => {
                this.closeModal('replyModal');
            });
        }
        
        // Character counter
        const replyMessage = document.getElementById('replyMessage');
        if (replyMessage) {
            replyMessage.addEventListener('input', () => this.updateCharCount());
        }
        
        // Close modals on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.show').forEach(modal => {
                    this.closeModal(modal.id);
                });
                document.getElementById('mobileSidebar')?.classList.remove('open');
                document.getElementById('searchBar')?.classList.remove('show');
                document.getElementById('sidebarBackdrop')?.classList.remove('show');
            }
        });
        
        // FAB menu
        const fabMain = document.getElementById('fabMain');
        if (fabMain) {
            fabMain.addEventListener('click', () => {
                document.querySelector('.fab-menu')?.classList.toggle('open');
            });
        }
        
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await sb.auth.signOut();
                window.location.href = 'index.html';
            });
        }
        
        const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
        if (mobileLogoutBtn) {
            mobileLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await sb.auth.signOut();
                window.location.href = 'index.html';
            });
        }
    }
};

// ============================================
// MAKE GLOBALLY AVAILABLE
// ============================================
window.SupplierInquiries = SupplierInquiries;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierInquiries.init();
});