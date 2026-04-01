// ============================================
// STORE PREVIEW - COMPLETE
// ============================================

console.log('🚀 Store Preview loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let StorePreview = {
    currentUser: null,
    supplierId: null,
    supplier: null,
    storefront: null,
    companyProfile: null,
    products: [],
    filteredProducts: [],
    reviews: [],
    currentProductPage: 1,
    currentReviewPage: 1,
    productsPerPage: 8,
    reviewsPerPage: 5,
    hasMoreProducts: true,
    hasMoreReviews: true,
    isLoading: false,
    currentTab: 'home',
    currentProduct: null,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Store Preview initializing...');
        
        // Get supplier ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.supplierId = urlParams.get('id');
        
        if (!this.supplierId) {
            this.showError();
            return;
        }
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadStorefront();
            await this.loadCompanyProfile();
            await this.loadProducts();
            await this.loadReviews();
            
            this.renderStore();
            this.setupEventListeners();
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('storeContent').style.display = 'block';
            
            console.log('✅ Store Preview initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (!error && user) {
                this.currentUser = user;
            }
        } catch (error) {
            console.log('User not logged in');
        }
    },
    
    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    *,
                    profiles!suppliers_profile_id_fkey (
                        id,
                        full_name,
                        avatar_url,
                        location,
                        phone,
                        email,
                        is_verified
                    )
                `)
                .eq('id', this.supplierId)
                .single();
            
            if (error) throw error;
            
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier.business_name);
            
        } catch (error) {
            console.error('Error loading supplier:', error);
            throw error;
        }
    },
    
    async loadStorefront() {
        try {
            const { data, error } = await sb
                .from('supplier_storefronts')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .maybeSingle();
            
            if (error) throw error;
            
            this.storefront = data || {};
            console.log('✅ Storefront loaded');
            
        } catch (error) {
            console.error('Error loading storefront:', error);
            this.storefront = {};
        }
    },
    
    async loadCompanyProfile() {
        try {
            const { data, error } = await sb
                .from('supplier_company_profiles')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .maybeSingle();
            
            if (error) throw error;
            
            this.companyProfile = data || {};
            console.log('✅ Company profile loaded');
            
        } catch (error) {
            console.error('Error loading company profile:', error);
            this.companyProfile = {};
        }
    },
    
    async loadProducts(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentProductPage = 1;
            this.hasMoreProducts = true;
            this.products = [];
        }
        
        try {
            const from = (this.currentProductPage - 1) * this.productsPerPage;
            const to = from + this.productsPerPage - 1;
            
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
                    sku,
                    view_count,
                    created_at
                `)
                .eq('supplier_id', this.supplierId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.products = data || [];
            } else {
                this.products = [...this.products, ...(data || [])];
            }
            
            this.filteredProducts = [...this.products];
            this.hasMoreProducts = (data || []).length === this.productsPerPage;
            
            this.renderProducts();
            this.renderHotProducts();
            this.renderNewProducts();
            
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            this.isLoading = false;
        }
    },
    
    async loadReviews(reset = true) {
        if (reset) {
            this.currentReviewPage = 1;
            this.hasMoreReviews = true;
        }
        
        try {
            const from = (this.currentReviewPage - 1) * this.reviewsPerPage;
            const to = from + this.reviewsPerPage - 1;
            
            const { data, error } = await sb
                .from('reviews')
                .select(`
                    *,
                    reviewer:profiles!reviews_reviewer_id_fkey (
                        full_name,
                        avatar_url
                    )
                `)
                .eq('reviewee_id', this.supplier.profile_id)
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.reviews = data || [];
            } else {
                this.reviews = [...this.reviews, ...(data || [])];
            }
            
            this.hasMoreReviews = (data || []).length === this.reviewsPerPage;
            
            this.renderReviews();
            this.renderRatingSummary();
            
        } catch (error) {
            console.error('Error loading reviews:', error);
            this.reviews = [];
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderStore() {
        this.renderStoreHeader();
        this.renderStoreBanner();
        this.renderStoreStats();
        this.renderStoreTagline();
        this.renderCategories();
        this.renderAbout();
        this.renderContact();
    },
    
    renderStoreHeader() {
        const profile = this.supplier.profiles || {};
        const name = this.supplier.business_name;
        const initials = name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BS';
        const location = profile.location || this.supplier.warehouse_district || 'Uganda';
        const memberSince = this.supplier.year_established || new Date(this.supplier.created_at).getFullYear();
        
        // Avatar
        const avatarContainer = document.getElementById('storeAvatar');
        avatarContainer.innerHTML = profile.avatar_url ? 
            `<img src="${profile.avatar_url}" alt="${name}">` : 
            initials;
        
        // Name
        document.getElementById('storeName').textContent = name;
        
        // Meta
        const metaContainer = document.getElementById('storeMeta');
        metaContainer.innerHTML = `
            <span><i class="fas fa-map-marker-alt"></i> ${location}</span>
            <span><i class="far fa-calendar-alt"></i> Member since ${memberSince}</span>
            <span><i class="fas fa-box"></i> ${this.products.length} products</span>
        `;
        
        // Badges
        const badgesContainer = document.getElementById('storeBadges');
        let badgesHtml = '';
        
        if (profile.is_verified || this.supplier.verification_status === 'verified') {
            badgesHtml += '<span class="badge verified"><i class="fas fa-check-circle"></i> Verified</span>';
        }
        
        if (this.supplier.is_featured) {
            badgesHtml += '<span class="badge featured"><i class="fas fa-star"></i> Featured</span>';
        }
        
        badgesContainer.innerHTML = badgesHtml;
    },
    
    renderStoreBanner() {
        const bannerSection = document.getElementById('storeBanner');
        
        if (!this.storefront.banner_image_url) {
            bannerSection.style.display = 'none';
            return;
        }
        
        bannerSection.style.display = 'block';
        
        document.getElementById('bannerImage').innerHTML = `<img src="${this.storefront.banner_image_url}" alt="Store Banner">`;
        document.getElementById('bannerTitle').textContent = this.storefront.banner_title || '';
        document.getElementById('bannerSubtitle').textContent = this.storefront.banner_subtitle || '';
        
        const bannerBtn = document.getElementById('bannerButton');
        if (this.storefront.banner_button_text && this.storefront.banner_button_link) {
            bannerBtn.textContent = this.storefront.banner_button_text;
            bannerBtn.href = this.storefront.banner_button_link;
            bannerBtn.style.display = 'inline-block';
        } else {
            bannerBtn.style.display = 'none';
        }
    },
    
    renderStoreStats() {
        const statsContainer = document.getElementById('storeStats');
        
        // Get custom stats from storefront or calculate
        let stats = [];
        
        if (this.storefront.custom_stats && this.storefront.custom_stats.length > 0) {
            stats = this.storefront.custom_stats.slice(0, 4);
        } else {
            // Default stats
            const years = this.supplier.year_established ? 
                `${new Date().getFullYear() - parseInt(this.supplier.year_established)}+` : '10+';
            
            stats = [
                { value: years, label: 'YEARS EXPERIENCE' },
                { value: this.products.length, label: 'PRODUCTS' },
                { value: this.supplier.total_orders || '1k+', label: 'ORDERS' },
                { value: this.supplier.completion_rate || '98%', label: 'COMPLETION' }
            ];
        }
        
        statsContainer.innerHTML = stats.map(stat => `
            <div class="stat-card">
                <span class="stat-value">${stat.value}</span>
                <span class="stat-label">${stat.label}</span>
            </div>
        `).join('');
    },
    
    renderStoreTagline() {
        const taglineEl = document.getElementById('storeTagline');
        
        if (this.storefront.tagline) {
            taglineEl.style.display = 'block';
            taglineEl.textContent = this.storefront.tagline;
        } else {
            taglineEl.style.display = 'none';
        }
    },
    
    renderCategories() {
        const container = document.getElementById('categoriesGrid');
        
        // Default categories based on products
        const categories = new Set();
        this.products.forEach(product => {
            const title = product.title.toLowerCase();
            if (title.includes('scooter')) categories.add('Scooters');
            else if (title.includes('motorcycle')) categories.add('Motorcycles');
            else if (title.includes('bike')) categories.add('Bikes');
            else if (title.includes('part')) categories.add('Parts');
            else categories.add('Other');
        });
        
        const categoryList = Array.from(categories).slice(0, 4);
        
        container.innerHTML = categoryList.map(cat => {
            const icons = {
                'Scooters': 'fa-motorcycle',
                'Motorcycles': 'fa-motorcycle',
                'Bikes': 'fa-bicycle',
                'Parts': 'fa-cog',
                'Other': 'fa-tag'
            };
            
            return `
                <a href="#" class="category-card" onclick="filterByCategory('${cat}')">
                    <div class="category-icon">
                        <i class="fas ${icons[cat] || 'fa-tag'}"></i>
                    </div>
                    <span class="category-name">${cat}</span>
                </a>
            `;
        }).join('');
    },
    
    renderHotProducts() {
        const container = document.getElementById('hotProductsGrid');
        
        // Update hot selling title from storefront
        const hotTitle = document.getElementById('hotSellingTitle');
        hotTitle.textContent = this.storefront.hot_selling_title || 'Hot Selling';
        
        // Get first 4 products as hot products
        const hotProducts = this.products.slice(0, 4);
        
        this.renderProductGrid(container, hotProducts);
    },
    
    renderNewProducts() {
        const container = document.getElementById('newProductsGrid');
        
        // Get next 4 products as new arrivals
        const newProducts = this.products.slice(4, 8);
        
        if (newProducts.length > 0) {
            this.renderProductGrid(container, newProducts);
        } else {
            container.innerHTML = '<p class="text-muted">No new products</p>';
        }
    },
    
    renderProducts() {
        const container = document.getElementById('allProductsGrid');
        this.renderProductGrid(container, this.filteredProducts);
        
        document.getElementById('loadMoreProducts').style.display = 
            this.hasMoreProducts ? 'block' : 'none';
    },
    
    renderProductGrid(container, products) {
        if (!container) return;
        
        if (products.length === 0) {
            container.innerHTML = '<p class="text-muted">No products available</p>';
            return;
        }
        
        container.innerHTML = products.map(product => {
            const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/200';
            const price = product.wholesale_price || product.price || 0;
            
            return `
                <div class="product-card" onclick="StorePreview.showProduct(${product.id})">
                    <div class="product-image">
                        <img src="${imageUrl}" alt="${product.title}" loading="lazy">
                    </div>
                    <div class="product-info">
                        <div class="product-title">${this.escapeHtml(product.title)}</div>
                        <div class="product-price">UGX ${this.formatNumber(price)}</div>
                        <div class="product-moq">MOQ: ${product.moq || 1} pcs</div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    renderAbout() {
        const profile = this.companyProfile;
        
        // About
        document.getElementById('aboutContent').innerHTML = profile.about || 
            '<p class="text-muted">No information provided.</p>';
        
        // Mission & Vision
        document.getElementById('missionText').textContent = profile.mission || 'Not specified';
        document.getElementById('visionText').textContent = profile.vision || 'Not specified';
        
        // Core Values
        const coreValues = profile.core_values || [];
        const coreValuesEl = document.getElementById('coreValues');
        if (coreValues.length > 0) {
            coreValuesEl.innerHTML = coreValues.map(value => 
                `<span class="core-value-tag">${this.escapeHtml(value)}</span>`
            ).join('');
        } else {
            coreValuesEl.innerHTML = '<p class="text-muted">No core values listed</p>';
        }
        
        // Facilities
        const facilitiesEl = document.getElementById('facilities');
        facilitiesEl.innerHTML = `
            <div class="facility-item">
                <span class="facility-label">Factory Size</span>
                <span class="facility-value">${profile.factory_size || 'Not specified'}</span>
            </div>
            <div class="facility-item">
                <span class="facility-label">Location</span>
                <span class="facility-value">${profile.factory_location || 'Not specified'}</span>
            </div>
            <div class="facility-item">
                <span class="facility-label">Employees</span>
                <span class="facility-value">${profile.employee_count || 'Not specified'}</span>
            </div>
            <div class="facility-item">
                <span class="facility-label">Annual Revenue</span>
                <span class="facility-value">${profile.annual_revenue || 'Not specified'}</span>
            </div>
        `;
        
        // Certifications
        const certifications = profile.certifications || [];
        const certEl = document.getElementById('certifications');
        if (certifications.length > 0) {
            certEl.innerHTML = certifications.map(cert => `
                <div class="certification-card">
                    ${cert.image_url ? 
                        `<img src="${cert.image_url}" class="cert-image">` : 
                        '<div class="cert-placeholder"><i class="fas fa-certificate"></i></div>'}
                    <div class="cert-info">
                        <div class="cert-name">${this.escapeHtml(cert.name)}</div>
                        <div class="cert-meta">${cert.issuer || ''} · ${cert.year || ''}</div>
                    </div>
                </div>
            `).join('');
        } else {
            certEl.innerHTML = '<p class="text-muted">No certifications listed</p>';
        }
        
        // Export Markets
        const markets = profile.export_markets || [];
        const marketsEl = document.getElementById('exportMarkets');
        if (markets.length > 0) {
            marketsEl.innerHTML = markets.map(market => 
                `<span class="market-tag">${this.escapeHtml(market)}</span>`
            ).join('');
        } else {
            marketsEl.innerHTML = '<p class="text-muted">No export markets listed</p>';
        }
        
        // Timeline
        const timeline = profile.company_timeline || [];
        const timelineEl = document.getElementById('timeline');
        if (timeline.length > 0) {
            timelineEl.innerHTML = timeline.map(event => `
                <div class="timeline-item">
                    <div class="timeline-year">${event.year}</div>
                    <div class="timeline-content">
                        <div class="timeline-title">${this.escapeHtml(event.title)}</div>
                        <div class="timeline-description">${this.escapeHtml(event.description || '')}</div>
                    </div>
                </div>
            `).join('');
        } else {
            timelineEl.innerHTML = '<p class="text-muted">No timeline events</p>';
        }
    },
    
    renderContact() {
        const profile = this.supplier.profiles || {};
        
        document.getElementById('contactLocation').textContent = profile.location || 'Uganda';
        document.getElementById('contactPhone').textContent = profile.phone || 'Not provided';
        document.getElementById('contactEmail').textContent = profile.email || 'Not provided';
        document.getElementById('warehouseAddress').textContent = 
            this.supplier.warehouse_location || profile.location || 'Not specified';
        
        // Set up contact buttons
        document.getElementById('chatWithSupplier').href = `chat.html?user=${this.supplier.profile_id}`;
        document.getElementById('sendInquiry').href = `send-inquiry.html?supplier=${this.supplierId}`;
        document.getElementById('chatFAB').onclick = () => this.startChat();
        document.getElementById('inquiryFAB').onclick = () => this.sendInquiry();
    },
    
    renderReviews() {
        const container = document.getElementById('reviewsList');
        
        if (this.reviews.length === 0) {
            container.innerHTML = '<p class="text-muted">No reviews yet</p>';
            return;
        }
        
        container.innerHTML = this.reviews.map(review => {
            const reviewer = review.reviewer || {};
            const reviewerName = reviewer.full_name || 'Anonymous';
            const initials = reviewerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const date = new Date(review.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Generate stars
            let starsHtml = '';
            for (let i = 0; i < 5; i++) {
                if (i < review.rating) {
                    starsHtml += '<i class="fas fa-star"></i>';
                } else {
                    starsHtml += '<i class="far fa-star"></i>';
                }
            }
            
            return `
                <div class="review-card">
                    <div class="review-header">
                        <div class="reviewer-info">
                            <div class="reviewer-avatar">
                                ${reviewer.avatar_url ? 
                                    `<img src="${reviewer.avatar_url}" alt="${reviewerName}">` : 
                                    initials
                                }
                            </div>
                            <span class="reviewer-name">${this.escapeHtml(reviewerName)}</span>
                        </div>
                        <span class="review-date">${date}</span>
                    </div>
                    <div class="review-rating">
                        ${starsHtml}
                    </div>
                    ${review.title ? `<h4 class="review-title">${this.escapeHtml(review.title)}</h4>` : ''}
                    <p class="review-content">${this.escapeHtml(review.comment || '')}</p>
                </div>
            `;
        }).join('');
        
        document.getElementById('loadMoreReviews').style.display = 
            this.hasMoreReviews ? 'block' : 'none';
    },
    
    renderRatingSummary() {
        if (this.reviews.length === 0) return;
        
        const avgRating = this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
        
        const summary = document.getElementById('ratingSummary');
        summary.innerHTML = `
            <div class="average-rating">
                <div class="rating-number">${avgRating.toFixed(1)}</div>
                <div class="rating-stars">
                    ${this.getStars(avgRating)}
                </div>
            </div>
            <div class="total-reviews">
                Based on ${this.reviews.length} review${this.reviews.length !== 1 ? 's' : ''}
            </div>
        `;
    },
    
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
    // PRODUCT ACTIONS
    // ============================================
    async showProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        this.currentProduct = product;
        
        const modalBody = document.getElementById('productModalBody');
        const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/400';
        const price = product.wholesale_price || product.price || 0;
        
        modalBody.innerHTML = `
            <div class="product-quickview">
                <div class="product-quickview-image">
                    <img src="${imageUrl}" alt="${product.title}">
                </div>
                <div class="product-quickview-info">
                    <h2>${this.escapeHtml(product.title)}</h2>
                    <div class="product-quickview-price">UGX ${this.formatNumber(price)}</div>
                    
                    <div class="product-quickview-meta">
                        <div class="meta-item">
                            <span class="meta-label">MOQ</span>
                            <span class="meta-value">${product.moq || 1} pieces</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">SKU</span>
                            <span class="meta-value">${product.sku || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="product-quickview-description">
                        ${product.description || 'No description available'}
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('productModal').classList.add('show');
    },
    
    filterProducts() {
        const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
        const sortBy = document.getElementById('sortProducts')?.value || 'newest';
        
        this.filteredProducts = this.products.filter(p => 
            p.title.toLowerCase().includes(searchTerm)
        );
        
        // Sort
        switch(sortBy) {
            case 'price_low':
                this.filteredProducts.sort((a, b) => 
                    (a.wholesale_price || a.price || 0) - (b.wholesale_price || b.price || 0)
                );
                break;
            case 'price_high':
                this.filteredProducts.sort((a, b) => 
                    (b.wholesale_price || b.price || 0) - (a.wholesale_price || a.price || 0)
                );
                break;
            case 'popular':
                this.filteredProducts.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
                break;
            default:
                this.filteredProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        
        this.renderProducts();
    },
    
    loadMoreProducts() {
        if (!this.hasMoreProducts || this.isLoading) return;
        this.currentProductPage++;
        this.loadProducts(false);
    },
    
    loadMoreReviews() {
        if (!this.hasMoreReviews) return;
        this.currentReviewPage++;
        this.loadReviews(false);
    },
    
    // ============================================
    // TAB NAVIGATION
    // ============================================
    switchTab(tabId) {
        this.currentTab = tabId;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
    },
    
    // ============================================
    // ACTIONS
    // ============================================
    startChat() {
        if (this.currentUser) {
            window.location.href = `chat.html?user=${this.supplier.profile_id}`;
        } else {
            window.location.href = `login.html?redirect=store-preview.html?id=${this.supplierId}`;
        }
    },
    
    sendInquiry() {
        if (this.currentUser) {
            window.location.href = `send-inquiry.html?supplier=${this.supplierId}`;
        } else {
            window.location.href = `login.html?redirect=send-inquiry.html&supplier=${this.supplierId}`;
        }
    },
    
    shareStore() {
        document.getElementById('shareModal').classList.add('show');
    },
    
    copyStoreLink() {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        this.closeShareModal();
        this.showToast('Store link copied to clipboard!', 'success');
    },
    
    shareVia(platform) {
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(`Check out this store on iBlue B2B: ${this.supplier.business_name}`);
        let shareUrl = '';
        
        switch(platform) {
            case 'facebook':
                shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
                break;
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
                break;
            case 'whatsapp':
                shareUrl = `https://wa.me/?text=${text}%20${url}`;
                break;
            case 'telegram':
                shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
                break;
        }
        
        if (shareUrl) {
            window.open(shareUrl, '_blank');
        }
        
        this.closeShareModal();
    },
    
    reportStore() {
        this.showToast('Report feature coming soon', 'info');
        this.closeMenuModal();
    },
    
    saveStore() {
        this.showToast('Store saved to your favorites', 'success');
        this.closeMenuModal();
    },
    
    getDirections() {
        const location = this.supplier.warehouse_location || this.supplier.profiles?.location || 'Kampala, Uganda';
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
        window.open(url, '_blank');
        this.closeMenuModal();
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeProductModal() {
        document.getElementById('productModal').classList.remove('show');
    },
    
    closeShareModal() {
        document.getElementById('shareModal').classList.remove('show');
    },
    
    closeMenuModal() {
        document.getElementById('menuModal').classList.remove('show');
    },
    
    // ============================================
    // UTILITY FUNCTIONS
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
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Product search
        let searchTimeout;
        document.getElementById('productSearch')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.filterProducts(), 300);
        });
        
        // Sort products
        document.getElementById('sortProducts')?.addEventListener('change', () => {
            this.filterProducts();
        });
        
        // Share button
        document.getElementById('shareStoreBtn').addEventListener('click', () => {
            this.shareStore();
        });
        
        // Menu button
        document.getElementById('menuBtn').addEventListener('click', () => {
            document.getElementById('menuModal').classList.add('show');
        });
        
        // FAB buttons
        document.getElementById('chatFAB').addEventListener('click', () => {
            this.startChat();
        });
        
        document.getElementById('inquiryFAB').addEventListener('click', () => {
            this.sendInquiry();
        });
        
        // Close modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.remove('show');
            });
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    StorePreview.init();
});

// Global functions
window.StorePreview = StorePreview;
window.switchTab = (tab) => StorePreview.switchTab(tab);
window.loadMoreProducts = () => StorePreview.loadMoreProducts();
window.loadMoreReviews = () => StorePreview.loadMoreReviews();
window.filterByCategory = (category) => {
    StorePreview.switchTab('products');
    document.getElementById('productSearch').value = category;
    StorePreview.filterProducts();
};
window.closeProductModal = () => StorePreview.closeProductModal();
window.closeShareModal = () => StorePreview.closeShareModal();
window.closeMenuModal = () => StorePreview.closeMenuModal();
window.copyStoreLink = () => StorePreview.copyStoreLink();
window.shareVia = (platform) => StorePreview.shareVia(platform);
window.reportStore = () => StorePreview.reportStore();
window.saveStore = () => StorePreview.saveStore();
window.getDirections = () => StorePreview.getDirections();