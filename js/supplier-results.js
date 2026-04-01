// ============================================
// SUPPLIER RESULTS PAGE
// ============================================

console.log('🔍 Supplier results page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// RESULTS PAGE STATE
// ============================================
const ResultsPage = {
    suppliers: [],
    currentPage: 1,
    itemsPerPage: 12,
    hasMore: true,
    isLoading: false,
    totalCount: 0,
    filters: {
        type: 'all',
        search: '',
        sort: 'recommended'
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Results page initializing...');
        
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.filters.search = urlParams.get('q') || '';
        this.filters.type = urlParams.get('filter') || 'all';
        this.filters.sort = urlParams.get('sort') || 'recommended';
        
        // Set search input value
        document.getElementById('searchInput').value = this.filters.search;
        
        // Set active filter tab
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.filter === this.filters.type) {
                tab.classList.add('active');
            }
        });
        
        // Set sort select
        document.getElementById('sortSelect').value = this.filters.sort;
        
        // Update title
        this.updateTitle();
        
        // Show active filters
        this.renderActiveFilters();
        
        // Check if filter bar should be shown on mobile
        this.checkMobileFilterBar();
        
        // Load suppliers
        await this.loadSuppliers(true);
        
        // Setup events
        this.setupEventListeners();
        
        console.log('✅ Results page initialized');
    },
    
    // ============================================
    // UPDATE TITLE BASED ON FILTERS
    // ============================================
    updateTitle() {
        const titleEl = document.getElementById('resultsTitle');
        
        if (this.filters.search) {
            titleEl.textContent = `Search: "${this.filters.search}"`;
        } else if (this.filters.type === 'verified') {
            titleEl.textContent = 'Verified Suppliers';
        } else if (this.filters.type === 'featured') {
            titleEl.textContent = 'Featured Suppliers';
        } else if (this.filters.type === 'hot') {
            titleEl.textContent = 'Hot Suppliers';
        } else {
            titleEl.textContent = 'All Suppliers';
        }
    },
    
    // ============================================
    // RENDER ACTIVE FILTERS
    // ============================================
    renderActiveFilters() {
        const container = document.getElementById('activeFilters');
        container.innerHTML = '';
        
        if (this.filters.search) {
            container.innerHTML += `
                <div class="filter-chip">
                    <span class="filter-label">Search:</span>
                    <span class="filter-value">"${this.filters.search}"</span>
                    <i class="fas fa-times" onclick="ResultsPage.removeFilter('search')"></i>
                </div>
            `;
        }
        
        if (this.filters.type !== 'all') {
            container.innerHTML += `
                <div class="filter-chip">
                    <span class="filter-label">Type:</span>
                    <span class="filter-value">${this.filters.type}</span>
                    <i class="fas fa-times" onclick="ResultsPage.removeFilter('type')"></i>
                </div>
            `;
        }
    },
    
    // ============================================
    // REMOVE SPECIFIC FILTER
    // ============================================
    removeFilter(filterType) {
        if (filterType === 'search') {
            this.filters.search = '';
            document.getElementById('searchInput').value = '';
        } else if (filterType === 'type') {
            this.filters.type = 'all';
            document.querySelectorAll('.filter-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.filter === 'all') {
                    tab.classList.add('active');
                }
            });
        }
        
        // Update URL
        this.updateURL();
        
        // Reload with new filters
        this.loadSuppliers(true);
    },
    
    // ============================================
    // CHECK MOBILE FILTER BAR
    // ============================================
    checkMobileFilterBar() {
        if (window.innerWidth < 768) {
            document.getElementById('filterBar').classList.remove('show');
        } else {
            document.getElementById('filterBar').classList.add('show');
        }
    },
    
    // ============================================
    // TOGGLE FILTER BAR ON MOBILE
    // ============================================
    toggleFilterBar() {
        const filterBar = document.getElementById('filterBar');
        const filterBtn = document.getElementById('filterToggleBtn');
        
        filterBar.classList.toggle('show');
        filterBtn.classList.toggle('active');
    },
    
    // ============================================
    // UPDATE URL WITH CURRENT FILTERS
    // ============================================
    updateURL() {
        const url = new URL(window.location);
        
        if (this.filters.search) {
            url.searchParams.set('q', this.filters.search);
        } else {
            url.searchParams.delete('q');
        }
        
        if (this.filters.type !== 'all') {
            url.searchParams.set('filter', this.filters.type);
        } else {
            url.searchParams.delete('filter');
        }
        
        if (this.filters.sort !== 'recommended') {
            url.searchParams.set('sort', this.filters.sort);
        } else {
            url.searchParams.delete('sort');
        }
        
        window.history.pushState({}, '', url);
        
        // Update title
        this.updateTitle();
        
        // Update active filters display
        this.renderActiveFilters();
    },
    
    // ============================================
    // LOAD SUPPLIERS FROM DATABASE
    // ============================================
    async loadSuppliers(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            this.showLoadingSkeletons();
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            // Build query
            let query = sb
                .from('suppliers')
                .select(`
                    id,
                    business_name,
                    business_type,
                    verification_status,
                    is_featured,
                    year_established,
                    warehouse_location,
                    warehouse_district,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        location
                    ),
                    total_orders,
                    completion_rate,
                    response_time_hours
                `, { count: 'exact' });
            
            // Apply type filter
            if (this.filters.type === 'verified') {
                query = query.eq('verification_status', 'verified');
            } else if (this.filters.type === 'featured') {
                query = query.eq('is_featured', true);
            } else if (this.filters.type === 'hot') {
                query = query.eq('verification_status', 'verified')
                           .order('total_orders', { ascending: false });
            }
            
            // Apply search
            if (this.filters.search) {
                query = query.ilike('business_name', `%${this.filters.search}%`);
            }
            
            // Apply sorting
            if (this.filters.sort === 'rating') {
                query = query.order('completion_rate', { ascending: false, nullsLast: true });
            } else if (this.filters.sort === 'orders') {
                query = query.order('total_orders', { ascending: false, nullsLast: true });
            } else if (this.filters.sort === 'newest') {
                query = query.order('created_at', { ascending: false, nullsLast: true });
            } else {
                // Recommended: featured first, then by orders
                query = query.order('is_featured', { ascending: false })
                           .order('total_orders', { ascending: false, nullsLast: true });
            }
            
            const { data, error, count } = await query.range(from, to);

            if (error) throw error;

            // Get products for each supplier
            const suppliersWithProducts = await Promise.all(
                (data || []).map(async (supplier) => {
                    const products = await this.getSupplierProducts(supplier.id, 3);
                    
                    // Calculate years in business
                    const years = supplier.year_established ? 
                        `${new Date().getFullYear() - parseInt(supplier.year_established)} yrs` : '6 yrs';
                    
                    return { 
                        ...supplier, 
                        products,
                        displayStats: {
                            years,
                            staff: '20+ staff',
                            area: supplier.warehouse_location ? '2,700+ m²' : '25,000+ m²',
                            revenue: 'USh 21.1B+'
                        }
                    };
                })
            );

            if (reset) {
                this.suppliers = suppliersWithProducts;
            } else {
                this.suppliers = [...this.suppliers, ...suppliersWithProducts];
            }
            
            this.totalCount = count || 0;
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            // Update results count
            document.getElementById('resultsCount').textContent = 
                `${this.totalCount} supplier${this.totalCount !== 1 ? 's' : ''} found`;
            
            this.renderSuppliers();
            
        } catch (error) {
            console.error('❌ Error loading suppliers:', error);
            this.showError();
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // SHOW LOADING SKELETONS
    // ============================================
    showLoadingSkeletons() {
        const grid = document.getElementById('suppliersGrid');
        let skeletons = '';
        
        for (let i = 0; i < 6; i++) {
            skeletons += `
                <div class="skeleton-card">
                    <div class="skeleton-header">
                        <div class="skeleton-logo"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line" style="width: 80%;"></div>
                            <div class="skeleton-line short"></div>
                            <div class="skeleton-line" style="width: 60%;"></div>
                        </div>
                    </div>
                    <div class="skeleton-products">
                        <div class="skeleton-product"></div>
                        <div class="skeleton-product"></div>
                        <div class="skeleton-product"></div>
                    </div>
                </div>
            `;
        }
        
        grid.innerHTML = skeletons;
    },
    
    // ============================================
    // GET SUPPLIER PRODUCTS
    // ============================================
    async getSupplierProducts(supplierId, limit = 3) {
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    price,
                    wholesale_price,
                    image_urls,
                    moq
                `)
                .eq('supplier_id', supplierId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
            
        } catch (error) {
            console.error(`Error loading products for supplier ${supplierId}:`, error);
            return [];
        }
    },
    
    // ============================================
    // RENDER SUPPLIERS
    // ============================================
    renderSuppliers() {
        const grid = document.getElementById('suppliersGrid');
        
        if (this.suppliers.length === 0) {
            const template = document.getElementById('noResultsTemplate').content.cloneNode(true);
            
            // Customize message based on filters
            const messageEl = template.getElementById('noResultsMessage');
            if (this.filters.search) {
                messageEl.textContent = `No suppliers found matching "${this.filters.search}"`;
            } else if (this.filters.type !== 'all') {
                messageEl.textContent = `No ${this.filters.type} suppliers found`;
            } else {
                messageEl.textContent = 'No suppliers found';
            }
            
            grid.innerHTML = '';
            grid.appendChild(template);
            document.getElementById('loadMoreBtn').style.display = 'none';
            return;
        }
        
        grid.innerHTML = this.suppliers.map(supplier => {
            const profile = supplier.profiles || {};
            const name = supplier.business_name || 'Unnamed Supplier';
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BS';
            const stats = supplier.displayStats;
            
            return `
                <div class="supplier-card" onclick="window.location.href='supplier-detail.html?id=${supplier.id}'">
                    <div class="supplier-header-compact">
                        <div class="supplier-logo-compact">
                            ${profile.avatar_url ? 
                                `<img src="${profile.avatar_url}" alt="${name}">` : 
                                initials
                            }
                        </div>
                        <div class="supplier-info-compact">
                            <div class="supplier-name-compact">
                                ${this.escapeHtml(name)}
                                ${supplier.verification_status === 'verified' ? 
                                    '<span class="verified-badge-compact"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                            </div>
                            
                            <div class="supplier-stats-compact">
                                <span><i class="far fa-calendar-alt"></i> ${stats.years}</span>
                                <span><i class="fas fa-users"></i> ${stats.staff}</span>
                                <span><i class="fas fa-warehouse"></i> ${stats.area}</span>
                                <span><i class="fas fa-chart-line"></i> ${stats.revenue}</span>
                            </div>
                            
                            <div class="supplier-badges-compact">
                                <span class="badge-item"><i class="fas fa-check-circle"></i> 1-year warranty</span>
                                <span class="badge-item"><i class="fas fa-clock"></i> On-time delivery 100.0%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="supplier-products-compact">
                        <div class="products-row-compact">
                            ${(supplier.products || []).map(p => `
                                <a href="product.html?id=${p.id}" class="product-item-compact" onclick="event.stopPropagation()">
                                    <div class="product-image-compact">
                                        <img src="${p.image_urls?.[0] || 'https://via.placeholder.com/100'}" alt="">
                                    </div>
                                    <div class="product-price-compact">USh ${this.formatNumber(p.wholesale_price || p.price || 0)}</div>
                                    <div class="product-moq-compact">${p.moq || 1} pieces (MOQ)</div>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('loadMoreBtn').style.display = this.hasMore ? 'block' : 'none';
    },
    
    // ============================================
    // SHOW ERROR STATE
    // ============================================
    showError() {
        const grid = document.getElementById('suppliersGrid');
        const template = document.getElementById('errorTemplate').content.cloneNode(true);
        
        grid.innerHTML = '';
        grid.appendChild(template);
        document.getElementById('loadMoreBtn').style.display = 'none';
    },
    
    // ============================================
    // APPLY SEARCH
    // ============================================
    applySearch() {
        const searchInput = document.getElementById('searchInput');
        const searchTerm = searchInput.value.trim();
        
        this.filters.search = searchTerm;
        this.filters.type = 'all'; // Reset type filter when searching
        
        // Reset active tab
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.filter === 'all') {
                tab.classList.add('active');
            }
        });
        
        // Update URL and reload
        this.updateURL();
        this.loadSuppliers(true);
        
        // Hide search bar on mobile
        if (window.innerWidth < 768) {
            document.getElementById('searchBar').classList.remove('show');
        }
    },
    
    // ============================================
    // APPLY FILTERS
    // ============================================
    applyFilters() {
        this.filters.type = document.querySelector('.filter-tab.active')?.dataset.filter || 'all';
        this.filters.sort = document.getElementById('sortSelect').value;
        
        this.updateURL();
        this.loadSuppliers(true);
        
        // Hide filter bar on mobile after applying
        if (window.innerWidth < 768) {
            document.getElementById('filterBar').classList.remove('show');
            document.getElementById('filterToggleBtn').classList.remove('active');
        }
    },
    
    // ============================================
    // LOAD MORE
    // ============================================
    loadMore() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadSuppliers(false);
    },
    
    // ============================================
    // TOGGLE SEARCH BAR
    // ============================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('show');
        
        if (searchBar.classList.contains('show')) {
            document.getElementById('searchInput').focus();
        }
    },
    
    // ============================================
    // GO BACK
    // ============================================
    goBack() {
        if (document.referrer) {
            window.history.back();
        } else {
            window.location.href = 'suppliers.html';
        }
    },
    
    // ============================================
    // CLEAR ALL FILTERS
    // ============================================
    clearFilters() {
        this.filters = {
            type: 'all',
            search: '',
            sort: 'recommended'
        };
        
        // Reset UI
        document.getElementById('searchInput').value = '';
        document.getElementById('sortSelect').value = 'recommended';
        
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.filter === 'all') {
                tab.classList.add('active');
            }
        });
        
        this.updateURL();
        this.loadSuppliers(true);
    },
    
    // ============================================
    // FORMAT NUMBER WITH COMMAS
    // ============================================
    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    // ============================================
    // ESCAPE HTML
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ============================================
    // SETUP EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Back button
        document.getElementById('backBtn').addEventListener('click', () => {
            this.goBack();
        });
        
        // Search toggle
        document.getElementById('searchToggle').addEventListener('click', () => {
            this.toggleSearch();
        });
        
        document.getElementById('searchClose').addEventListener('click', () => {
            document.getElementById('searchBar').classList.remove('show');
        });
        
        // Search input - handle Enter key
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.applySearch();
            }
        });
        
        // Filter toggle for mobile
        document.getElementById('filterToggleBtn').addEventListener('click', () => {
            this.toggleFilterBar();
        });
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.applyFilters();
            });
        });
        
        // Sort select
        document.getElementById('sortSelect').addEventListener('change', () => {
            this.applyFilters();
        });
        
        // Load more
        document.getElementById('loadMoreBtn').addEventListener('click', () => {
            this.loadMore();
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            this.filters.search = urlParams.get('q') || '';
            this.filters.type = urlParams.get('filter') || 'all';
            this.filters.sort = urlParams.get('sort') || 'recommended';
            
            // Update UI
            document.getElementById('searchInput').value = this.filters.search;
            document.getElementById('sortSelect').value = this.filters.sort;
            
            document.querySelectorAll('.filter-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.filter === this.filters.type) {
                    tab.classList.add('active');
                }
            });
            
            this.updateTitle();
            this.renderActiveFilters();
            this.loadSuppliers(true);
        });
        
        // Handle resize for filter bar
        window.addEventListener('resize', () => {
            this.checkMobileFilterBar();
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    ResultsPage.init();
});

// Make functions globally available
window.ResultsPage = ResultsPage;
window.clearFilters = () => ResultsPage.clearFilters();