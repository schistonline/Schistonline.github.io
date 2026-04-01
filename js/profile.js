// ============================================
// PROFILE PAGE - SOURCEX (All Account Types)
// ============================================

console.log('🚀 Profile page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// ACCOUNT TYPES DEFINITIONS
// ============================================
const ACCOUNT_TYPES = {
    regular: {
        name: 'Regular Buyer',
        icon: 'fa-user',
        color: '#6B21E5',
        table: null,
        dashboard: null,
        signupPath: null,
        badgeClass: 'buyer'
    },
    supplier: {
        name: 'Supplier',
        icon: 'fa-store',
        color: '#10B981',
        table: 'suppliers',
        foreignKey: 'profile_id',
        dashboard: 'supplier-dashboard.html',
        signupPath: 'become-supplier.html',
        badgeClass: 'supplier'
    },
    poultry: {
        name: 'Poultry Supplier',
        icon: 'fa-dove',
        color: '#F59E0B',
        table: 'poultry_suppliers',
        foreignKey: 'profile_id',
        dashboard: 'poultry-dashboard.html',
        signupPath: 'become-poultry-supplier.html',
        badgeClass: 'poultry'
    },
    logistics: {
        name: 'Logistics Partner',
        icon: 'fa-truck',
        color: '#EF4444',
        table: 'logistics_providers',
        foreignKey: 'profile_id',
        dashboard: 'logistics-dashboard.html',
        signupPath: 'become-logistics-partner.html',
        badgeClass: 'logistics'
    },
    admin: {
        name: 'Administrator',
        icon: 'fa-crown',
        color: '#8B5CF6',
        table: null,
        foreignKey: null,
        dashboard: 'admin-dashboard.html',
        signupPath: null,
        badgeClass: 'admin'
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================
const ProfileManager = {
    currentUser: null,
    profile: null,
    activeAccounts: {}, // Stores which account types are active
    accountData: {}, // Stores data for each account type
    activities: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Profile page initializing...');
        
        try {
            await this.checkAuth();
            await this.loadProfile();
            await this.loadAllAccounts();
            await this.loadStats();
            await this.loadActivities();
            
            this.renderProfile();
            this.renderAccountTypes();
            this.renderDashboard();
            this.renderAvailableAccounts();
            this.setupEventListeners();
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('profileContent').style.display = 'block';
            
            console.log('✅ Profile page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=profile.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            
            this.profile = data;
            console.log('✅ Profile loaded:', this.profile);
            
        } catch (error) {
            console.error('Error loading profile:', error);
            throw error;
        }
    },
    
    async loadAllAccounts() {
        // Check each account type
        for (const [type, config] of Object.entries(ACCOUNT_TYPES)) {
            if (config.table) {
                await this.checkAccountType(type, config);
            }
        }
        
        // Check if user is admin
        if (this.profile?.is_admin) {
            this.activeAccounts.admin = {
                type: 'admin',
                data: { is_admin: true }
            };
        }
        
        console.log('✅ Active accounts:', Object.keys(this.activeAccounts));
    },
    
    async checkAccountType(type, config) {
        try {
            const { data, error } = await sb
                .from(config.table)
                .select('*')
                .eq(config.foreignKey, this.currentUser.id)
                .maybeSingle();
            
            if (error) throw error;
            
            if (data) {
                this.activeAccounts[type] = {
                    type: type,
                    data: data,
                    config: config
                };
                this.accountData[type] = data;
            }
            
        } catch (error) {
            console.error(`Error checking ${type} account:`, error);
        }
    },
    
    async loadStats() {
        try {
            // Inquiries count (common for all)
            const { count: inquiriesCount } = await sb
                .from('inquiry_requests')
                .select('*', { count: 'exact', head: true })
                .eq('buyer_id', this.currentUser.id);
            document.getElementById('profileInquiries').textContent = inquiriesCount || 0;
            
            // Products count (if supplier)
            if (this.activeAccounts.supplier) {
                const { count } = await sb
                    .from('ads')
                    .select('*', { count: 'exact', head: true })
                    .eq('seller_id', this.activeAccounts.supplier.data.profile_id)
                    .eq('status', 'active');
                document.getElementById('profileProducts').textContent = count || 0;
            } else {
                document.getElementById('profileProducts').textContent = '0';
            }
            
            // Listings count (poultry batches)
            if (this.activeAccounts.poultry) {
                const { count } = await sb
                    .from('poultry_batches')
                    .select('*', { count: 'exact', head: true })
                    .eq('supplier_id', this.activeAccounts.poultry.data.id)
                    .in('status', ['available', 'distributing']);
                document.getElementById('profileListings').textContent = count || 0;
            } else {
                document.getElementById('profileListings').textContent = '0';
            }
            
            // Unread messages
            const { count: messagesCount } = await sb
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', this.currentUser.id)
                .eq('is_read', false);
            document.getElementById('messageBadge').textContent = messagesCount || 0;
            
            // Notifications
            const { count: notificationsCount } = await sb
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.currentUser.id)
                .eq('is_read', false);
            document.getElementById('notificationBadge').textContent = notificationsCount || 0;
            
            // Saved items
            const { count: savedCount } = await sb
                .from('saved_ads')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.currentUser.id);
            document.getElementById('savedBadge').textContent = savedCount || 0;
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },
    
    async loadActivities() {
        try {
            const activities = [];
            
            // Get recent inquiries
            const { data: inquiries } = await sb
                .from('inquiry_requests')
                .select('title, status, created_at')
                .eq('buyer_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(5);
            
            inquiries?.forEach(inquiry => {
                activities.push({
                    type: 'inquiry',
                    title: inquiry.title,
                    status: inquiry.status,
                    time: inquiry.created_at,
                    icon: 'fa-file-invoice'
                });
            });
            
            activities.sort((a, b) => new Date(b.time) - new Date(a.time));
            this.activities = activities.slice(0, 5);
            this.renderActivities();
            
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderProfile() {
        this.renderProfileHeader();
    },
    
    renderProfileHeader() {
        const name = this.profile.full_name || 'User';
        const email = this.profile.email || this.currentUser.email;
        const avatarUrl = this.profile.avatar_url;
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        document.getElementById('profileAvatar').innerHTML = avatarUrl ? 
            `<img src="${avatarUrl}" alt="${name}">` : initials;
        
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = email;
        
        const created = new Date(this.profile.created_at || Date.now());
        document.getElementById('memberSince').textContent = created.getFullYear();
        
        // Badges for all active account types
        const badgesContainer = document.getElementById('profileBadges');
        let badgesHtml = '';
        
        if (this.profile.is_verified) {
            badgesHtml += '<span class="badge verified"><i class="fas fa-check-circle"></i> Verified</span>';
        }
        
        // Add badge for each active account
        for (const [type, account] of Object.entries(this.activeAccounts)) {
            const config = ACCOUNT_TYPES[type];
            if (config) {
                badgesHtml += `<span class="badge ${config.badgeClass}"><i class="fas ${config.icon}"></i> ${config.name}</span>`;
            }
        }
        
        if (this.profile.is_buyer && !this.activeAccounts.supplier && !this.activeAccounts.poultry && !this.activeAccounts.logistics) {
            badgesHtml += '<span class="badge buyer"><i class="fas fa-shopping-cart"></i> Buyer</span>';
        }
        
        badgesContainer.innerHTML = badgesHtml;
    },
    
    renderAccountTypes() {
        const container = document.getElementById('accountTypesGrid');
        if (!container) return;
        
        const activeTypes = Object.values(this.activeAccounts);
        
        if (activeTypes.length === 0) {
            container.innerHTML = '<p class="text-muted">No active account types</p>';
            return;
        }
        
        container.innerHTML = activeTypes.map(account => {
            const config = ACCOUNT_TYPES[account.type];
            
            return `
                <div class="account-type-card" data-type="${account.type}">
                    <div class="account-icon" style="background: ${config.color}20; color: ${config.color};">
                        <i class="fas ${config.icon}"></i>
                    </div>
                    <div class="account-info">
                        <h4>${config.name}</h4>
                        <p>${account.type === 'admin' ? 'Platform Administrator' : this.getAccountDescription(account.type)}</p>
                    </div>
                    <a href="${config.dashboard || '#'}" class="account-action-btn">
                        <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            `;
        }).join('');
    },
    
    getAccountDescription(type) {
        const descriptions = {
            supplier: 'Sell products to businesses',
            poultry: 'Sell live birds to buyers',
            logistics: 'Offer delivery services',
            admin: 'Manage platform settings',
            regular: 'Browse and purchase products'
        };
        return descriptions[type] || 'Active account';
    },
    
    renderDashboard() {
        const container = document.getElementById('dashboardSection');
        if (!container) return;
        
        // Determine primary account type (priority: admin > supplier > poultry > logistics)
        let primaryType = null;
        if (this.activeAccounts.admin) primaryType = 'admin';
        else if (this.activeAccounts.supplier) primaryType = 'supplier';
        else if (this.activeAccounts.poultry) primaryType = 'poultry';
        else if (this.activeAccounts.logistics) primaryType = 'logistics';
        
        if (!primaryType) {
            container.innerHTML = `
                <div class="dashboard-placeholder">
                    <i class="fas fa-store"></i>
                    <h3>Start Selling on SourceX</h3>
                    <p>Activate a seller account to start listing products</p>
                    <div class="dashboard-actions">
                        <a href="become-supplier.html" class="btn-primary">Become a Supplier</a>
                        <a href="become-poultry-supplier.html" class="btn-outline">Become a Poultry Supplier</a>
                        <a href="become-logistics-partner.html" class="btn-outline">Become a Logistics Partner</a>
                    </div>
                </div>
            `;
            return;
        }
        
        // Render dashboard based on primary type
        const config = ACCOUNT_TYPES[primaryType];
        const accountData = this.activeAccounts[primaryType]?.data;
        
        container.innerHTML = `
            <div class="dashboard-header">
                <h3><i class="fas ${config.icon}"></i> ${config.name} Dashboard</h3>
                <a href="${config.dashboard}" class="view-all">View Full Dashboard <i class="fas fa-arrow-right"></i></a>
            </div>
            <div class="dashboard-stats" id="dashboardStats">
                <!-- Stats loaded dynamically -->
            </div>
            <div class="dashboard-actions">
                ${this.getDashboardActions(primaryType)}
            </div>
            <div class="recent-list" id="dashboardRecent">
                <!-- Recent items loaded dynamically -->
            </div>
        `;
        
        // Load dashboard specific data
        this.loadDashboardData(primaryType, accountData);
    },
    
    async loadDashboardData(type, data) {
        const statsContainer = document.getElementById('dashboardStats');
        const recentContainer = document.getElementById('dashboardRecent');
        
        if (!statsContainer || !recentContainer) return;
        
        switch(type) {
            case 'supplier':
                await this.loadSupplierDashboard(data, statsContainer, recentContainer);
                break;
            case 'poultry':
                await this.loadPoultryDashboard(data, statsContainer, recentContainer);
                break;
            case 'logistics':
                await this.loadLogisticsDashboard(data, statsContainer, recentContainer);
                break;
            case 'admin':
                await this.loadAdminDashboard(data, statsContainer, recentContainer);
                break;
        }
    },
    
    async loadSupplierDashboard(data, statsContainer, recentContainer) {
        // Stats
        const { count: products } = await sb
            .from('ads')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', data.profile_id)
            .eq('status', 'active');
        
        const { count: orders } = await sb
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('supplier_id', data.id);
        
        statsContainer.innerHTML = `
            <div class="stat-card mini">
                <span class="stat-value">${products || 0}</span>
                <span class="stat-label">Products</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${orders || 0}</span>
                <span class="stat-label">Orders</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${data.completion_rate || 100}%</span>
                <span class="stat-label">Completion</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${data.response_time_hours || 2}h</span>
                <span class="stat-label">Response</span>
            </div>
        `;
        
        // Recent orders
        const { data: recentOrders } = await sb
            .from('orders')
            .select('order_number, total_amount, status, created_at')
            .eq('supplier_id', data.id)
            .order('created_at', { ascending: false })
            .limit(3);
        
        recentContainer.innerHTML = `
            <h4>Recent Orders</h4>
            ${recentOrders?.length ? recentOrders.map(order => `
                <div class="list-item">
                    <div class="list-item-icon supplier">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-title">${order.order_number}</div>
                        <div class="list-item-subtitle">UGX ${order.total_amount?.toLocaleString() || 0}</div>
                    </div>
                    <div class="list-item-badge">${order.status}</div>
                </div>
            `).join('') : '<p class="text-muted">No recent orders</p>'}
        `;
    },
    
    async loadPoultryDashboard(data, statsContainer, recentContainer) {
        const { count: batches } = await sb
            .from('poultry_batches')
            .select('*', { count: 'exact', head: true })
            .eq('supplier_id', data.id)
            .in('status', ['available', 'distributing']);
        
        const { count: bookings } = await sb
            .from('poultry_bookings')
            .select('*', { count: 'exact', head: true })
            .eq('supplier_id', data.id);
        
        statsContainer.innerHTML = `
            <div class="stat-card mini">
                <span class="stat-value">${batches || 0}</span>
                <span class="stat-label">Active Batches</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${bookings || 0}</span>
                <span class="stat-label">Bookings</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${data.avg_rating || 0}</span>
                <span class="stat-label">Rating</span>
            </div>
        `;
        
        const { data: recentBookings } = await sb
            .from('poultry_bookings')
            .select('booking_number, buyer_name, quantity, booking_status, created_at')
            .eq('supplier_id', data.id)
            .order('created_at', { ascending: false })
            .limit(3);
        
        recentContainer.innerHTML = `
            <h4>Recent Bookings</h4>
            ${recentBookings?.length ? recentBookings.map(booking => `
                <div class="list-item">
                    <div class="list-item-icon poultry">
                        <i class="fas fa-calendar-check"></i>
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-title">${booking.buyer_name}</div>
                        <div class="list-item-subtitle">${booking.quantity} birds</div>
                    </div>
                    <div class="list-item-badge">${booking.booking_status}</div>
                </div>
            `).join('') : '<p class="text-muted">No recent bookings</p>'}
        `;
    },
    
    async loadLogisticsDashboard(data, statsContainer, recentContainer) {
        const { count: shipments } = await sb
            .from('shipment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', data.id);
        
        const { count: active } = await sb
            .from('shipment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', data.id)
            .in('status', ['accepted', 'in_transit']);
        
        statsContainer.innerHTML = `
            <div class="stat-card mini">
                <span class="stat-value">${active || 0}</span>
                <span class="stat-label">Active</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${shipments || 0}</span>
                <span class="stat-label">Total Shipments</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${data.commission_rate || 0}%</span>
                <span class="stat-label">Commission</span>
            </div>
        `;
        
        const { data: recentRequests } = await sb
            .from('shipment_requests')
            .select('request_number, origin_location, destination_location, status, created_at')
            .eq('provider_id', data.id)
            .order('created_at', { ascending: false })
            .limit(3);
        
        recentContainer.innerHTML = `
            <h4>Recent Requests</h4>
            ${recentRequests?.length ? recentRequests.map(request => `
                <div class="list-item">
                    <div class="list-item-icon logistics">
                        <i class="fas fa-box"></i>
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-title">${request.request_number}</div>
                        <div class="list-item-subtitle">${request.origin_location} → ${request.destination_location}</div>
                    </div>
                    <div class="list-item-badge">${request.status}</div>
                </div>
            `).join('') : '<p class="text-muted">No recent requests</p>'}
        `;
    },
    
    async loadAdminDashboard(data, statsContainer, recentContainer) {
        const { count: users } = await sb
            .from('profiles')
            .select('*', { count: 'exact', head: true });
        
        const { count: products } = await sb
            .from('ads')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        
        statsContainer.innerHTML = `
            <div class="stat-card mini">
                <span class="stat-value">${users || 0}</span>
                <span class="stat-label">Users</span>
            </div>
            <div class="stat-card mini">
                <span class="stat-value">${products || 0}</span>
                <span class="stat-label">Products</span>
            </div>
        `;
        
        recentContainer.innerHTML = `
            <h4>Quick Actions</h4>
            <div class="admin-quick-actions">
                <a href="admin-users.html" class="admin-action">Manage Users</a>
                <a href="admin-products.html" class="admin-action">Manage Products</a>
                <a href="admin-reports.html" class="admin-action">View Reports</a>
            </div>
        `;
    },
    
    getDashboardActions(type) {
        const actions = {
            supplier: `
                <a href="add-product.html" class="quick-action-btn"><i class="fas fa-plus"></i><span>Add Product</span></a>
                <a href="my-products.html" class="quick-action-btn"><i class="fas fa-box"></i><span>My Products</span></a>
                <a href="orders.html" class="quick-action-btn"><i class="fas fa-truck"></i><span>Orders</span></a>
                <a href="supplier-analytics.html" class="quick-action-btn"><i class="fas fa-chart-line"></i><span>Analytics</span></a>
            `,
            poultry: `
                <a href="poultry-batch-create.html" class="quick-action-btn"><i class="fas fa-plus"></i><span>New Batch</span></a>
                <a href="poultry-bookings.html" class="quick-action-btn"><i class="fas fa-calendar-check"></i><span>Bookings</span></a>
                <a href="poultry-inquiries.html" class="quick-action-btn"><i class="fas fa-question"></i><span>Inquiries</span></a>
                <a href="poultry-analytics.html" class="quick-action-btn"><i class="fas fa-chart-line"></i><span>Analytics</span></a>
            `,
            logistics: `
                <a href="shipment-requests.html" class="quick-action-btn"><i class="fas fa-clipboard-list"></i><span>Requests</span></a>
                <a href="active-shipments.html" class="quick-action-btn"><i class="fas fa-truck"></i><span>Active</span></a>
                <a href="delivery-history.html" class="quick-action-btn"><i class="fas fa-history"></i><span>History</span></a>
                <a href="logistics-settings.html" class="quick-action-btn"><i class="fas fa-cog"></i><span>Settings</span></a>
            `,
            admin: `
                <a href="admin-dashboard.html" class="quick-action-btn"><i class="fas fa-tachometer-alt"></i><span>Dashboard</span></a>
                <a href="admin-users.html" class="quick-action-btn"><i class="fas fa-users"></i><span>Users</span></a>
                <a href="admin-products.html" class="quick-action-btn"><i class="fas fa-box"></i><span>Products</span></a>
                <a href="admin-settings.html" class="quick-action-btn"><i class="fas fa-cog"></i><span>Settings</span></a>
            `
        };
        return actions[type] || '';
    },
    
    renderAvailableAccounts() {
        const container = document.getElementById('availableAccountsGrid');
        if (!container) return;
        
        const available = [];
        
        for (const [type, config] of Object.entries(ACCOUNT_TYPES)) {
            if (!this.activeAccounts[type] && config.signupPath && type !== 'admin') {
                available.push({ type, config });
            }
        }
        
        if (available.length === 0) {
            container.innerHTML = '<p class="text-muted">You have all available account types</p>';
            return;
        }
        
        container.innerHTML = available.map(({ type, config }) => `
            <div class="available-card" data-type="${type}">
                <div class="available-icon" style="background: ${config.color}20; color: ${config.color};">
                    <i class="fas ${config.icon}"></i>
                </div>
                <div class="available-info">
                    <h4>${config.name}</h4>
                    <p>${this.getAccountDescription(type)}</p>
                </div>
                <a href="${config.signupPath}" class="available-btn">
                    Activate <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        `).join('');
    },
    
    renderActivities() {
        const container = document.getElementById('activityList');
        
        if (this.activities.length === 0) {
            container.innerHTML = '<p class="text-muted">No recent activity</p>';
            return;
        }
        
        container.innerHTML = this.activities.map(activity => {
            const timeAgo = this.getTimeAgo(new Date(activity.time));
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${activity.icon}"></i>
                    </div>
                    <div class="activity-details">
                        <div class="activity-title">${this.escapeHtml(activity.title)}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
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
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    },
    
    async logout() {
        await sb.auth.signOut();
        window.location.href = 'index.html';
    },
    
    showDeleteModal() {
        document.getElementById('deleteModal').classList.add('show');
        const confirmInput = document.getElementById('deleteConfirm');
        const deleteBtn = document.getElementById('confirmDeleteBtn');
        confirmInput.addEventListener('input', (e) => {
            deleteBtn.disabled = e.target.value !== 'DELETE';
        });
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        document.getElementById('deleteConfirm').value = '';
        document.getElementById('confirmDeleteBtn').disabled = true;
    },
    
    async confirmDelete() {
        try {
            await sb.from('profiles').delete().eq('id', this.currentUser.id);
            await sb.auth.signOut();
            this.showToast('Account deleted', 'success');
            setTimeout(() => window.location.href = 'index.html', 1500);
        } catch (error) {
            this.showToast('Error deleting account', 'error');
            this.closeDeleteModal();
        }
    },
    
    setupEventListeners() {
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            window.location.href = 'edit-profile.html';
        });
        
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });
        
        document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
            this.showDeleteModal();
        });
        
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
            this.confirmDelete();
        });
        
        document.getElementById('deleteModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('deleteModal')) this.closeDeleteModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeDeleteModal();
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    ProfileManager.init();
});

window.ProfileManager = ProfileManager;
window.closeDeleteModal = () => ProfileManager.closeDeleteModal();