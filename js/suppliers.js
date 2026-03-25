// ============================================
// SUPPLIERS PAGE - SourceX
// ============================================

console.log('🚀 Suppliers page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SuppliersPage = {
    suppliers: [],
    filteredSuppliers: [],
    banners: [],
    hotSuppliers: [],
    currentPage: 1,
    itemsPerPage: 9,
    hasMore: true,
    isLoading: false,
    swiperInstances: [],
    filters: {
        type: 'all',
        search: '',
        sort: 'recommended'
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Suppliers page initializing...');
        
        try {
            // Load all data in parallel
            await Promise.all([
                this.loadBanners(),
                this.loadHotSuppliers(),
                this.loadSuppliers()
            ]);
            
            // Render everything
            this.renderBanners();
            this.renderHotSuppliers();
            this.renderSuppliers();
            
            // Setup UI and events
            this.setupEventListeners();
            this.initSwiper();
            
            console.log('✅ Suppliers page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
        }
    },
    
    // ============================================
    // LOAD BANNERS FROM DATABASE
    // ============================================
    async loadBanners() {
        try {
            const now = new Date().toISOString();
            
            const { data, error } = await sb
                .from('banners')
                .select('*')
                .eq('is_active', true)
                .lte('start_date', now)
                .gte('end_date', now)
                .order('display_order', { ascending: true });

            if (error) throw error;

            this.banners = data || [];
            console.log(`✅ Loaded ${this.banners.length} banners from database`);
            
        } catch (error) {
            console.error('❌ Error loading banners:', error);
            this.banners = [];
        }
    },
    
    // ============================================
    // LOAD HOT SUPPLIERS
    // ============================================
    async loadHotSuppliers() {
        try {
            // Get suppliers with highest ratings/orders
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    id,
                    business_name,
                    verification_status,
                    is_featured,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url
                    ),
                    total_orders,
                    completion_rate
                `)
                .eq('verification_status', 'verified')
                .order('total_orders', { ascending: false })
                .limit(10);

            if (error) throw error;

            // Get a few products for each hot supplier
            this.hotSuppliers = await Promise.all(
                (data || []).map(async (supplier) => {
                    const products = await this.getSupplierProducts(supplier.id, 3);
                    return { ...supplier, products };
                })
            );
            
            console.log(`✅ Loaded ${this.hotSuppliers.length} hot suppliers`);
            
        } catch (error) {
            console.error('❌ Error loading hot suppliers:', error);
            this.hotSuppliers = [];
        }
    },
    
    // ============================================
    // LOAD SUPPLIERS
    // ============================================
    async loadSuppliers(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            document.getElementById('suppliersGrid').innerHTML = `
                <div class="loading-grid">
                    <div class="spinner"></div>
                    <p>Loading suppliers...</p>
                </div>
            `;
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
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
                `);
            
            // Apply filters
            if (this.filters.type === 'verified') {
                query = query.eq('verification_status', 'verified');
            } else if (this.filters.type === 'featured') {
                query = query.eq('is_featured', true);
            }
            
            // Apply search
            if (this.filters.search) {
                query = query.ilike('business_name', `%${this.filters.search}%`);
            }
            
            // Apply sorting
            if (this.filters.sort === 'rating') {
                query = query.order('completion_rate', { ascending: false });
            } else if (this.filters.sort === 'orders') {
                query = query.order('total_orders', { ascending: false });
            } else if (this.filters.sort === 'newest') {
                query = query.order('created_at', { ascending: false });
            } else {
                query = query.order('is_featured', { ascending: false })
                           .order('total_orders', { ascending: false });
            }
            
            const { data, error } = await query.range(from, to);

            if (error) throw error;

            // Get products for each supplier
            const suppliersWithProducts = await Promise.all(
                (data || []).map(async (supplier) => {
                    const products = await this.getSupplierProducts(supplier.id, 3);
                    
                    // Generate some stats for display
                    const years = supplier.year_established ? 
                        `${new Date().getFullYear() - parseInt(supplier.year_established)} yrs` : '6 yrs';
                    const staff = '20+ staff';
                    const area = supplier.warehouse_location ? '2,700+ m²' : '25,000+ m²';
                    const revenue = 'USh 21.1B+';
                    
                    return { 
                        ...supplier, 
                        products,
                        displayStats: {
                            years,
                            staff,
                            area,
                            revenue
                        }
                    };
                })
            );

            if (reset) {
                this.suppliers = suppliersWithProducts;
            } else {
                this.suppliers = [...this.suppliers, ...suppliersWithProducts];
            }
            
            this.filteredSuppliers = [...this.suppliers];
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            console.log(`✅ Loaded ${this.suppliers.length} suppliers`);
            
        } catch (error) {
            console.error('❌ Error loading suppliers:', error);
        } finally {
            this.isLoading = false;
        }
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
    // RENDER BANNERS
    // ============================================
    renderBanners() {
        const wrapper = document.getElementById('bannerWrapper');
        if (!wrapper) return;
        
        if (this.banners.length === 0) {
            wrapper.innerHTML = `
                <div class="swiper-slide">
                    <a href="#" class="banner-slide">
                        <img src="https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=800" alt="Welcome to SourceX">
                        <div class="banner-content">
                            <h3>Welcome to SourceX</h3>
                            <p>Connect with verified suppliers across Africa</p>
                            <span class="banner-btn">Explore Now</span>
                        </div>
                    </a>
                </div>
                <div class="swiper-slide">
                    <a href="#" class="banner-slide">
                        <img src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=800" alt="Verified Suppliers">
                        <div class="banner-content">
                            <h3>Verified Suppliers</h3>
                            <p>100% verified businesses ready to serve you</p>
                            <span class="banner-btn">Learn More</span>
                        </div>
                    </a>
                </div>
            `;
            return;
        }
        
        wrapper.innerHTML = this.banners.map(banner => {
            let linkUrl = '#';
            if (banner.link_type === 'internal' && banner.link_value) {
                linkUrl = banner.link_value;
            } else if (banner.link_type === 'external' && banner.link_value) {
                linkUrl = banner.link_value;
            } else if (banner.link_type === 'category' && banner.link_value) {
                linkUrl = `category.html?id=${banner.link_value}`;
            } else if (banner.link_type === 'supplier' && banner.link_value) {
                linkUrl = `supplier-detail.html?id=${banner.link_value}`;
            }
            
            return `
                <div class="swiper-slide">
                    <a href="${linkUrl}" class="banner-slide">
                        <img src="${banner.image_url}" alt="${banner.title}">
                        <div class="banner-content" style="background: linear-gradient(to top, ${banner.background_color || 'rgba(0,0,0,0.8)'}, transparent); color: ${banner.text_color || '#FFFFFF'};">
                            <h3>${banner.title}</h3>
                            ${banner.description ? `<p>${banner.description}</p>` : ''}
                            ${banner.button_text ? `<span class="banner-btn">${banner.button_text}</span>` : ''}
                        </div>
                    </a>
                </div>
            `;
        }).join('');
    },
    
    // ============================================
    // RENDER HOT SUPPLIERS
    // ============================================
    renderHotSuppliers() {
        const wrapper = document.getElementById('hotSuppliersWrapper');
        if (!wrapper) return;
        
        if (this.hotSuppliers.length === 0) {
            wrapper.innerHTML = '<div class="swiper-slide">No hot suppliers yet</div>';
            return;
        }
        
        wrapper.innerHTML = this.hotSuppliers.map(supplier => {
            const profile = supplier.profiles || {};
            const name = supplier.business_name;
            const initials = name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BS';
            const rating = (supplier.completion_rate || 95) / 20;
            
            return `
                <div class="swiper-slide">
                    <div class="hot-supplier-card" onclick="window.location.href='supplier-detail.html?id=${supplier.id}'">
                        <div class="hot-supplier-avatar">
                            ${profile.avatar_url ? 
                                `<img src="${profile.avatar_url}" alt="${name}">` : 
                                initials
                            }
                        </div>
                        <h4>${name}</h4>
                        <div class="hot-supplier-rating">
                            ${this.getStars(rating)}
                            <span>(${supplier.total_orders || 0})</span>
                        </div>
                        <div class="hot-supplier-products">
                            ${(supplier.products || []).slice(0, 3).map(p => `
                                <div class="hot-product-thumb">
                                    <img src="${p.image_urls?.[0] || 'https://via.placeholder.com/30'}" alt="">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // ============================================
    // RENDER SUPPLIERS - COMPACT VERSION
    // ============================================
    renderSuppliers() {
        const grid = document.getElementById('suppliersGrid');
        if (!grid) return;
        
        if (this.filteredSuppliers.length === 0) {
            grid.innerHTML = `
                <div class="loading-grid">
                    <i class="fas fa-store" style="font-size: 48px; color: var(--gray-300); margin-bottom: 16px;"></i>
                    <p>No suppliers found</p>
                    <button class="load-more-btn" onclick="SuppliersPage.resetFilters()" style="margin-top: 16px;">Clear Filters</button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.filteredSuppliers.map(supplier => {
            const profile = supplier.profiles || {};
            const name = supplier.business_name;
            const initials = name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BS';
            const stats = supplier.displayStats || {
                years: '6 yrs',
                staff: '20+ staff',
                area: '2,700+ m²',
                revenue: 'USh 21.1B+'
            };
            
            return `
                <div class="supplier-card" onclick="window.location.href='supplier-detail.html?id=${supplier.id}'">
                    <!-- Compact Header: Logo Left, Info Right -->
                    <div class="supplier-header-compact">
                        <div class="supplier-logo-compact">
                            ${profile.avatar_url ? 
                                `<img src="${profile.avatar_url}" alt="${name}">` : 
                                initials
                            }
                        </div>
                        <div class="supplier-info-compact">
                            <div class="supplier-name-compact">
                                ${name}
                                ${supplier.verification_status === 'verified' ? 
                                    '<span class="verified-badge-compact"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                            </div>
                            
                            <!-- Stats Row -->
                            <div class="supplier-stats-compact">
                                <span><i class="far fa-calendar-alt"></i> ${stats.years}</span>
                                <span><i class="fas fa-users"></i> ${stats.staff}</span>
                                <span><i class="fas fa-warehouse"></i> ${stats.area}</span>
                                <span><i class="fas fa-chart-line"></i> ${stats.revenue}</span>
                            </div>
                            
                            <!-- Badges Row -->
                            <div class="supplier-badges-compact">
                                <span class="badge-item"><i class="fas fa-check-circle"></i> 1-year warranty</span>
                                <span class="badge-item"><i class="fas fa-clock"></i> On-time delivery 100.0%</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Products Row - 3 items -->
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
        
        // Show/hide load more button
        document.getElementById('loadMoreBtn').style.display = this.hasMore ? 'block' : 'none';
    },
    
    // ============================================
    // HELPER: Get Star Rating HTML
    // ============================================
    getStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalf = rating % 1 >= 0.5;
        let stars = '';
        
        for (let i = 0; i < 5; i++) {
            if (i < fullStars) {
                stars += '<i class="fas fa-star"></i>';
            } else if (i === fullStars && hasHalf) {
                stars += '<i class="fas fa-star-half-alt"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        
        return stars;
    },
    
    // ============================================
    // APPLY SEARCH - Redirect to results page
    // ============================================
    applySearch() {
        const searchInput = document.getElementById('searchInput');
        const searchTerm = searchInput.value.trim();
        
        if (searchTerm) {
            // Redirect to results page with search query
            window.location.href = `supplier-results.html?q=${encodeURIComponent(searchTerm)}`;
        } else {
            // If empty search, stay on current page but you could reload
            this.loadSuppliers(true);
        }
        
        // Hide search bar
        document.getElementById('searchBar').classList.remove('show');
    },
    
    // ============================================
    // TOGGLE SEARCH - Show/hide search bar
    // ============================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('show');
        
        if (searchBar.classList.contains('show')) {
            document.getElementById('searchInput').focus();
        }
    },
    
    // ============================================
    // FILTERING
    // ============================================
    applyFilters() {
        const type = document.querySelector('.filter-tab.active')?.dataset.filter || 'all';
        const sort = document.getElementById('sortSelect').value;
        
        this.filters.type = type;
        this.filters.sort = sort;
        
        this.loadSuppliers(true);
    },
    
    resetFilters() {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-filter="all"]').classList.add('active');
        document.getElementById('sortSelect').value = 'recommended';
        document.getElementById('searchInput').value = '';
        
        this.filters = {
            type: 'all',
            search: '',
            sort: 'recommended'
        };
        
        this.loadSuppliers(true);
    },
    
    // ============================================
    // LOAD MORE
    // ============================================
    loadMore() {
        if (!this.hasMore || this.isLoading) return;
        
        this.currentPage++;
        this.loadSuppliers(false).then(() => {
            this.renderSuppliers();
        });
    },
    
    // ============================================
    // INIT SWIPER
    // ============================================
    initSwiper() {
        // Destroy existing swiper instances
        this.swiperInstances.forEach(swiper => {
            if (swiper && swiper.destroy) swiper.destroy(true, true);
        });
        this.swiperInstances = [];
        
        // Banner Swiper
        const bannerSwiper = new Swiper('.banner-swiper', {
            slidesPerView: 1,
            spaceBetween: 0,
            loop: true,
            autoplay: {
                delay: 5000,
                disableOnInteraction: false
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true
            }
        });
        this.swiperInstances.push(bannerSwiper);
        
        // Hot Suppliers Swiper
        const hotSwiper = new Swiper('.hot-swiper', {
            slidesPerView: 'auto',
            spaceBetween: 12,
            freeMode: true,
            loop: false
        });
        this.swiperInstances.push(hotSwiper);
    },
    
    // ============================================
    // UTILITIES
    // ============================================
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
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
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
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SuppliersPage.init();
});

// Make functions globally available
window.SuppliersPage = SuppliersPage;