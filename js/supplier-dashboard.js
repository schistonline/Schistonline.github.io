// ============================================
// SUPPLIER DASHBOARD - SIMPLIFIED
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
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Supplier Dashboard initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadStats();
            
            this.renderSupplierInfo();
            this.updateCurrentDate();
            
            this.setupEventListeners();
            
            // Hide loading state
            const loadingState = document.getElementById('loadingState');
            if (loadingState) {
                loadingState.style.display = 'none';
            }
            
            console.log('✅ Supplier Dashboard initialized');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading dashboard', 'error');
        }
    },
    
    // ============================================
    // CHECK AUTHENTICATION
    // ============================================
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
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    // ============================================
    // LOAD SUPPLIER
    // ============================================
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
            
            // Load custom store URL
            await this.loadShopUrl();
            
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
        }
    },
    
    // ============================================
    // LOAD STATS
    // ============================================
    async loadStats() {
        try {
            if (!this.supplier?.id) return;
            
            // Get total products
            const { count: totalProducts } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id)
                .eq('status', 'active');
            
            // Get total inquiries
            const { count: totalInquiries } = await sb
                .from('inquiry_supplier_matches')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id);
            
            // Get total quotations
            const { count: totalQuotes } = await sb
                .from('supplier_quotes')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id);
            
            // Get total contacts
            const { count: totalContacts } = await sb
                .from('supplier_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('supplier_id', this.supplier.id);
            
            // Update DOM
            document.getElementById('totalProducts').textContent = totalProducts || 0;
            document.getElementById('totalInquiries').textContent = totalInquiries || 0;
            document.getElementById('totalQuotes').textContent = totalQuotes || 0;
            document.getElementById('totalContacts').textContent = totalContacts || 0;
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },
    
    // ============================================
    // LOAD SHOP URL
    // ============================================
    async loadShopUrl() {
        try {
            const urlDisplay = document.getElementById('shopUrlDisplay');
            if (!urlDisplay) return;
            
            let slug = this.supplier.shop_slug;
            
            if (!slug) {
                // Generate slug from business name
                slug = this.supplier.business_name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .substring(0, 50);
                
                // Save the generated slug
                const { error: updateError } = await sb
                    .from('suppliers')
                    .update({ shop_slug: slug })
                    .eq('id', this.supplier.id);
                
                if (updateError) {
                    console.error('Error saving slug:', updateError);
                }
            }
            
            const shopUrl = `${window.location.origin}/${slug}`;
            urlDisplay.textContent = shopUrl;
            
            // Setup copy button
            const copyBtn = document.getElementById('copyUrlBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(shopUrl);
                    this.showToast('Store URL copied to clipboard!', 'success');
                };
            }
            
        } catch (error) {
            console.error('Error loading shop URL:', error);
        }
    },
    
    // ============================================
    // RENDER SUPPLIER INFO
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
                statusEl.textContent = '🟢 Active now';
            } else if (hoursAgo < 24) {
                statusEl.textContent = `Active ${hoursAgo}h ago`;
            } else {
                statusEl.textContent = `Last active ${Math.floor(hoursAgo / 24)}d ago`;
            }
        }
    },
    
    // ============================================
    // UPDATE CURRENT DATE
    // ============================================
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
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
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
        toast.className = `toast ${type} show`;
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
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
            });
        }
        
        const closeSidebar = document.getElementById('closeSidebar');
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                document.getElementById('mobileSidebar')?.classList.remove('open');
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
        
        // Close sidebar on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('mobileSidebar')?.classList.remove('open');
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierDashboard.init();
});

// Make globally available
window.SupplierDashboard = SupplierDashboard;