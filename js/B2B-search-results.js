// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SearchResults = {
    currentUser: null,
    currentPage: 1,
    totalResults: 0,
    hasMore: true,
    isLoading: false,
    swiperInstance: null,
    
    currentFilters: {
        query: '',
        category: '',
        minPrice: null,
        maxPrice: null,
        conditions: [],
        moq: null,
        verifiedOnly: false,
        featuredOnly: false,
        sortBy: 'relevance'
    },
    
    categories: [],
    products: [],
    activeFilterCount: 0,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('🔍 Initializing search results page...');
        
        // Check authentication
        await this.checkAuth();
        
        // Get URL parameters
        this.getUrlParams();
        
        // Load categories for filter carousel
        await this.loadCategories();
        
        // Initialize Swiper for filter carousel
        this.initSwiper();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Perform initial search
        await this.performSearch(true);
        
        // Set active nav item
        this.setActiveNav();
    },
    
    // ============================================
    // AUTHENTICATION
    // ============================================
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
            
            if (this.currentUser) {
                console.log('✅ User logged in:', this.currentUser.id);
            }
        } catch (error) {
            console.error('❌ Auth error:', error);
            this.currentUser = null;
        }
    },
    
    // ============================================
    // SET ACTIVE NAV ITEM
    // ============================================
    setActiveNav() {
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('href') === 'B2B-search.html') {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    },
    
    // ============================================
    // GET URL PARAMETERS
    // ============================================
    getUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        
        this.currentFilters.query = urlParams.get('q') ? decodeURIComponent(urlParams.get('q')) : '';
        this.currentFilters.category = urlParams.get('category') || '';
        this.currentFilters.minPrice = urlParams.get('minPrice') ? parseInt(urlParams.get('minPrice')) : null;
        this.currentFilters.maxPrice = urlParams.get('maxPrice') ? parseInt(urlParams.get('maxPrice')) : null;
        this.currentFilters.sortBy = urlParams.get('sort') || 'relevance';
        
        // Update search query display
        const searchQueryEl = document.getElementById('searchQuery');
        if (searchQueryEl) {
            if (this.currentFilters.query) {
                searchQueryEl.innerHTML = `Search results for: <strong>${this.escapeHtml(this.currentFilters.query)}</strong>`;
            } else if (this.currentFilters.category) {
                searchQueryEl.innerHTML = `Browsing category: <strong>${this.getCategoryName(this.currentFilters.category)}</strong>`;
            } else {
                searchQueryEl.innerHTML = 'All products';
            }
        }
    },
    
    // ============================================
    // UPDATE URL WITH FILTERS
    // ============================================
    updateURL() {
        const url = new URL(window.location.href);
        
        if (this.currentFilters.query) {
            url.searchParams.set('q', this.currentFilters.query);
        } else {
            url.searchParams.delete('q');
        }
        
        if (this.currentFilters.category) {
            url.searchParams.set('category', this.currentFilters.category);
        } else {
            url.searchParams.delete('category');
        }
        
        if (this.currentFilters.minPrice) {
            url.searchParams.set('minPrice', this.currentFilters.minPrice);
        } else {
            url.searchParams.delete('minPrice');
        }
        
        if (this.currentFilters.maxPrice) {
            url.searchParams.set('maxPrice', this.currentFilters.maxPrice);
        } else {
            url.searchParams.delete('maxPrice');
        }
        
        if (this.currentFilters.sortBy !== 'relevance') {
            url.searchParams.set('sort', this.currentFilters.sortBy);
        } else {
            url.searchParams.delete('sort');
        }
        
        window.history.replaceState({}, '', url);
    },
    
    // ============================================
    // LOAD CATEGORIES FOR FILTER CAROUSEL
    // ============================================
    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name, icon, color_hex')
                .eq('is_active', true)
                .order('display_order')
                .limit(15);
                
            if (error) throw error;
            
            this.categories = data || [];
            
            // Render filter carousel
            this.renderFilterCarousel();
            
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categories = [];
        }
    },
    
    // ============================================
    // RENDER FILTER CAROUSEL
    // ============================================
    renderFilterCarousel() {
        const container = document.getElementById('filterCarousel');
        if (!container) return;
        
        if (this.categories.length === 0) {
            container.innerHTML = `
                <div class="swiper-slide"><div class="filter-skeleton"></div></div>
                <div class="swiper-slide"><div class="filter-skeleton"></div></div>
                <div class="swiper-slide"><div class="filter-skeleton"></div></div>
            `;
            return;
        }
        
        let html = '';
        
        // Add "All" filter
        const allActive = !this.currentFilters.category ? 'active' : '';
        html += `
            <div class="swiper-slide">
                <a href="#" class="filter-chip ${allActive}" data-category="">
                    <i class="fas fa-border-all"></i> All
                </a>
            </div>
        `;
        
        // Add category filters
        this.categories.forEach(cat => {
            const isActive = this.currentFilters.category == cat.id ? 'active' : '';
            const icon = cat.icon || this.getCategoryIcon(cat.name);
            
            html += `
                <div class="swiper-slide">
                    <a href="#" class="filter-chip ${isActive}" data-category="${cat.id}">
                        <i class="fas ${icon}"></i> ${this.escapeHtml(cat.name)}
                    </a>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Add click handlers
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const category = chip.dataset.category;
                this.currentFilters.category = category;
                this.currentPage = 1;
                
                // Update active state
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                
                // Update URL and search
                this.updateURL();
                this.performSearch(true);
            });
        });
    },
    
    // ============================================
    // INIT SWIPER
    // ============================================
    initSwiper() {
        if (this.swiperInstance) {
            this.swiperInstance.destroy(true, true);
        }
        
        this.swiperInstance = new Swiper('.filter-swiper', {
            slidesPerView: 'auto',
            spaceBetween: 8,
            freeMode: true,
            scrollbar: {
                el: '.swiper-scrollbar',
                hide: true,
            },
        });
    },
    
    // ============================================
    // SETUP EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Filter button
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => this.openFilterModal());
        }
        
        // Sort select
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = this.currentFilters.sortBy;
            sortSelect.addEventListener('change', (e) => {
                this.currentFilters.sortBy = e.target.value;
                this.currentPage = 1;
                this.updateURL();
                this.performSearch(true);
            });
        }
        
        // Load more button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMore());
        }
        
        // Clear filters button
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearAllFilters());
        }
        
        // Infinite scroll
        window.addEventListener('scroll', () => {
            if (this.isLoading || !this.hasMore) return;
            
            const scrollPosition = window.innerHeight + window.scrollY;
            const threshold = document.body.offsetHeight - 1000;
            
            if (scrollPosition >= threshold) {
                this.loadMore();
            }
        });
    },
    
    // ============================================
    // PERFORM SEARCH
    // ============================================
    async performSearch(resetList) {
        if (resetList) {
            this.showLoadingState();
        }
        
        this.isLoading = true;
        
        try {
            // Build query
            let query = sb
                .from('ads')
                .select(`
                    id,
                    title,
                    description,
                    wholesale_price,
                    price,
                    image_urls,
                    moq,
                    condition,
                    view_count,
                    created_at,
                    seller_id,
                    profiles!ads_seller_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        is_verified,
                        district
                    )
                `, { count: 'exact' })
                .eq('status', 'active')
                .not('wholesale_price', 'is', null);
            
            // Apply search query
            if (this.currentFilters.query) {
                query = query.textSearch('title', this.currentFilters.query, {
                    config: 'english'
                });
            }
            
            // Apply category filter
            if (this.currentFilters.category) {
                query = query.eq('category_id', this.currentFilters.category);
            }
            
            // Apply price filters
            if (this.currentFilters.minPrice) {
                query = query.gte('wholesale_price', this.currentFilters.minPrice);
            }
            if (this.currentFilters.maxPrice) {
                query = query.lte('wholesale_price', this.currentFilters.maxPrice);
            }
            
            // Apply condition filters
            if (this.currentFilters.conditions && this.currentFilters.conditions.length > 0) {
                query = query.in('condition', this.currentFilters.conditions);
            }
            
            // Apply MOQ filter
            if (this.currentFilters.moq) {
                query = query.gte('moq', this.currentFilters.moq);
            }
            
            // Apply supplier filters
            if (this.currentFilters.verifiedOnly) {
                query = query.eq('profiles.is_verified', true);
            }
            
            // Apply sorting
            switch(this.currentFilters.sortBy) {
                case 'price_low':
                    query = query.order('wholesale_price', { ascending: true });
                    break;
                case 'price_high':
                    query = query.order('wholesale_price', { ascending: false });
                    break;
                case 'newest':
                    query = query.order('created_at', { ascending: false });
                    break;
                case 'popular':
                    query = query.order('view_count', { ascending: false });
                    break;
                default:
                    query = query.order('created_at', { ascending: false });
            }
            
            // Pagination
            const from = (this.currentPage - 1) * 10;
            const to = from + 10 - 1;
            query = query.range(from, to);
            
            const { data, error, count } = await query;
            
            if (error) throw error;
            
            this.totalResults = count || 0;
            this.hasMore = (from + 10) < this.totalResults;
            
            // Update results count
            this.updateResultsCount();
            
            // Render results
            if (resetList) {
                this.products = data || [];
                this.renderResults(this.products);
            } else {
                this.products = [...this.products, ...(data || [])];
                this.appendResults(data || []);
            }
            
            // Update active filters display
            this.updateActiveFilters();
            
            // Track search if logged in
            if (this.currentUser && this.currentFilters.query) {
                this.saveSearchHistory(this.currentFilters.query);
            }
            
            // Show/hide load more button
            const loadMoreContainer = document.getElementById('loadMoreContainer');
            if (loadMoreContainer) {
                loadMoreContainer.style.display = this.hasMore ? 'flex' : 'none';
            }
            
            // Show no results if needed
            if (resetList && (!data || data.length === 0)) {
                this.showNoResults();
            }
            
        } catch (error) {
            console.error('Error performing search:', error);
            this.showToast('Error loading results', 'error');
            
            if (resetList) {
                this.showError();
            }
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // RENDER RESULTS - Image Left, Content Right
    // ============================================
    renderResults(products) {
        const list = document.getElementById('resultsList');
        if (!list) return;
        
        if (!products || products.length === 0) {
            this.showNoResults();
            return;
        }
        
        const productsHtml = products.map(product => this.renderProductItem(product)).join('');
        list.innerHTML = productsHtml;
    },
    
    // ============================================
    // APPEND RESULTS
    // ============================================
    appendResults(products) {
        const list = document.getElementById('resultsList');
        if (!list) return;
        
        const productsHtml = products.map(product => this.renderProductItem(product)).join('');
        list.insertAdjacentHTML('beforeend', productsHtml);
    },
    
    // ============================================
    // RENDER SINGLE PRODUCT ITEM
    // ============================================
    renderProductItem(product) {
        const imageUrl = (product.image_urls && product.image_urls[0]) ? product.image_urls[0] : 'https://via.placeholder.com/200?text=No+Image';
        
        const verifiedBadge = product.profiles?.is_verified ? 
            '<span class="verified-icon"><i class="fas fa-check-circle"></i></span>' : '';
        
        const supplierName = product.profiles?.business_name || product.profiles?.full_name || 'Unknown Supplier';
        
        const description = product.description ? 
            this.escapeHtml(product.description.substring(0, 80)) + (product.description.length > 80 ? '...' : '') : 
            'No description available';
        
        const originalPriceHtml = (product.price && product.wholesale_price < product.price) ? 
            `<span class="original-price">UGX ${this.formatNumber(product.price)}</span>` : '';
        
        const discount = (product.price && product.wholesale_price < product.price) ? 
            Math.round(((product.price - product.wholesale_price) / product.price) * 100) : 0;
        
        const discountBadge = discount > 0 ? 
            `<span class="result-badge">-${discount}%</span>` : '';
        
        return `
            <div class="result-item" data-product-id="${product.id}">
                <a href="B2B-product-detail.html?id=${product.id}" class="result-content">
                    <div class="result-image">
                        <img src="${imageUrl}" 
                             alt="${this.escapeHtml(product.title)}"
                             loading="lazy"
                             onerror="this.src='https://via.placeholder.com/200?text=No+Image'">
                        ${discountBadge}
                        ${product.condition === 'new' ? '<span class="result-badge">NEW</span>' : ''}
                    </div>
                    
                    <div class="result-info">
                        <h3 class="result-title">${this.escapeHtml(product.title)}</h3>
                        
                        <div class="result-supplier">
                            <span class="supplier-name">${this.escapeHtml(supplierName)}</span>
                            ${verifiedBadge}
                            <span class="supplier-location">${product.profiles?.district || 'Uganda'}</span>
                        </div>
                        
                        <div class="result-description">
                            ${description}
                        </div>
                        
                        <div class="result-meta">
                            <span class="meta-item">
                                <i class="fas fa-box"></i> MOQ: ${product.moq || 1}
                            </span>
                            <span class="meta-item">
                                <i class="fas fa-eye"></i> ${this.formatNumber(product.view_count || 0)}
                            </span>
                        </div>
                        
                        <div class="result-footer">
                            <div class="price-block">
                                <span class="current-price">UGX ${this.formatNumber(product.wholesale_price)}</span>
                                ${originalPriceHtml}
                            </div>
                            
                            <button class="contact-btn" onclick="SearchResults.openContactModal(${product.id}, event)">
                                <i class="fas fa-envelope"></i> Contact
                            </button>
                        </div>
                        
                        <div class="moq-badge">
                            <i class="fas fa-boxes"></i> Min: ${product.moq || 1}
                        </div>
                    </div>
                </a>
            </div>
        `;
    },
    
    // ============================================
    // UPDATE RESULTS COUNT
    // ============================================
    updateResultsCount() {
        const countEl = document.getElementById('resultsCount');
        if (!countEl) return;
        
        const query = this.currentFilters.query ? ` for "${this.currentFilters.query}"` : '';
        countEl.textContent = `${this.formatNumber(this.totalResults)} results${query}`;
    },
    
    // ============================================
    // UPDATE ACTIVE FILTERS
    // ============================================
    updateActiveFilters() {
        const container = document.getElementById('activeFilters');
        if (!container) return;
        
        const filters = [];
        this.activeFilterCount = 0;
        
        if (this.currentFilters.query) {
            filters.push({
                type: 'query',
                label: `"${this.currentFilters.query}"`
            });
            this.activeFilterCount++;
        }
        
        if (this.currentFilters.category) {
            const categoryName = this.getCategoryName(this.currentFilters.category);
            filters.push({
                type: 'category',
                label: categoryName
            });
            this.activeFilterCount++;
        }
        
        if (this.currentFilters.minPrice || this.currentFilters.maxPrice) {
            let priceLabel = '';
            if (this.currentFilters.minPrice) priceLabel += `UGX ${this.formatNumber(this.currentFilters.minPrice)}`;
            if (this.currentFilters.minPrice && this.currentFilters.maxPrice) priceLabel += ' - ';
            if (this.currentFilters.maxPrice) priceLabel += `UGX ${this.formatNumber(this.currentFilters.maxPrice)}`;
            filters.push({
                type: 'price',
                label: priceLabel
            });
            this.activeFilterCount++;
        }
        
        if (this.currentFilters.conditions && this.currentFilters.conditions.length > 0) {
            filters.push({
                type: 'condition',
                label: this.currentFilters.conditions.join(', ')
            });
            this.activeFilterCount++;
        }
        
        if (this.currentFilters.moq) {
            filters.push({
                type: 'moq',
                label: `MOQ: ${this.currentFilters.moq}+`
            });
            this.activeFilterCount++;
        }
        
        if (this.currentFilters.verifiedOnly) {
            filters.push({
                type: 'verified',
                label: 'Verified Suppliers'
            });
            this.activeFilterCount++;
        }
        
        if (filters.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        const filtersHtml = filters.map(filter => `
            <span class="filter-tag">
                ${this.escapeHtml(filter.label)}
                <i class="fas fa-times" onclick="SearchResults.removeFilter('${filter.type}')"></i>
            </span>
        `).join('');
        
        container.innerHTML = filtersHtml;
    },
    
    // ============================================
    // GET CATEGORY NAME BY ID
    // ============================================
    getCategoryName(categoryId) {
        const category = this.categories.find(c => c.id == categoryId);
        return category ? category.name : 'Unknown Category';
    },
    
    // ============================================
    // REMOVE FILTER
    // ============================================
    removeFilter(type) {
        switch(type) {
            case 'query':
                this.currentFilters.query = '';
                break;
            case 'category':
                this.currentFilters.category = '';
                // Update filter chip active state
                document.querySelectorAll('.filter-chip').forEach(chip => {
                    if (chip.dataset.category === '') {
                        chip.classList.add('active');
                    } else {
                        chip.classList.remove('active');
                    }
                });
                break;
            case 'price':
                this.currentFilters.minPrice = null;
                this.currentFilters.maxPrice = null;
                break;
            case 'condition':
                this.currentFilters.conditions = [];
                break;
            case 'moq':
                this.currentFilters.moq = null;
                break;
            case 'verified':
                this.currentFilters.verifiedOnly = false;
                break;
        }
        
        this.updateURL();
        this.currentPage = 1;
        this.performSearch(true);
        this.closeFilterModal();
    },
    
    // ============================================
    // CLEAR ALL FILTERS
    // ============================================
    clearAllFilters() {
        this.currentFilters = {
            query: this.currentFilters.query,
            category: '',
            minPrice: null,
            maxPrice: null,
            conditions: [],
            moq: null,
            verifiedOnly: false,
            featuredOnly: false,
            sortBy: this.currentFilters.sortBy
        };
        
        // Update filter chip active state
        document.querySelectorAll('.filter-chip').forEach(chip => {
            if (chip.dataset.category === '') {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
        
        this.updateURL();
        this.currentPage = 1;
        this.performSearch(true);
        this.closeFilterModal();
    },
    
    // ============================================
    // LOAD MORE RESULTS
    // ============================================
    async loadMore() {
        if (this.isLoading || !this.hasMore) return;
        
        this.currentPage++;
        await this.performSearch(false);
    },
    
    // ============================================
    // SHOW LOADING STATE
    // ============================================
    showLoadingState() {
        const list = document.getElementById('resultsList');
        if (list) {
            list.innerHTML = `
                <div class="skeleton-item">
                    <div class="skeleton-content">
                        <div class="skeleton-image"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-title"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-meta"></div>
                        </div>
                    </div>
                </div>
                <div class="skeleton-item">
                    <div class="skeleton-content">
                        <div class="skeleton-image"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-title"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-meta"></div>
                        </div>
                    </div>
                </div>
                <div class="skeleton-item">
                    <div class="skeleton-content">
                        <div class="skeleton-image"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-title"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-meta"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        document.getElementById('noResults').style.display = 'none';
    },
    
    // ============================================
    // SHOW NO RESULTS WITH RECOMMENDATIONS
    // ============================================
    async showNoResults() {
        const noResults = document.getElementById('noResults');
        const list = document.getElementById('resultsList');
        
        if (list) list.innerHTML = '';
        
        if (noResults) {
            noResults.style.display = 'block';
            
            // Load recommendations
            await this.loadRecommendations();
        }
    },
    
    // ============================================
    // LOAD RECOMMENDATIONS
    // ============================================
    async loadRecommendations() {
        const container = document.getElementById('recommendationList');
        if (!container) return;
        
        try {
            let query = sb
                .from('ads')
                .select('id, title')
                .eq('status', 'active')
                .limit(6);
            
            // If user has search history, use that
            if (this.currentUser) {
                const { data: history } = await sb
                    .from('search_history')
                    .select('query')
                    .eq('user_id', this.currentUser.id)
                    .order('searched_at', { ascending: false })
                    .limit(1);
                    
                if (history && history.length > 0) {
                    query = query.textSearch('title', history[0].query, {
                        config: 'english'
                    });
                }
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                // Fallback recommendations
                const fallback = [
                    'Electronics', 'Fashion', 'Home & Garden', 
                    'Automotive', 'Health & Beauty', 'Sports'
                ];
                
                container.innerHTML = fallback.map(item => `
                    <a href="B2B-search-results.html?q=${encodeURIComponent(item)}" class="recommendation-item">
                        ${item}
                    </a>
                `).join('');
                return;
            }
            
            container.innerHTML = data.map(product => `
                <a href="B2B-product-detail.html?id=${product.id}" class="recommendation-item">
                    ${this.escapeHtml(product.title)}
                </a>
            `).join('');
            
        } catch (error) {
            console.error('Error loading recommendations:', error);
        }
    },
    
    // ============================================
    // SHOW ERROR
    // ============================================
    showError() {
        const list = document.getElementById('resultsList');
        if (list) {
            list.innerHTML = `
                <div class="no-results" style="display: block;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Something went wrong</h3>
                    <p>Please try again or refresh the page</p>
                    <button class="clear-filters-btn" onclick="location.reload()">
                        <i class="fas fa-sync-alt"></i> Refresh Page
                    </button>
                </div>
            `;
        }
    },
    
    // ============================================
    // FILTER MODAL FUNCTIONS
    // ============================================
    openFilterModal() {
        // Set current values in modal
        document.getElementById('minPrice').value = this.currentFilters.minPrice || '';
        document.getElementById('maxPrice').value = this.currentFilters.maxPrice || '';
        
        // Set condition checkboxes
        document.querySelectorAll('.filter-options .filter-checkbox input[type="checkbox"]').forEach(cb => {
            if (this.currentFilters.conditions && this.currentFilters.conditions.includes(cb.value)) {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });
        
        // Set MOQ
        document.getElementById('moqFilter').value = this.currentFilters.moq || '';
        
        // Set supplier filters
        document.querySelectorAll('.filter-options .filter-checkbox input[value="verified"]').forEach(cb => {
            cb.checked = this.currentFilters.verifiedOnly || false;
        });
        
        document.querySelectorAll('.filter-options .filter-checkbox input[value="featured"]').forEach(cb => {
            cb.checked = this.currentFilters.featuredOnly || false;
        });
        
        document.getElementById('filterModal').classList.add('show');
    },
    
    closeFilterModal() {
        document.getElementById('filterModal').classList.remove('show');
    },
    
    applyFilters() {
        // Get price range
        this.currentFilters.minPrice = document.getElementById('minPrice').value || null;
        this.currentFilters.maxPrice = document.getElementById('maxPrice').value || null;
        
        // Get conditions
        this.currentFilters.conditions = [];
        document.querySelectorAll('.filter-options .filter-checkbox input[type="checkbox"]').forEach(cb => {
            if (cb.checked && ['new', 'used', 'refurbished'].includes(cb.value)) {
                this.currentFilters.conditions.push(cb.value);
            }
        });
        
        // Get MOQ
        this.currentFilters.moq = document.getElementById('moqFilter').value || null;
        
        // Get supplier filters
        document.querySelectorAll('.filter-options .filter-checkbox input[value="verified"]').forEach(cb => {
            this.currentFilters.verifiedOnly = cb.checked;
        });
        
        document.querySelectorAll('.filter-options .filter-checkbox input[value="featured"]').forEach(cb => {
            this.currentFilters.featuredOnly = cb.checked;
        });
        
        this.updateURL();
        this.currentPage = 1;
        this.performSearch(true);
        this.closeFilterModal();
    },
    
    // ============================================
    // CONTACT MODAL FUNCTIONS
    // ============================================
    async openContactModal(productId, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    moq,
                    profiles!ads_seller_id_fkey (
                        id,
                        business_name,
                        full_name,
                        avatar_url,
                        email,
                        phone
                    )
                `)
                .eq('id', productId)
                .single();
                
            if (error) throw error;
            
            const supplier = data.profiles;
            const supplierName = supplier?.business_name || supplier?.full_name || 'Supplier';
            const initials = supplierName
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            
            const avatarHtml = supplier?.avatar_url ? 
                `<img src="${supplier.avatar_url}" alt="${this.escapeHtml(supplierName)}">` : 
                `<span>${initials}</span>`;
            
            const supplierInfo = document.getElementById('contactSupplierInfo');
            supplierInfo.innerHTML = `
                <div class="supplier-avatar">
                    ${avatarHtml}
                </div>
                <div class="supplier-details">
                    <h4>${this.escapeHtml(supplierName)}</h4>
                    <p>Product: ${this.escapeHtml(data.title)}</p>
                </div>
            `;
            
            // Store product ID for later use
            this.currentProductId = productId;
            
            // Pre-fill user info if logged in
            if (this.currentUser) {
                const { data: profile } = await sb
                    .from('profiles')
                    .select('full_name, email, phone')
                    .eq('id', this.currentUser.id)
                    .single();
                    
                if (profile) {
                    document.getElementById('contactName').value = profile.full_name || '';
                    document.getElementById('contactEmail').value = profile.email || '';
                    document.getElementById('contactPhone').value = profile.phone || '';
                }
            }
            
            document.getElementById('contactModal').classList.add('show');
            
        } catch (error) {
            console.error('Error loading supplier info:', error);
            this.showToast('Error loading supplier information', 'error');
        }
    },
    
    closeContactModal() {
        document.getElementById('contactModal').classList.remove('show');
        document.getElementById('contactForm').reset();
    },
    
    async sendContactMessage() {
        const name = document.getElementById('contactName').value;
        const email = document.getElementById('contactEmail').value;
        const phone = document.getElementById('contactPhone').value;
        const quantity = document.getElementById('contactQuantity').value;
        const message = document.getElementById('contactMessage').value;
        const terms = document.getElementById('contactTerms').checked;
        
        if (!name || !email || !quantity || !message || !terms) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        this.showLoading(true, 'Sending message...');
        
        try {
            // Get product details
            const { data: product, error: productError } = await sb
                .from('ads')
                .select('seller_id, title')
                .eq('id', this.currentProductId)
                .single();
                
            if (productError) throw productError;
            
            // Create inquiry in inquiry_requests table
            const inquiryData = {
                inquiry_number: 'INQ-' + Date.now(),
                buyer_id: this.currentUser ? this.currentUser.id : null,
                title: `Inquiry about ${product.title}`,
                description: message,
                status: 'sent',
                created_at: new Date().toISOString()
            };
            
            const { data: inquiry, error: inquiryError } = await sb
                .from('inquiry_requests')
                .insert([inquiryData])
                .select();
                
            if (inquiryError) throw inquiryError;
            
            // Create message in messages table
            const messageData = {
                sender_id: this.currentUser ? this.currentUser.id : null,
                receiver_id: product.seller_id,
                ad_id: this.currentProductId,
                content: message,
                message_type: 'text',
                created_at: new Date().toISOString()
            };
            
            const { error: messageError } = await sb
                .from('messages')
                .insert([messageData]);
                
            if (messageError) throw messageError;
            
            // Track engagement in ad_engagement table
            await sb
                .from('ad_engagement')
                .insert({
                    ad_id: this.currentProductId,
                    user_id: this.currentUser ? this.currentUser.id : null,
                    action: 'inquiry',
                    performed_at: new Date().toISOString()
                });
            
            this.showLoading(false);
            this.closeContactModal();
            this.showSuccessModal();
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showLoading(false);
            this.showToast('Failed to send message', 'error');
        }
    },
    
    // ============================================
    // SUCCESS MODAL
    // ============================================
    showSuccessModal() {
        document.getElementById('successModal').classList.add('show');
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    redirectToInquiries() {
        window.location.href = 'my-inquiries.html';
    },
    
    // ============================================
    // SAVE SEARCH HISTORY
    // ============================================
    async saveSearchHistory(query) {
        if (!this.currentUser || !query || query.length < 3) return;
        
        try {
            await sb
                .from('search_history')
                .insert([{
                    user_id: this.currentUser.id,
                    query: query,
                    searched_at: new Date().toISOString()
                }]);
        } catch (error) {
            console.error('Error saving search history:', error);
        }
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    getCategoryIcon(categoryName) {
        const icons = {
            'electronics': 'fa-tv',
            'fashion': 'fa-tshirt',
            'home': 'fa-home',
            'garden': 'fa-seedling',
            'automotive': 'fa-car',
            'health': 'fa-heartbeat',
            'beauty': 'fa-spa',
            'sports': 'fa-futbol',
            'books': 'fa-book',
            'toys': 'fa-gamepad',
            'food': 'fa-utensils',
            'furniture': 'fa-couch',
            'phones': 'fa-mobile-alt',
            'computers': 'fa-laptop',
            'tools': 'fa-tools'
        };
        
        const lowerName = categoryName.toLowerCase();
        for (const key in icons) {
            if (lowerName.includes(key)) {
                return icons[key];
            }
        }
        return 'fa-tag';
    },
    
    formatNumber(num) {
        if (!num && num !== 0) return '0';
        return parseInt(num).toLocaleString('en-UG');
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showLoading(show, message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');
        
        if (!overlay || !messageEl) return;
        
        if (show) {
            messageEl.textContent = message;
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    },
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#6B21E5',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SearchResults.init();
});

// Make functions globally available
window.SearchResults = SearchResults;