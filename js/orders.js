// ============================================
// ORDERS MANAGEMENT - BUYER SIDE
// ============================================

console.log('🚀 Orders page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let OrdersManager = {
    currentUser: null,
    orders: [],
    filteredOrders: [],
    currentOrder: null,
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentTab: 'all',
    selectedFiles: [],
    filters: {
        status: [],
        payment: 'all',
        dateRange: 'all',
        search: ''
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Orders page initializing...');
        
        try {
            await this.checkAuth();
            await this.loadOrders();
            this.setupEventListeners();
            
            console.log('✅ Orders page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading orders', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=orders.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    // ============================================
    // LOAD ORDERS
    // ============================================
    async loadOrders(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('ordersList').innerHTML = '';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('loadMore').style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('orders')
                .select(`
                    *,
                    supplier:suppliers!orders_supplier_id_fkey (
                        id,
                        business_name,
                        verification_status,
                        profiles!suppliers_profile_id_fkey (
                            avatar_url,
                            location
                        )
                    ),
                    order_items (*),
                    delivery_tracking (*)
                `)
                .eq('buyer_id', this.currentUser.id)
                .order('created_at', { ascending: false });
            
            // Apply tab filter
            if (this.currentTab !== 'all') {
                query = query.eq('status', this.currentTab);
            }
            
            // Apply status filters
            if (this.filters.status.length > 0) {
                query = query.in('status', this.filters.status);
            }
            
            // Apply payment filter
            if (this.filters.payment !== 'all') {
                query = query.eq('payment_status', this.filters.payment);
            }
            
            // Apply search
            if (this.filters.search) {
                query = query.or(`order_number.ilike.%${this.filters.search}%,supplier.business_name.ilike.%${this.filters.search}%`);
            }
            
            // Apply date range
            if (this.filters.dateRange !== 'all') {
                const now = new Date();
                let startDate = new Date();
                
                switch(this.filters.dateRange) {
                    case 'today':
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        startDate.setDate(now.getDate() - 7);
                        break;
                    case 'month':
                        startDate.setMonth(now.getMonth() - 1);
                        break;
                    case '3months':
                        startDate.setMonth(now.getMonth() - 3);
                        break;
                }
                
                query = query.gte('created_at', startDate.toISOString());
            }
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.orders = data || [];
            } else {
                this.orders = [...this.orders, ...(data || [])];
            }
            
            this.filteredOrders = [...this.orders];
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            this.updateStats();
            this.renderOrders();
            
            document.getElementById('loadingState').style.display = 'none';
            
            if (this.filteredOrders.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
            } else {
                document.getElementById('loadMore').style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading orders:', error);
            this.showToast('Error loading orders', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // UPDATE STATS
    // ============================================
    updateStats() {
        const total = this.orders.length;
        const pending = this.orders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length;
        const processing = this.orders.filter(o => o.status === 'processing').length;
        const shipped = this.orders.filter(o => o.status === 'shipped').length;
        const delivered = this.orders.filter(o => o.status === 'delivered').length;
        
        document.getElementById('totalOrders').textContent = total;
        document.getElementById('pendingOrders').textContent = pending;
        document.getElementById('processingOrders').textContent = processing;
        document.getElementById('shippedOrders').textContent = shipped;
        document.getElementById('deliveredOrders').textContent = delivered;
    },
    
    // ============================================
    // RENDER ORDERS
    // ============================================
    renderOrders() {
        const container = document.getElementById('ordersList');
        if (!container) return;
        
        if (this.filteredOrders.length === 0) return;
        
        container.innerHTML = this.filteredOrders.map(order => this.renderOrderCard(order)).join('');
    },
    
    renderOrderCard(order) {
        const supplier = order.supplier || {};
        const profile = supplier.profiles || {};
        const supplierName = supplier.business_name || 'Supplier';
        const supplierInitials = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const items = order.order_items || [];
        const previewItems = items.slice(0, 2);
        const hasMore = items.length > 2;
        const tracking = order.delivery_tracking?.[0];
        
        // Format date
        const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        // Determine status badge class
        const statusClass = this.getStatusClass(order.status);
        const statusText = this.formatStatus(order.status);
        
        return `
            <div class="order-card ${order.status}" data-order-id="${order.id}" onclick="OrdersManager.viewOrderDetails(${order.id})">
                <div class="order-header">
                    <div class="order-info">
                        <h3>${order.order_number || 'Order'}</h3>
                        <div class="order-number">${orderDate}</div>
                    </div>
                    <span class="order-badge ${statusClass}">${statusText}</span>
                </div>
                
                <div class="supplier-info">
                    <div class="supplier-avatar">
                        ${profile.avatar_url ? 
                            `<img src="${profile.avatar_url}" alt="${supplierName}">` : 
                            supplierInitials
                        }
                    </div>
                    <div class="supplier-details">
                        <div class="supplier-name">${this.escapeHtml(supplierName)}</div>
                        <div class="supplier-meta">
                            <span><i class="fas fa-map-marker-alt"></i> ${profile.location || 'Uganda'}</span>
                            ${supplier.verification_status === 'verified' ? 
                                '<span><i class="fas fa-check-circle" style="color: var(--secondary);"></i> Verified</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <div class="items-preview">
                    <div class="preview-header">
                        <span>Items (${items.length})</span>
                        <span>Total: UGX ${this.formatNumber(order.total_amount)}</span>
                    </div>
                    ${previewItems.map(item => `
                        <div class="preview-item">
                            <span class="item-name">${this.escapeHtml(item.product_title)}</span>
                            <span class="item-qty">x${item.quantity}</span>
                            <span class="item-price">UGX ${this.formatNumber(item.unit_price)}</span>
                        </div>
                    `).join('')}
                    ${hasMore ? `
                        <div class="preview-item" style="justify-content: center; color: var(--gray-500);">
                            +${items.length - 2} more items
                        </div>
                    ` : ''}
                </div>
                
                ${tracking && order.status === 'shipped' ? `
                    <div class="tracking-info">
                        <div class="tracking-number">📦 ${order.tracking_number || 'Tracking available'}</div>
                        <div class="tracking-carrier">${order.carrier || 'Carrier'} • Est: ${order.estimated_delivery ? new Date(order.estimated_delivery).toLocaleDateString() : 'TBD'}</div>
                        <a href="#" class="tracking-link" onclick="event.stopPropagation(); OrdersManager.trackOrder(${order.id})">
                            <i class="fas fa-map-marker-alt"></i> Track Package
                        </a>
                    </div>
                ` : ''}
                
                <div class="order-footer">
                    <div>
                        <div class="order-total">UGX ${this.formatNumber(order.total_amount)} 
                            <small>${order.payment_status === 'paid' ? '✓ Paid' : '⏳ Pending'}</small>
                        </div>
                        <div class="order-date"><i class="far fa-clock"></i> ${orderDate}</div>
                    </div>
                    <div class="order-actions" onclick="event.stopPropagation()">
                        ${order.status === 'pending' || order.status === 'pending_payment' ? `
                            <button class="action-btn pay" onclick="OrdersManager.showPaymentModal(${order.id})" title="Make Payment">
                                <i class="fas fa-credit-card"></i>
                            </button>
                        ` : ''}
                        ${order.status === 'shipped' ? `
                            <button class="action-btn track" onclick="OrdersManager.trackOrder(${order.id})" title="Track Order">
                                <i class="fas fa-map-marker-alt"></i>
                            </button>
                        ` : ''}
                        ${order.status === 'delivered' ? `
                            <button class="action-btn" onclick="OrdersManager.showRateModal(${order.id})" title="Rate Order">
                                <i class="fas fa-star"></i>
                            </button>
                        ` : ''}
                        ${['pending', 'pending_payment'].includes(order.status) ? `
                            <button class="action-btn cancel" onclick="OrdersManager.showCancelModal(${order.id})" title="Cancel Order">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn" onclick="OrdersManager.viewOrderDetails(${order.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    getStatusClass(status) {
        const statusMap = {
            'pending': 'pending',
            'pending_payment': 'pending',
            'confirmed': 'processing',
            'processing': 'processing',
            'shipped': 'shipped',
            'delivered': 'delivered',
            'cancelled': 'cancelled',
            'disputed': 'cancelled'
        };
        return statusMap[status] || 'pending';
    },
    
    formatStatus(status) {
        const statusMap = {
            'pending': 'Pending',
            'pending_payment': 'Awaiting Payment',
            'confirmed': 'Confirmed',
            'processing': 'Processing',
            'shipped': 'Shipped',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled',
            'disputed': 'Disputed'
        };
        return statusMap[status] || status;
    },
    
    // ============================================
    // VIEW ORDER DETAILS
    // ============================================
    async viewOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.currentOrder = order;
        
        const supplier = order.supplier || {};
        const profile = supplier.profiles || {};
        const items = order.order_items || [];
        const tracking = order.delivery_tracking || [];
        
        const modalBody = document.getElementById('orderModalBody');
        const modalFooter = document.getElementById('orderModalFooter');
        
        modalBody.innerHTML = `
            <div class="order-detail-section">
                <h4>Order Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Order #:</span>
                    <span class="detail-value">${order.order_number}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value"><span class="order-badge ${this.getStatusClass(order.status)}">${this.formatStatus(order.status)}</span></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${this.formatDate(order.created_at)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment:</span>
                    <span class="detail-value">${order.payment_status} via ${order.payment_method || 'N/A'}</span>
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Supplier Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${this.escapeHtml(supplier.business_name || 'Supplier')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Location:</span>
                    <span class="detail-value">${this.escapeHtml(profile.location || 'Uganda')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Contact:</span>
                    <span class="detail-value">${profile.phone || 'Not provided'}</span>
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Order Items</h4>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${this.escapeHtml(item.product_title)}</td>
                                <td>${item.quantity}</td>
                                <td>UGX ${this.formatNumber(item.unit_price)}</td>
                                <td>UGX ${this.formatNumber(item.total_price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="text-align: right; margin-top: 12px;">
                    <strong>Subtotal: UGX ${this.formatNumber(order.subtotal || order.total_amount)}</strong><br>
                    ${order.tax_amount ? `VAT: UGX ${this.formatNumber(order.tax_amount)}<br>` : ''}
                    ${order.shipping_fee ? `Shipping: UGX ${this.formatNumber(order.shipping_fee)}<br>` : ''}
                    <strong style="font-size: 16px; color: var(--primary);">Total: UGX ${this.formatNumber(order.total_amount)}</strong>
                </div>
            </div>
            
            ${order.delivery_address ? `
            <div class="order-detail-section">
                <h4>Delivery Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Address:</span>
                    <span class="detail-value">${this.escapeHtml(order.delivery_address)}</span>
                </div>
                ${order.delivery_district ? `
                <div class="detail-row">
                    <span class="detail-label">District:</span>
                    <span class="detail-value">${this.escapeHtml(order.delivery_district)}</span>
                </div>
                ` : ''}
                ${order.delivery_contact_phone ? `
                <div class="detail-row">
                    <span class="detail-label">Contact:</span>
                    <span class="detail-value">${order.delivery_contact_phone}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}
            
            ${tracking.length > 0 ? `
            <div class="order-detail-section">
                <h4>Tracking Timeline</h4>
                <div class="tracking-timeline">
                    ${tracking.map(t => `
                        <div class="timeline-event completed">
                            <div class="event-status">${t.status}</div>
                            <div class="event-location">${t.location || ''}</div>
                            <div class="event-time">${this.formatDate(t.created_at)}</div>
                            ${t.description ? `<div style="font-size: 12px; margin-top: 4px;">${t.description}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            ${order.supplier_notes ? `
            <div class="order-detail-section">
                <h4>Supplier Notes</h4>
                <p>${this.escapeHtml(order.supplier_notes)}</p>
            </div>
            ` : ''}
        `;
        
        modalFooter.innerHTML = `
            ${order.status === 'pending' || order.status === 'pending_payment' ? `
                <button class="btn-primary" onclick="OrdersManager.showPaymentModal(${order.id})">
                    <i class="fas fa-credit-card"></i> Make Payment
                </button>
            ` : ''}
            ${order.status === 'shipped' ? `
                <button class="btn-primary" onclick="OrdersManager.trackOrder(${order.id})">
                    <i class="fas fa-map-marker-alt"></i> Track Package
                </button>
            ` : ''}
            ${order.status === 'delivered' ? `
                <button class="btn-primary" onclick="OrdersManager.showRateModal(${order.id})">
                    <i class="fas fa-star"></i> Rate Order
                </button>
            ` : ''}
            <button class="btn-secondary" onclick="OrdersManager.closeOrderModal()">Close</button>
        `;
        
        document.getElementById('orderModal').classList.add('show');
    },
    
    // ============================================
    // TRACK ORDER
    // ============================================
    trackOrder(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        if (order.tracking_url) {
            window.open(order.tracking_url, '_blank');
        } else if (order.tracking_number) {
            window.open(`https://www.google.com/search?q=${order.tracking_number}`, '_blank');
        } else {
            this.showToast('No tracking information available', 'info');
        }
    },
    
    // ============================================
    // PAYMENT MODAL
    // ============================================
    showPaymentModal(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.currentOrder = order;
        
        document.getElementById('paymentOrderId').value = order.id;
        
        const summary = document.getElementById('paymentOrderSummary');
        summary.innerHTML = `
            <div class="summary-row">
                <span>Order Number:</span>
                <span>${order.order_number}</span>
            </div>
            <div class="summary-row">
                <span>Supplier:</span>
                <span>${order.supplier?.business_name || 'Supplier'}</span>
            </div>
            <div class="summary-row">
                <span>Items:</span>
                <span>${order.order_items?.length || 0} items</span>
            </div>
            <div class="summary-row total">
                <span>Total Amount:</span>
                <span>UGX ${this.formatNumber(order.total_amount)}</span>
            </div>
        `;
        
        document.getElementById('paymentModal').classList.add('show');
        
        // Setup payment method toggle
        document.getElementById('paymentMethod').addEventListener('change', (e) => {
            const mobileFields = document.getElementById('mobileMoneyFields');
            const bankFields = document.getElementById('bankFields');
            
            mobileFields.style.display = e.target.value === 'mobile_money' ? 'block' : 'none';
            bankFields.style.display = e.target.value === 'bank_transfer' ? 'block' : 'none';
        });
    },
    
    async submitPayment() {
        const orderId = document.getElementById('paymentOrderId').value;
        const paymentMethod = document.getElementById('paymentMethod').value;
        const mobileNumber = document.getElementById('mobileMoneyNumber')?.value;
        const mobileNetwork = document.getElementById('mobileMoneyNetwork')?.value;
        const bankName = document.getElementById('bankName')?.value;
        const accountNumber = document.getElementById('accountNumber')?.value;
        const transactionRef = document.getElementById('transactionRef')?.value;
        const notes = document.getElementById('paymentNotes')?.value;
        const proofFile = document.getElementById('paymentProof')?.files[0];
        
        if (!paymentMethod) {
            this.showToast('Please select a payment method', 'error');
            return;
        }
        
        try {
            let proofUrl = null;
            
            // Upload proof if provided
            if (proofFile) {
                const fileName = `payments/${orderId}/${Date.now()}_${proofFile.name}`;
                const { error: uploadError } = await sb.storage
                    .from('payment-proofs')
                    .upload(fileName, proofFile);
                    
                if (!uploadError) {
                    const { data: { publicUrl } } = sb.storage
                        .from('payment-proofs')
                        .getPublicUrl(fileName);
                    proofUrl = publicUrl;
                }
            }
            
            // Update order payment status
            const { error } = await sb
                .from('orders')
                .update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_method: paymentMethod,
                    transaction_id: transactionRef || null,
                    payment_proof_url: proofUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);
            
            if (error) throw error;
            
            // Add payment tracking
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: orderId,
                    status: 'Payment Received',
                    location: '',
                    description: `Payment received via ${paymentMethod}. ${notes || ''}`,
                    created_at: new Date().toISOString()
                });
            
            this.closePaymentModal();
            this.showToast('Payment recorded successfully', 'success');
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error processing payment:', error);
            this.showToast('Error processing payment', 'error');
        }
    },
    
    // ============================================
    // CANCEL ORDER
    // ============================================
    showCancelModal(orderId) {
        this.currentOrder = this.orders.find(o => o.id === orderId);
        document.getElementById('cancelModal').classList.add('show');
    },
    
    async confirmCancel() {
        if (!this.currentOrder) return;
        
        const reason = document.getElementById('cancelReason').value;
        const notes = document.getElementById('cancelNotes').value;
        
        if (!reason) {
            this.showToast('Please select a cancellation reason', 'error');
            return;
        }
        
        try {
            const { error } = await sb
                .from('orders')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentOrder.id);
            
            if (error) throw error;
            
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: this.currentOrder.id,
                    status: 'Cancelled',
                    location: '',
                    description: `Order cancelled. Reason: ${reason}. ${notes}`,
                    created_at: new Date().toISOString()
                });
            
            this.closeCancelModal();
            this.showToast('Order cancelled successfully', 'success');
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error cancelling order:', error);
            this.showToast('Error cancelling order', 'error');
        }
    },
    
    // ============================================
    // RATE ORDER
    // ============================================
    showRateModal(orderId) {
        this.currentOrder = this.orders.find(o => o.id === orderId);
        
        // Reset star rating
        document.querySelectorAll('.star-rating i').forEach(star => {
            star.className = 'far fa-star';
        });
        document.getElementById('ratingValue').value = '0';
        document.getElementById('rateOrderId').value = orderId;
        
        document.getElementById('rateModal').classList.add('show');
        
        // Setup star rating
        document.querySelectorAll('.star-rating i').forEach(star => {
            star.addEventListener('click', function() {
                const rating = this.dataset.rating;
                document.querySelectorAll('.star-rating i').forEach((s, index) => {
                    if (index < rating) {
                        s.className = 'fas fa-star';
                    } else {
                        s.className = 'far fa-star';
                    }
                });
                document.getElementById('ratingValue').value = rating;
            });
        });
    },
    
    async submitRating() {
        const orderId = document.getElementById('rateOrderId').value;
        const rating = parseInt(document.getElementById('ratingValue').value);
        const reviewTitle = document.getElementById('reviewTitle').value;
        const reviewContent = document.getElementById('reviewContent').value;
        const qualityRating = document.getElementById('qualityRating').value;
        const deliveryRating = document.getElementById('deliveryRating').value;
        const communicationRating = document.getElementById('communicationRating').value;
        const anonymous = document.getElementById('anonymousReview').checked;
        
        if (rating === 0) {
            this.showToast('Please select a rating', 'error');
            return;
        }
        
        try {
            const { error } = await sb
                .from('reviews')
                .insert({
                    order_id: orderId,
                    reviewer_id: anonymous ? null : this.currentUser.id,
                    reviewee_id: this.currentOrder.supplier_id,
                    ad_id: null,
                    rating: rating,
                    quality_rating: parseInt(qualityRating),
                    delivery_rating: parseInt(deliveryRating),
                    communication_rating: parseInt(communicationRating),
                    title: reviewTitle || null,
                    comment: reviewContent || null,
                    is_verified_purchase: true,
                    created_at: new Date().toISOString()
                });
            
            if (error) throw error;
            
            this.closeRateModal();
            this.showToast('Thank you for your review!', 'success');
            
        } catch (error) {
            console.error('Error submitting review:', error);
            this.showToast('Error submitting review', 'error');
        }
    },
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterOrders(status) {
        this.currentTab = status;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === status);
        });
        
        this.loadOrders(true);
    },
    
    applyFilters() {
        const statusFilters = [];
        document.querySelectorAll('.status-filter:checked').forEach(cb => {
            statusFilters.push(cb.value);
        });
        
        this.filters.status = statusFilters;
        this.filters.payment = document.getElementById('paymentFilter').value;
        this.filters.dateRange = document.getElementById('dateRange').value;
        
        this.loadOrders(true);
        this.closeFilterPanel();
    },
    
    resetFilters() {
        document.querySelectorAll('.status-filter').forEach(cb => cb.checked = false);
        document.getElementById('paymentFilter').value = 'all';
        document.getElementById('dateRange').value = 'all';
        
        this.filters = {
            status: [],
            payment: 'all',
            dateRange: 'all',
            search: this.filters.search
        };
        
        this.loadOrders(true);
        this.closeFilterPanel();
    },
    
    handleSearch() {
        const searchTerm = document.getElementById('searchInput').value;
        this.filters.search = searchTerm;
        this.loadOrders(true);
    },
    
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    
    closeFilterPanel() {
        document.getElementById('filterPanel').style.display = 'none';
    },
    
    loadMoreOrders() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadOrders(false);
    },
    
    // ============================================
    // FILE UPLOAD
    // ============================================
    setupFileUpload() {
        const uploadArea = document.getElementById('paymentProofUpload');
        const fileInput = document.getElementById('paymentProof');
        
        if (!uploadArea || !fileInput) return;
        
        uploadArea.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileList = document.getElementById('paymentFileList');
                fileList.innerHTML = `
                    <div class="file-item">
                        <i class="fas fa-file"></i>
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
                        <i class="fas fa-times remove-file" onclick="OrdersManager.removePaymentFile()"></i>
                    </div>
                `;
            }
        });
    },
    
    removePaymentFile() {
        document.getElementById('paymentFileList').innerHTML = '';
        document.getElementById('paymentProof').value = '';
    },
    
    // ============================================
    // MODAL CLOSE FUNCTIONS
    // ============================================
    closeOrderModal() {
        document.getElementById('orderModal').classList.remove('show');
    },
    
    closePaymentModal() {
        document.getElementById('paymentModal').classList.remove('show');
        document.getElementById('paymentForm').reset();
        document.getElementById('paymentFileList').innerHTML = '';
    },
    
    closeTrackingModal() {
        document.getElementById('trackingModal').classList.remove('show');
    },
    
    closeCancelModal() {
        document.getElementById('cancelModal').classList.remove('show');
        document.getElementById('cancelReason').value = '';
        document.getElementById('cancelNotes').value = '';
    },
    
    closeRateModal() {
        document.getElementById('rateModal').classList.remove('show');
        document.getElementById('rateForm').reset();
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
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
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
                this.filterOrders(tab);
            });
        });
        
        // Payment method toggle
        document.getElementById('paymentMethod').addEventListener('change', (e) => {
            const mobileFields = document.getElementById('mobileMoneyFields');
            const bankFields = document.getElementById('bankFields');
            
            mobileFields.style.display = e.target.value === 'mobile_money' ? 'block' : 'none';
            bankFields.style.display = e.target.value === 'bank_transfer' ? 'block' : 'none';
        });
        
        // File upload
        this.setupFileUpload();
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeOrderModal();
                    this.closePaymentModal();
                    this.closeTrackingModal();
                    this.closeCancelModal();
                    this.closeRateModal();
                    this.closeSuccessModal();
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    OrdersManager.init();
});

// Global functions
window.OrdersManager = OrdersManager;
window.filterOrders = (status) => OrdersManager.filterOrders(status);
window.loadMoreOrders = () => OrdersManager.loadMoreOrders();
window.closeOrderModal = () => OrdersManager.closeOrderModal();
window.closePaymentModal = () => OrdersManager.closePaymentModal();
window.closeTrackingModal = () => OrdersManager.closeTrackingModal();
window.closeCancelModal = () => OrdersManager.closeCancelModal();
window.closeRateModal = () => OrdersManager.closeRateModal();
window.closeSuccessModal = () => OrdersManager.closeSuccessModal();
window.submitPayment = () => OrdersManager.submitPayment();
window.confirmCancel = () => OrdersManager.confirmCancel();
window.submitRating = () => OrdersManager.submitRating();
window.removePaymentFile = () => OrdersManager.removePaymentFile();