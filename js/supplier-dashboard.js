// ============================================
// SUPPLIER DASHBOARD - COMPLETE PROFESSIONAL
// ============================================

console.log('🚀 Supplier Dashboard loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase client
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierDashboard = {
    currentUser: null,
    supplier: null,
    announcements: [],
    tips: [],
    activities: [],
    performanceChart: null,
    swiperInstances: [],
    chartPeriod: 'month',
    cache: new Map(),
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    subscriptions: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Dashboard initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            
            // Load data in parallel for better performance
            await Promise.all([
                this.loadAnnouncements(),
                this.loadTips(),
                this.loadKPIData(),
                this.loadActivities()
            ]);
            
            this.renderSupplierInfo();
            this.renderAnnouncements();
            this.renderTips();
            this.renderActivities();
            this.initCharts();
            
            this.setupEventListeners();
            this.setupRealtimeSubscriptions();
            this.setupAccessibility();
            this.checkOnlineStatus();
            
            // Small delay before initializing Swiper to ensure DOM is ready
            setTimeout(() => this.initSwiper(), 100);
            this.updateCurrentDate();
            
            // Hide loading state
            const loadingState = document.getElementById('loadingState');
            if (loadingState) {
                loadingState.style.display = 'none';
            }
            
            console.log('✅ Supplier Dashboard initialized');
        } catch (error) {
            this.logError(error, 'init');
            this.showToast('Error loading dashboard', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-dashboard.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            this.logError(error, 'checkAuth');
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
            this.logError(error, 'loadSupplier');
            this.showToast('Error loading supplier data', 'error');
        }
    },
    
    async loadAnnouncements() {
        try {
            const { data, error } = await sb
                .from('admin_announcements')
                .select('*')
                .eq('is_active', true)
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (error) throw error;
            
            this.announcements = data || [];
            console.log(`✅ Loaded ${this.announcements.length} announcements`);
            
        } catch (error) {
            console.error('Error loading announcements:', error);
            // Fallback announcements
            this.announcements = [
                {
                    id: 1,
                    title: 'Welcome to iBlue B2B',
                    message: 'Complete your profile to start selling',
                    link: '/supplier-company-profile.html',
                    link_text: 'Update Now'
                },
                {
                    id: 2,
                    title: 'New Feature: Spotlights',
                    message: 'Get your products featured on homepage',
                    link: '/supplier-spotlights.html',
                    link_text: 'Learn More'
                }
            ];
        }
    },
    
    async loadTips() {
        try {
            const { data, error } = await sb
                .from('supplier_tips')
                .select('*')
                .eq('supplier_id', this.supplier?.id)
                .eq('is_published', true)
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (error) throw error;
            
            this.tips = data || [];
            console.log(`✅ Loaded ${this.tips.length} tips`);
            
        } catch (error) {
            console.error('Error loading tips:', error);
            // Fallback tips
            this.tips = [
                {
                    id: 1,
                    title: 'How to Get More Inquiries',
                    excerpt: 'Optimize your product descriptions and respond quickly',
                    category: 'selling'
                },
                {
                    id: 2,
                    title: 'Pricing Strategies That Work',
                    excerpt: 'Learn how to price your products competitively',
                    category: 'selling'
                }
            ];
        }
    },
    
    async loadKPIData() {
        try {
            if (!this.supplier?.id) return;
            
            // Get pending orders count
            const { count: pendingOrders } = await sb
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id)
                .in('status', ['pending', 'pending_payment']);
            
            // Get pending quotes count (sent but not responded)
            const { count: pendingQuotes } = await sb
                .from('supplier_quotes')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id)
                .eq('status', 'sent');
            
            // Get new inquiries count
            const { count: newInquiries } = await sb
                .from('inquiry_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'sent');
            
            // Get total products count
            const { count: totalProducts } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id)
                .eq('status', 'active');
            
            // Update DOM
            const pendingOrdersEl = document.getElementById('pendingOrders');
            const pendingQuotesEl = document.getElementById('pendingQuotes');
            const newInquiriesEl = document.getElementById('newInquiries');
            const totalProductsEl = document.getElementById('totalProducts');
            
            if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders || 0;
            if (pendingQuotesEl) pendingQuotesEl.textContent = pendingQuotes || 0;
            if (newInquiriesEl) newInquiriesEl.textContent = newInquiries || 0;
            if (totalProductsEl) totalProductsEl.textContent = totalProducts || 0;
            
        } catch (error) {
            this.logError(error, 'loadKPIData');
        }
    },
    
    async loadActivities() {
        try {
            if (!this.supplier?.id) return;
            
            const activities = [];
            
            // Get recent orders
            const { data: orders } = await sb
                .from('orders')
                .select('order_number, status, created_at, total_amount')
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false })
                .limit(3);
            
            orders?.forEach(order => {
                activities.push({
                    type: 'order',
                    title: `New order #${order.order_number}`,
                    status: order.status,
                    time: order.created_at,
                    amount: order.total_amount,
                    icon: 'fa-clipboard-list'
                });
            });
            
            // Get recent quotes
            const { data: quotes } = await sb
                .from('supplier_quotes')
                .select('quote_number, status, created_at, total_amount')
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false })
                .limit(3);
            
            quotes?.forEach(quote => {
                activities.push({
                    type: 'quote',
                    title: `Quote ${quote.quote_number || 'sent'}`,
                    status: quote.status,
                    time: quote.created_at,
                    amount: quote.total_amount,
                    icon: 'fa-file-invoice'
                });
            });
            
            // Get recent inquiries
            const { data: inquiries } = await sb
                .from('inquiry_requests')
                .select('title, status, created_at')
                .order('created_at', { ascending: false })
                .limit(3);
            
            inquiries?.forEach(inquiry => {
                activities.push({
                    type: 'inquiry',
                    title: inquiry.title,
                    status: inquiry.status,
                    time: inquiry.created_at,
                    icon: 'fa-search'
                });
            });
            
            // Sort by date (newest first)
            activities.sort((a, b) => new Date(b.time) - new Date(a.time));
            
            this.activities = activities.slice(0, 10);
            
        } catch (error) {
            this.logError(error, 'loadActivities');
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderSupplierInfo() {
        const profile = this.supplier?.profile || {};
        const name = this.supplier?.business_name || 'Supplier';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        // Sidebar supplier info
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
        
        // Mobile sidebar supplier info
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
        
        // Welcome message
        const supplierNameEl = document.getElementById('supplierName');
        if (supplierNameEl) {
            supplierNameEl.textContent = name.split(' ')[0];
        }
        
        // Status
        const statusEl = document.getElementById('supplierStatus');
        if (statusEl) {
            const lastActive = profile.last_active ? new Date(profile.last_active) : new Date();
            const hoursAgo = Math.floor((Date.now() - lastActive) / (1000 * 60 * 60));
            
            if (hoursAgo < 1) {
                statusEl.textContent = 'Active now';
            } else if (hoursAgo < 24) {
                statusEl.textContent = `Active ${hoursAgo} hours ago`;
            } else {
                statusEl.textContent = `Last active ${Math.floor(hoursAgo / 24)} days ago`;
            }
        }
    },
    
    renderAnnouncements() {
        const wrapper = document.getElementById('announcementWrapper');
        if (!wrapper) return;
        
        if (this.announcements.length === 0) {
            wrapper.innerHTML = `
                <div class="swiper-slide">
                    <div class="announcement-slide">
                        <div class="announcement-content">
                            <div class="announcement-icon">
                                <i class="fas fa-bullhorn"></i>
                            </div>
                            <div class="announcement-text">No announcements at this time</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        
        wrapper.innerHTML = this.announcements.map(announcement => `
            <div class="swiper-slide">
                <div class="announcement-slide">
                    <div class="announcement-content">
                        <div class="announcement-icon">
                            <i class="fas fa-bullhorn"></i>
                        </div>
                        <div class="announcement-text">
                            <strong>${this.escapeHtml(announcement.title)}:</strong> ${this.escapeHtml(announcement.message)}
                        </div>
                        ${announcement.link ? `
                            <a href="${announcement.link}" class="announcement-link">${announcement.link_text || 'Learn More'}</a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    renderTips() {
        const wrapper = document.getElementById('tipsWrapper');
        if (!wrapper) return;
        
        if (this.tips.length === 0) {
            wrapper.innerHTML = `
                <div class="swiper-slide">
                    <div class="tip-card" style="background: linear-gradient(135deg, var(--gray-600), var(--gray-700));">
                        <span class="tip-category">Tip</span>
                        <h3 class="tip-title">No tips yet</h3>
                        <p class="tip-excerpt">Create your first tip to share with buyers</p>
                    </div>
                </div>
            `;
            return;
        }
        
        wrapper.innerHTML = this.tips.map(tip => `
            <div class="swiper-slide">
                <div class="tip-card" onclick="location.href='supplier-tips.html?id=${tip.id}'">
                    <span class="tip-category">${tip.category || 'General'}</span>
                    <h3 class="tip-title">${this.escapeHtml(tip.title)}</h3>
                    <p class="tip-excerpt">${this.escapeHtml(tip.excerpt || '')}</p>
                </div>
            </div>
        `).join('');
    },
    
    renderActivities() {
        const container = document.getElementById('activityList');
        if (!container) return;
        
        if (this.activities.length === 0) {
            container.innerHTML = '<p class="text-muted">No recent activity</p>';
            return;
        }
        
        container.innerHTML = this.activities.map(activity => {
            const timeAgo = this.getTimeAgo(new Date(activity.time));
            const statusClass = activity.status?.toLowerCase() || 'info';
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${this.escapeHtml(activity.title)}</div>
                        <div class="activity-meta">
                            <span>${timeAgo}</span>
                            ${activity.amount ? `<span>UGX ${this.formatNumber(activity.amount)}</span>` : ''}
                            <span class="activity-status ${statusClass}">${activity.status || ''}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    initCharts() {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart if it exists
        if (this.performanceChart) {
            this.performanceChart.destroy();
        }
        
        // Generate mock data based on period
        const data = this.generateChartData();
        
        try {
            this.performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [
                        {
                            label: 'Orders',
                            data: data.orders,
                            borderColor: '#0B4F6C',
                            backgroundColor: 'rgba(11, 79, 108, 0.1)',
                            tension: 0.4,
                            fill: true,
                            borderWidth: 2,
                            pointBackgroundColor: '#0B4F6C',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        },
                        {
                            label: 'Revenue (UGX 100k)',
                            data: data.revenue,
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true,
                            borderWidth: 2,
                            pointBackgroundColor: '#10B981',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                boxWidth: 12,
                                font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
                                color: '#4B5563'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'white',
                            titleColor: '#111827',
                            bodyColor: '#4B5563',
                            borderColor: '#E5E7EB',
                            borderWidth: 1,
                            padding: 12,
                            boxPadding: 6,
                            usePointStyle: true,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y;
                                        if (context.dataset.label.includes('Revenue')) {
                                            label += 'k UGX';
                                        }
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { 
                                display: true,
                                color: '#F3F4F6',
                                drawBorder: false
                            },
                            ticks: { 
                                font: { size: 10, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
                                color: '#9CA3AF',
                                stepSize: 50,
                                callback: function(value) {
                                    return value + 'k';
                                }
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { 
                                font: { size: 10, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
                                color: '#9CA3AF'
                            }
                        }
                    }
                }
            });
        } catch (error) {
            this.logError(error, 'initCharts');
        }
    },
    
    generateChartData() {
        const now = new Date();
        let labels = [];
        let orders = [];
        let revenue = [];
        
        switch(this.chartPeriod) {
            case 'week':
                // Last 7 days
                for (let i = 6; i >= 0; i--) {
                    const date = new Date(now);
                    date.setDate(date.getDate() - i);
                    labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                    orders.push(Math.floor(Math.random() * 10) + 1);
                    revenue.push(Math.floor(Math.random() * 50) + 10);
                }
                break;
                
            case 'month':
                // Last 4 weeks
                for (let i = 3; i >= 0; i--) {
                    const date = new Date(now);
                    date.setDate(date.getDate() - (i * 7));
                    labels.push(`Week ${4-i}`);
                    orders.push(Math.floor(Math.random() * 30) + 5);
                    revenue.push(Math.floor(Math.random() * 100) + 20);
                }
                break;
                
            case 'year':
                // Last 12 months
                for (let i = 11; i >= 0; i--) {
                    const date = new Date(now);
                    date.setMonth(date.getMonth() - i);
                    labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
                    orders.push(Math.floor(Math.random() * 50) + 10);
                    revenue.push(Math.floor(Math.random() * 200) + 50);
                }
                break;
        }
        
        return { labels, orders, revenue };
    },
    
    // ============================================
    // SWIPER INITIALIZATION
    // ============================================
    initSwiper() {
        // Clean up existing Swiper instances
        this.swiperInstances.forEach(swiper => {
            if (swiper && swiper.destroy) {
                swiper.destroy(true, true);
            }
        });
        this.swiperInstances = [];
        
        // Announcement Swiper
        const announcementSwiperEl = document.querySelector('.announcement-swiper');
        if (announcementSwiperEl) {
            try {
                const announcementSwiper = new Swiper('.announcement-swiper', {
                    slidesPerView: 1,
                    spaceBetween: 0,
                    loop: this.announcements.length > 1,
                    autoplay: this.announcements.length > 1 ? {
                        delay: 5000,
                        disableOnInteraction: false
                    } : false,
                    pagination: {
                        el: '.announcement-pagination',
                        clickable: true
                    }
                });
                this.swiperInstances.push(announcementSwiper);
            } catch (error) {
                console.error('Error initializing announcement swiper:', error);
            }
        }
        
        // Tips Swiper
        const tipsSwiperEl = document.querySelector('.tips-swiper');
        if (tipsSwiperEl) {
            try {
                const tipsSwiper = new Swiper('.tips-swiper', {
                    slidesPerView: 1.2,
                    spaceBetween: 12,
                    freeMode: true,
                    loop: false,
                    pagination: {
                        el: '.tips-pagination',
                        clickable: true
                    },
                    breakpoints: {
                        480: { slidesPerView: 1.5 },
                        640: { slidesPerView: 2.2 },
                        1024: { slidesPerView: 3 }
                    }
                });
                this.swiperInstances.push(tipsSwiper);
            } catch (error) {
                console.error('Error initializing tips swiper:', error);
            }
        }
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
    
    updateCurrentDate() {
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            const now = new Date();
            dateEl.textContent = now.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    logError(error, context) {
        console.error(`❌ Error in ${context}:`, error);
        
        // You could send this to an error tracking service
        if (window.Sentry) {
            Sentry.captureException(error, {
                tags: { context },
                user: { id: this.currentUser?.id }
            });
        }
    },
    
    // ============================================
    // REAL-TIME SUBSCRIPTIONS
    // ============================================
    setupRealtimeSubscriptions() {
        if (!this.supplier?.id) return;
        
        try {
            // Listen for new orders
            const ordersSubscription = sb
                .channel('orders-changes')
                .on('postgres_changes', 
                    { 
                        event: 'INSERT', 
                        schema: 'public', 
                        table: 'orders',
                        filter: `supplier_id=eq.${this.supplier.id}`
                    }, 
                    payload => {
                        this.handleNewOrder(payload.new);
                    }
                )
                .subscribe();
            
            // Listen for new announcements
            const announcementsSubscription = sb
                .channel('announcements-changes')
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'admin_announcements' },
                    payload => {
                        this.handleNewAnnouncement(payload.new);
                    }
                )
                .subscribe();
            
            this.subscriptions = [ordersSubscription, announcementsSubscription];
            
        } catch (error) {
            this.logError(error, 'setupRealtimeSubscriptions');
        }
    },
    
    handleNewOrder(order) {
        // Update KPI counts
        this.loadKPIData();
        
        // Add to activity feed
        this.activities.unshift({
            type: 'order',
            title: `New order #${order.order_number}`,
            status: order.status,
            time: order.created_at,
            amount: order.total_amount,
            icon: 'fa-clipboard-list'
        });
        
        // Show notification
        this.showToast('New order received!', 'success');
        
        // Re-render activities (keep only 10)
        this.activities = this.activities.slice(0, 10);
        this.renderActivities();
    },
    
    handleNewAnnouncement(announcement) {
        if (!announcement.is_active) return;
        
        // Add to announcements
        this.announcements.unshift(announcement);
        this.announcements = this.announcements.slice(0, 5);
        
        // Re-render announcements
        this.renderAnnouncements();
        
        // Update Swiper
        setTimeout(() => {
            this.initSwiper();
        }, 100);
    },
    
    // ============================================
    // OFFLINE SUPPORT
    // ============================================
    checkOnlineStatus() {
        window.addEventListener('online', () => {
            this.showToast('Back online - syncing data...', 'success');
            this.refreshData();
        });
        
        window.addEventListener('offline', () => {
            this.showToast('You are offline - showing cached data', 'warning');
        });
    },
    
    async refreshData() {
        try {
            await Promise.all([
                this.loadAnnouncements(),
                this.loadTips(),
                this.loadKPIData(),
                this.loadActivities()
            ]);
            
            this.renderAnnouncements();
            this.renderTips();
            this.renderActivities();
            
            this.showToast('Data synced successfully', 'success');
        } catch (error) {
            this.logError(error, 'refreshData');
        }
    },
    
    // ============================================
    // ACCESSIBILITY
    // ============================================
    setupAccessibility() {
        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('mobileSidebar')?.classList.remove('open');
                document.querySelector('.fab-menu')?.classList.remove('open');
                document.getElementById('searchBar')?.classList.remove('show');
            }
        });
        
        // Ensure focus management for mobile sidebar
        const sidebar = document.getElementById('mobileSidebar');
        if (sidebar) {
            const focusableElements = sidebar.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            
            sidebar.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable?.focus();
                    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable?.focus();
                    }
                }
            });
        }
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Menu toggle
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('mobileSidebar')?.classList.add('open');
            });
        }
        
        const closeSidebar = document.getElementById('closeSidebar');
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                document.getElementById('mobileSidebar')?.classList.remove('open');
            });
        }
        
        // Search toggle
        const searchToggle = document.getElementById('searchToggle');
        if (searchToggle) {
            searchToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('searchBar')?.classList.toggle('show');
            });
        }
        
        const searchClose = document.getElementById('searchClose');
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                document.getElementById('searchBar')?.classList.remove('show');
            });
        }
        
        // FAB menu
        const fabMain = document.getElementById('fabMain');
        if (fabMain) {
            fabMain.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelector('.fab-menu')?.classList.toggle('open');
            });
        }
        
        // Chart period change
        const periodSelect = document.getElementById('chartPeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.chartPeriod = e.target.value;
                if (this.performanceChart) {
                    const data = this.generateChartData();
                    this.performanceChart.data.labels = data.labels;
                    this.performanceChart.data.datasets[0].data = data.orders;
                    this.performanceChart.data.datasets[1].data = data.revenue;
                    this.performanceChart.update();
                }
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
        
        // Close sidebar on outside click
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('mobileSidebar');
            const menuBtn = document.getElementById('menuToggle');
            
            if (sidebar?.classList.contains('open') && 
                !sidebar.contains(e.target) && 
                menuBtn && !menuBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
        
        // Close FAB when clicking outside
        document.addEventListener('click', (e) => {
            const fab = document.querySelector('.fab-menu');
            const fabMain = document.getElementById('fabMain');
            
            if (fab?.classList.contains('open') && 
                !fab.contains(e.target)) {
                fab.classList.remove('open');
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', this.debounce(() => {
            // Reinitialize Swiper on resize
            this.initSwiper();
            
            // Update chart if exists
            if (this.performanceChart) {
                this.performanceChart.resize();
            }
        }, 250));
        
        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.initSwiper();
                if (this.performanceChart) {
                    this.performanceChart.resize();
                }
            }, 200);
        });
    },
    
    // Debounce utility
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // ============================================
    // CLEANUP
    // ============================================
    destroy() {
        // Clean up subscriptions
        this.subscriptions.forEach(sub => {
            if (sub && sub.unsubscribe) {
                sub.unsubscribe();
            }
        });
        
        // Clean up Swiper instances
        this.swiperInstances.forEach(swiper => {
            if (swiper && swiper.destroy) {
                swiper.destroy(true, true);
            }
        });
        
        // Destroy chart
        if (this.performanceChart) {
            this.performanceChart.destroy();
        }
        
        console.log('🧹 Supplier Dashboard cleaned up');
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierDashboard.init();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    SupplierDashboard.destroy();
});

// Make globally available
window.SupplierDashboard = SupplierDashboard;