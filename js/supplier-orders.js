// ============================================
// SUPPLIER ORDERS MANAGEMENT
// ============================================

console.log('🚀 Supplier Orders loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierOrders = {
    currentUser: null,
    supplier: null,
    orders: [],
    filteredOrders: [],
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentOrder: null,
    filters: {
        status: [],
        dateRange: 'all',
        payment: 'all',
        search: ''
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Orders initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadOrders();
            this.setupEventListeners();
            
            console.log('✅ Supplier Orders initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading orders', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-orders.html';
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
    
    async loadOrders(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
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
                    buyer:profiles!orders_buyer_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        phone,
                        email
                    ),
                    order_items (*),
                    delivery_tracking (*)
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
            
            // Apply status filter
            if (this.filters.status.length > 0) {
                query = query.in('status', this.filters.status);
            }
            
            // Apply payment filter
            if (this.filters.payment !== 'all') {
                query = query.eq('payment_status', this.filters.payment);
            }
            
            // Apply search
            if (this.filters.search) {
                query = query.or(`order_number.ilike.%${this.filters.search}%,buyer.business_name.ilike.%${this.filters.search}%`);
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
                }
                
                if (this.filters.dateRange !== 'all') {
                    query = query.gte('created_at', startDate.toISOString());
                }
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
        const pending = this.orders.filter(o => o.status === 'pending').length;
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
        
        if (this.filteredOrders.length === 0) {
            return;
        }
        
        container.innerHTML = this.filteredOrders.map(order => this.renderOrderCard(order)).join('');
    },
    
    renderOrderCard(order) {
        const buyer = order.buyer || {};
        const buyerName = buyer.business_name || buyer.full_name || 'Buyer';
        const buyerInitials = buyerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const items = order.order_items || [];
        const totalItems = items.length;
        const previewItems = items.slice(0, 2);
        const hasMore = items.length > 2;
        const tracking = order.delivery_tracking?.[0];
        
        // Format date
        const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        return `
            <div class="order-card ${order.status}" data-order-id="${order.id}">
                <div class="order-header">
                    <div class="order-info">
                        <h3>Order #${order.order_number}</h3>
                        <div class="order-number">${orderDate}</div>
                    </div>
                    <span class="order-badge ${order.status}">${this.formatStatus(order.status)}</span>
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
                        <div class="buyer-contact">
                            ${buyer.phone ? `<span><i class="fas fa-phone"></i> ${buyer.phone}</span>` : ''}
                            ${buyer.email ? `<span><i class="fas fa-envelope"></i> ${buyer.email}</span>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="order-items-preview">
                    <div class="preview-header">
                        <span>Items (${totalItems})</span>
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
                        <div class="view-all-items">
                            <a href="#" class="view-all-link" onclick="event.preventDefault(); SupplierOrders.viewOrderDetails(${order.id})">
                                +${items.length - 2} more items
                            </a>
                        </div>
                    ` : ''}
                </div>
                
                <div class="order-footer">
                    <div class="order-total">UGX ${this.formatNumber(order.total_amount)}</div>
                    <div class="order-actions">
                        ${order.status === 'pending' ? `
                            <button class="action-btn" onclick="SupplierOrders.showStatusModal(${order.id})" title="Update Status">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${order.status === 'processing' ? `
                            <button class="action-btn shipped" onclick="SupplierOrders.showTrackingModal(${order.id})" title="Add Tracking">
                                <i class="fas fa-truck"></i>
                            </button>
                        ` : ''}
                        ${order.status === 'shipped' ? `
                            <button class="action-btn delivered" onclick="SupplierOrders.showDeliveredModal(${order.id})" title="Mark Delivered">
                                <i class="fas fa-check-circle"></i>
                            </button>
                        ` : ''}
                        ${tracking ? `
                            <button class="action-btn tracking" onclick="SupplierOrders.showTracking(${order.id})" title="Track Package">
                                <i class="fas fa-map-marker-alt"></i>
                            </button>
                        ` : ''}
                        ${['pending', 'processing'].includes(order.status) ? `
                            <button class="action-btn cancel" onclick="SupplierOrders.showCancelModal(${order.id})" title="Cancel Order">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn" onclick="SupplierOrders.viewOrderDetails(${order.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // ORDER DETAILS
    // ============================================
    async viewOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.currentOrder = order;
        
        const buyer = order.buyer || {};
        const buyerName = buyer.business_name || buyer.full_name || 'Buyer';
        const items = order.order_items || [];
        const tracking = order.delivery_tracking || [];
        
        const modalBody = document.getElementById('orderModalBody');
        
        modalBody.innerHTML = `
            <div class="order-detail-section">
                <h4>Order Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Order #:</span>
                    <span class="detail-value">${order.order_number}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value"><span class="order-badge ${order.status}">${this.formatStatus(order.status)}</span></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${this.formatDate(order.created_at)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment:</span>
                    <span class="detail-value">${this.formatPaymentStatus(order.payment_status)} via ${order.payment_method || 'N/A'}</span>
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Buyer Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${this.escapeHtml(buyerName)}</span>
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
                <div class="detail-row">
                    <span class="detail-label">Delivery:</span>
                    <span class="detail-value">${order.delivery_address || 'Not specified'}</span>
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Order Items</h4>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Price</th>
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
                    <strong>Total: UGX ${this.formatNumber(order.total_amount)}</strong>
                </div>
            </div>
            
            ${tracking.length > 0 ? `
            <div class="order-detail-section">
                <h4>Tracking Information</h4>
                ${tracking.map(t => `
                    <div class="tracking-info">
                        <div class="tracking-number">📦 ${t.status}</div>
                        <div class="tracking-carrier">${t.location || ''}</div>
                        <div class="tracking-carrier">${this.formatDate(t.created_at)}</div>
                        ${t.description ? `<p style="margin-top: 4px;">${t.description}</p>` : ''}
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            ${order.supplier_notes ? `
            <div class="order-detail-section">
                <h4>Notes</h4>
                <p>${this.escapeHtml(order.supplier_notes)}</p>
            </div>
            ` : ''}
        `;
        
        document.getElementById('orderModal').classList.add('show');
    },
    
    // ============================================
    // STATUS MANAGEMENT
    // ============================================
    showStatusModal(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.currentOrder = order;
        document.getElementById('statusOrderId').value = order.id;
        document.getElementById('orderStatus').value = order.status;
        document.getElementById('trackingFields').style.display = 'none';
        
        document.getElementById('statusModal').classList.add('show');
        
        // Show tracking fields if status is shipped
        document.getElementById('orderStatus').addEventListener('change', (e) => {
            document.getElementById('trackingFields').style.display = 
                e.target.value === 'shipped' ? 'block' : 'none';
        });
    },
    
    async updateOrderStatus(event) {
        event.preventDefault();
        
        const orderId = document.getElementById('statusOrderId').value;
        const status = document.getElementById('orderStatus').value;
        const notes = document.getElementById('statusNotes').value;
        const trackingNumber = document.getElementById('trackingNumber')?.value;
        const carrier = document.getElementById('carrier')?.value;
        const estimatedDelivery = document.getElementById('estimatedDelivery')?.value;
        
        if (!status) {
            this.showToast('Please select a status', 'error');
            return;
        }
        
        try {
            const updates = {
                status: status,
                updated_at: new Date().toISOString()
            };
            
            // Add tracking if status is shipped
            if (status === 'shipped') {
                updates.tracking_number = trackingNumber;
                updates.carrier = carrier;
                updates.estimated_delivery = estimatedDelivery || null;
                updates.shipped_at = new Date().toISOString();
            }
            
            const { error } = await sb
                .from('orders')
                .update(updates)
                .eq('id', orderId);
            
            if (error) throw error;
            
            // Add delivery tracking event
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: orderId,
                    status: status,
                    location: '',
                    description: notes || `Order status updated to ${status}`,
                    created_at: new Date().toISOString()
                });
            
            this.showToast(`Order status updated to ${status}`, 'success');
            this.closeStatusModal();
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error updating order:', error);
            this.showToast('Error updating order status', 'error');
        }
    },
    
    // ============================================
    // TRACKING MANAGEMENT
    // ============================================
    showTrackingModal(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.currentOrder = order;
        document.getElementById('trackingOrderId').value = order.id;
        
        // Pre-fill if exists
        document.getElementById('trackingNumberInput').value = order.tracking_number || '';
        document.getElementById('carrierSelect').value = order.carrier || '';
        
        if (order.estimated_delivery) {
            document.getElementById('estimatedDeliveryInput').value = order.estimated_delivery.split('T')[0];
        }
        
        document.getElementById('trackingModal').classList.add('show');
    },
    
    async saveTracking(event) {
        event.preventDefault();
        
        const orderId = document.getElementById('trackingOrderId').value;
        const trackingNumber = document.getElementById('trackingNumberInput').value;
        const carrier = document.getElementById('carrierSelect').value;
        const estimatedDelivery = document.getElementById('estimatedDeliveryInput').value;
        
        if (!trackingNumber) {
            this.showToast('Please enter tracking number', 'error');
            return;
        }
        
        try {
            const { error } = await sb
                .from('orders')
                .update({
                    tracking_number: trackingNumber,
                    carrier: carrier,
                    estimated_delivery: estimatedDelivery || null,
                    status: 'shipped',
                    shipped_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);
            
            if (error) throw error;
            
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: orderId,
                    status: 'shipped',
                    location: '',
                    description: `Tracking number: ${trackingNumber}${carrier ? ` via ${carrier}` : ''}`,
                    created_at: new Date().toISOString()
                });
            
            this.showToast('Tracking information saved', 'success');
            this.closeTrackingModal();
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error saving tracking:', error);
            this.showToast('Error saving tracking', 'error');
        }
    },
    
    // ============================================
    // DELIVERY CONFIRMATION
    // ============================================
    showDeliveredModal(orderId) {
        this.currentOrder = this.orders.find(o => o.id === orderId);
        document.getElementById('deliveredModal').classList.add('show');
    },
    
    async confirmDelivered() {
        if (!this.currentOrder) return;
        
        const notes = document.getElementById('deliveryNotes').value;
        
        try {
            const { error } = await sb
                .from('orders')
                .update({
                    status: 'delivered',
                    delivered_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentOrder.id);
            
            if (error) throw error;
            
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: this.currentOrder.id,
                    status: 'delivered',
                    location: '',
                    description: notes || 'Order delivered successfully',
                    created_at: new Date().toISOString()
                });
            
            this.showToast('Order marked as delivered', 'success');
            this.closeDeliveredModal();
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error marking as delivered:', error);
            this.showToast('Error updating order', 'error');
        }
    },
    
    // ============================================
    // ORDER CANCELLATION
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
                    status: 'cancelled',
                    location: '',
                    description: `Order cancelled. Reason: ${reason}. ${notes}`,
                    created_at: new Date().toISOString()
                });
            
            this.showToast('Order cancelled', 'success');
            this.closeCancelModal();
            await this.loadOrders(true);
            
        } catch (error) {
            console.error('Error cancelling order:', error);
            this.showToast('Error cancelling order', 'error');
        }
    },
    
    // ============================================
    // TRACKING DISPLAY
    // ============================================
    showTracking(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order || !order.tracking_number) return;
        
        const trackingUrl = order.tracking_url || `https://www.google.com/search?q=${order.tracking_number}`;
        window.open(trackingUrl, '_blank');
    },
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    filterOrders(status) {
        // Update active stat
        document.querySelectorAll('.stat-item').forEach(item => {
            item.style.background = '';
            item.style.color = '';
        });
        
        if (status === 'all') {
            this.filters.status = [];
        } else {
            this.filters.status = [status];
        }
        
        this.loadOrders(true);
    },
    
    applyFilters() {
        // Get selected statuses
        const statusFilters = [];
        document.querySelectorAll('.status-filter:checked').forEach(cb => {
            statusFilters.push(cb.value);
        });
        
        this.filters.status = statusFilters;
        this.filters.dateRange = document.getElementById('dateRange').value;
        this.filters.payment = document.getElementById('paymentFilter').value;
        
        this.loadOrders(true);
        this.closeFilterPanel();
    },
    
    resetFilters() {
        document.querySelectorAll('.status-filter').forEach(cb => cb.checked = false);
        document.getElementById('dateRange').value = 'all';
        document.getElementById('paymentFilter').value = 'all';
        
        this.filters = {
            status: [],
            dateRange: 'all',
            payment: 'all',
            search: this.filters.search
        };
        
        this.loadOrders(true);
        this.closeFilterPanel();
    },
    
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    
    closeFilterPanel() {
        document.getElementById('filterPanel').style.display = 'none';
    },
    
    // ============================================
    // SEARCH
    // ============================================
    handleSearch() {
        const searchTerm = document.getElementById('searchInput').value;
        this.filters.search = searchTerm;
        this.loadOrders(true);
    },
    
    // ============================================
    // LOAD MORE
    // ============================================
    loadMoreOrders() {
        if (!this.hasMore || this.isLoading) return;
        
        this.currentPage++;
        this.loadOrders(false);
    },
    
    // ============================================
    // MODAL CLOSE FUNCTIONS
    // ============================================
    closeOrderModal() {
        document.getElementById('orderModal').classList.remove('show');
    },
    
    closeStatusModal() {
        document.getElementById('statusModal').classList.remove('show');
        document.getElementById('statusForm').reset();
    },
    
    closeTrackingModal() {
        document.getElementById('trackingModal').classList.remove('show');
        document.getElementById('trackingForm').reset();
    },
    
    closeDeliveredModal() {
        document.getElementById('deliveredModal').classList.remove('show');
        document.getElementById('deliveryNotes').value = '';
    },
    
    closeCancelModal() {
        document.getElementById('cancelModal').classList.remove('show');
        document.getElementById('cancelReason').value = '';
        document.getElementById('cancelNotes').value = '';
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    formatStatus(status) {
        const statusMap = {
            'pending': 'Pending',
            'confirmed': 'Confirmed',
            'processing': 'Processing',
            'shipped': 'Shipped',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled',
            'disputed': 'Disputed'
        };
        return statusMap[status] || status;
    },
    
    formatPaymentStatus(status) {
        const statusMap = {
            'pending': 'Pending',
            'paid': 'Paid',
            'failed': 'Failed',
            'refunded': 'Refunded'
        };
        return statusMap[status] || status;
    },
    
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
        
        // Status form submit
        document.getElementById('statusForm').addEventListener('submit', (e) => {
            this.updateOrderStatus(e);
        });
        
        // Tracking form submit
        document.getElementById('trackingForm').addEventListener('submit', (e) => {
            this.saveTracking(e);
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            // You can implement a sidebar menu here if needed
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeOrderModal();
                    this.closeStatusModal();
                    this.closeTrackingModal();
                    this.closeDeliveredModal();
                    this.closeCancelModal();
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierOrders.init();
});

// Global functions
window.SupplierOrders = SupplierOrders;
window.filterOrders = (status) => SupplierOrders.filterOrders(status);
window.loadMoreOrders = () => SupplierOrders.loadMoreOrders();
window.closeOrderModal = () => SupplierOrders.closeOrderModal();
window.closeStatusModal = () => SupplierOrders.closeStatusModal();
window.closeTrackingModal = () => SupplierOrders.closeTrackingModal();
window.closeDeliveredModal = () => SupplierOrders.closeDeliveredModal();
window.closeCancelModal = () => SupplierOrders.closeCancelModal();