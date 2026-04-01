// ============================================
// CATEGORY PAGE
// ============================================

console.log('🚀 Category page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const CategoryPage = {
    categoryId: null,
    category: null,
    products: [],
    filteredProducts: [],
    filters: {
        minPrice: null,
        maxPrice: null,
        location: '',
        verifiedOnly: false,
        search: ''
    },
    sortBy: 'popular',
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        // Get category ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.categoryId = urlParams.get('id');
        
        if (!this.categoryId) {
            window.location.href = 'discover.html';
            return;
        }
        
        console.log(`📊 Loading category ${this.categoryId}...`);
        
        try {
            await this.loadCategory();
            await this.loadProducts();
            this.renderCategoryHeader();
            this.renderProducts();
            this.setupEventListeners();
            this.updateProductCount();
            
            console.log('✅ Category page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
        }
    },
    
    // ============================================
    // LOAD DATA
    // ============================================
    async loadCategory() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .eq('id', this.categoryId)
                .single();

            if (error) throw error;
            
            this.category = data;
            console.log('✅ Category loaded:', this.category);
            
        } catch (error) {
            console.error('❌ Error loading category:', error);
        }
    },
    
    async loadProducts() {
        try {
            // Get products in this category or subcategories
            const subcategories = await this.getSubcategories();
            const categoryIds = [this.categoryId, ...subcategories];
            
            const { data, error } = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    description,
                    price,
                    wholesale_price,
                    currency,
                    image_urls,
                    moq,
                    condition,
                    view_count,
                    seller_id,
                    profiles!ads_seller_id_fkey (
                        full_name,
                        business_name,
                        is_verified,
                        location
                    )
                `)
                .in('category_id', categoryIds)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.products = data || [];
            this.filteredProducts = [...this.products];
            
            console.log(`✅ Loaded ${this.products.length} products`);
            
        } catch (error) {
            console.error('❌ Error loading products:', error);
        }
    },
    
    async getSubcategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id')
                .eq('parent_id', this.categoryId);
                
            if (error) throw error;
            
            return data.map(c => c.id);
            
        } catch (error) {
            console.error('Error loading subcategories:', error);
            return [];
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderCategoryHeader() {
        const container = document.getElementById('categoryHeader');
        if (!container || !this.category) return;
        
        const icon = this.category.conducive_icon || 'fa-tag';
        const color = this.category.color_hex || '#0B4F6C';
        const tagline = this.category.conducive_tagline || 'Explore our collection';
        
        // Get subcategory count
        const subcategories = this.categories?.filter(c => c.parent_id === this.categoryId) || [];
        
        container.innerHTML = `
            <div class="category-info">
                <div class="category-icon" style="background: ${color}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="category-details">
                    <h1>${this.escapeHtml(this.category.display_name || this.category.name)}</h1>
                    <div class="category-tagline">${this.escapeHtml(tagline)}</div>
                    <div class="category-stats">
                        <span><i class="fas fa-box"></i> ${this.products.length} products</span>
                        <span><i class="fas fa-layer-group"></i> ${subcategories.length} subcategories</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        
        if (this.filteredProducts.length === 0) {
            grid.innerHTML = `
                <div class="loading-grid">
                    <i class="fas fa-box-open" style="font-size: 48px; color: var(--gray-300); margin-bottom: 16px;"></i>
                    <p>No products found</p>
                    <button class="reset-btn" onclick="CategoryPage.resetFilters()" style="margin-top: 16px;">Clear Filters</button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.filteredProducts.map(product => {
            const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/300?text=No+Image';
            const price = product.wholesale_price || product.price || 0;
            const seller = product.profiles || {};
            const sellerName = seller.business_name || seller.full_name || 'Supplier';
            
            return `
                <div class="product-card" onclick="CategoryPage.showQuickView(${product.id})">
                    <div class="product-image">
                        <img src="${imageUrl}" alt="${this.escapeHtml(product.title)}" loading="lazy">
                        ${product.condition === 'new' ? '<span class="product-badge">NEW</span>' : ''}
                        ${seller.is_verified ? '<span class="product-verified"><i class="fas fa-check"></i></span>' : ''}
                    </div>
                    <div class="product-info">
                        <h3 class="product-title">${this.escapeHtml(product.title)}</h3>
                        <div class="product-price">
                            UGX ${this.formatNumber(price)}
                            ${product.wholesale_price ? '<small>wholesale</small>' : ''}
                        </div>
                        <div class="product-supplier">
                            <i class="fas fa-store"></i>
                            <span>${this.escapeHtml(sellerName)}</span>
                        </div>
                        ${product.moq ? `
                            <div class="product-moq">
                                <i class="fas fa-boxes"></i>
                                <span>MOQ: ${product.moq}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        this.updateProductCount();
    },
    
    // ============================================
    // FILTERING
    // ============================================
    applyFilters() {
        this.filters.minPrice = document.getElementById('minPrice').value ? 
            parseFloat(document.getElementById('minPrice').value) : null;
        this.filters.maxPrice = document.getElementById('maxPrice').value ? 
            parseFloat(document.getElementById('maxPrice').value) : null;
        this.filters.location = document.getElementById('locationFilter').value;
        this.filters.verifiedOnly = document.getElementById('verifiedOnly').checked;
        
        this.filteredProducts = this.products.filter(product => {
            const price = product.wholesale_price || product.price || 0;
            const seller = product.profiles || {};
            
            // Price filter
            if (this.filters.minPrice && price < this.filters.minPrice) return false;
            if (this.filters.maxPrice && price > this.filters.maxPrice) return false;
            
            // Location filter
            if (this.filters.location && seller.location !== this.filters.location) return false;
            
            // Verified only
            if (this.filters.verifiedOnly && !seller.is_verified) return false;
            
            // Search
            if (this.filters.search && !product.title.toLowerCase().includes(this.filters.search.toLowerCase())) {
                return false;
            }
            
            return true;
        });
        
        this.applySort();
        this.renderProducts();
        this.closeFilterPanel();
    },
    
    applySort() {
        switch(this.sortBy) {
            case 'price-low':
                this.filteredProducts.sort((a, b) => {
                    const priceA = a.wholesale_price || a.price || 0;
                    const priceB = b.wholesale_price || b.price || 0;
                    return priceA - priceB;
                });
                break;
            case 'price-high':
                this.filteredProducts.sort((a, b) => {
                    const priceA = a.wholesale_price || a.price || 0;
                    const priceB = b.wholesale_price || b.price || 0;
                    return priceB - priceA;
                });
                break;
            case 'newest':
                this.filteredProducts.sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                break;
            default: // popular
                this.filteredProducts.sort((a, b) => 
                    (b.view_count || 0) - (a.view_count || 0)
                );
        }
    },
    
    resetFilters() {
        document.getElementById('minPrice').value = '';
        document.getElementById('maxPrice').value = '';
        document.getElementById('locationFilter').value = '';
        document.getElementById('verifiedOnly').checked = false;
        
        this.filters = {
            minPrice: null,
            maxPrice: null,
            location: '',
            verifiedOnly: false,
            search: ''
        };
        
        this.filteredProducts = [...this.products];
        this.applySort();
        this.renderProducts();
        this.closeFilterPanel();
    },
    
    updateProductCount() {
        document.getElementById('productCount').textContent = 
            `${this.filteredProducts.length} product${this.filteredProducts.length !== 1 ? 's' : ''}`;
    },
    
    // ============================================
    // SEARCH
    // ============================================
    search(query) {
        this.filters.search = query;
        this.applyFilters();
    },
    
    // ============================================
    // QUICK VIEW
    // ============================================
    async showQuickView(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const seller = product.profiles || {};
        const price = product.wholesale_price || product.price || 0;
        
        document.getElementById('quickViewBody').innerHTML = `
            <div class="quickview-image">
                <img src="${product.image_urls?.[0] || 'https://via.placeholder.com/400'}" alt="${this.escapeHtml(product.title)}">
            </div>
            <h2 class="quickview-title">${this.escapeHtml(product.title)}</h2>
            <div class="quickview-price">UGX ${this.formatNumber(price)}</div>
            
            <div class="quickview-meta">
                <div class="meta-item">
                    <span class="meta-label">Supplier</span>
                    <span class="meta-value">${this.escapeHtml(seller.business_name || seller.full_name || 'Supplier')}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">MOQ</span>
                    <span class="meta-value">${product.moq || 1} units</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Condition</span>
                    <span class="meta-value">${product.condition || 'New'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Location</span>
                    <span class="meta-value">${seller.location || 'Uganda'}</span>
                </div>
            </div>
            
            ${product.description ? `
                <div class="quickview-description">
                    ${this.escapeHtml(product.description)}
                </div>
            ` : ''}
            
            <div class="quickview-actions">
                <button class="contact-btn" onclick="CategoryPage.contactSupplier('${product.seller_id}')">
                    <i class="fas fa-comment"></i> Chat
                </button>
                <button class="inquiry-btn" onclick="CategoryPage.sendInquiry(${product.id})">
                    <i class="fas fa-file-invoice"></i> Inquiry
                </button>
            </div>
        `;
        
        document.getElementById('quickViewModal').classList.add('show');
    },
    
    // ============================================
    // ACTIONS
    // ============================================
    contactSupplier(sellerId) {
        // Check if user is logged in
        sb.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                window.location.href = `chat.html?user=${sellerId}`;
            } else {
                window.location.href = `login.html?redirect=category.html?id=${this.categoryId}`;
            }
        });
    },
    
    sendInquiry(productId) {
        sb.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                window.location.href = `send-inquiry.html?product=${productId}`;
            } else {
                window.location.href = `login.html?redirect=send-inquiry.html&product=${productId}`;
            }
        });
    },
    
    // ============================================
    // UI CONTROLS
    // ============================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('show');
        
        if (searchBar.classList.contains('show')) {
            document.getElementById('searchInput').focus();
        }
    },
    
    toggleFilterPanel() {
        document.getElementById('filterPanel').classList.toggle('show');
        document.getElementById('sortPanel').classList.remove('show');
    },
    
    toggleSortPanel() {
        document.getElementById('sortPanel').classList.toggle('show');
        document.getElementById('filterPanel').classList.remove('show');
    },
    
    closeFilterPanel() {
        document.getElementById('filterPanel').classList.remove('show');
    },
    
    closeSortPanel() {
        document.getElementById('sortPanel').classList.remove('show');
    },
    
    setSort(sortBy) {
        this.sortBy = sortBy;
        this.applySort();
        this.renderProducts();
        this.closeSortPanel();
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    formatNumber(num) {
        return num?.toLocaleString('en-UG') || '0';
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
        
        // Search input
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.search(e.target.value);
                document.getElementById('searchBar').classList.remove('show');
            }
        });
        
        // Filter toggle
        document.getElementById('filterToggle').addEventListener('click', () => {
            this.toggleFilterPanel();
        });
        
        // Sort toggle
        document.getElementById('sortToggle').addEventListener('click', () => {
            this.toggleSortPanel();
        });
        
        // Apply filters
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });
        
        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Sort options
        document.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setSort(e.currentTarget.dataset.sort);
            });
        });
        
        // Close modals on outside click
        document.getElementById('quickViewModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('quickViewModal')) {
                closeQuickView();
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    CategoryPage.init();
});

// Global functions
window.closeQuickView = () => {
    document.getElementById('quickViewModal').classList.remove('show');
};

window.CategoryPage = CategoryPage;