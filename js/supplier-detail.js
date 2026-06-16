// ============================================
// SUPPLIER SHOP PAGE - BuyUganda.online
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierDetail = {
    supplierId: null,
    supplier: null,
    storefront: {},
    companyProfile: {},
    allProducts: [],
    featuredProducts: { hot: [], new: [] },
    tips: [],
    currentUser: null,
    
    async init() {
        console.log('🚀 Supplier Shop initializing...');
        
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
            await this.loadAllProducts();
            await this.loadFeaturedProducts();
            await this.loadTips();
            
            this.renderSupplierHeaderInfo();
            this.renderBanner();
            this.renderStatsCards();
            this.renderCategories();
            this.renderTagline();
            this.renderHotProducts();
            this.renderNewArrivals();
            this.renderProfileTab();
            this.renderTips();
            this.renderProductsGrid();
            this.setupEventListeners();
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('supplierContent').style.display = 'block';
            
        } catch (error) {
            console.error('Error:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
        } catch (error) {
            console.error('Auth error:', error);
        }
    },
    
    async loadSupplier() {
        const { data, error } = await sb
            .from('suppliers')
            .select(`
                *,
                profiles!suppliers_profile_id_fkey (
                    avatar_url,
                    full_name,
                    location
                )
            `)
            .eq('id', this.supplierId)
            .single();
        
        if (error) throw error;
        this.supplier = data;
        console.log('✅ Supplier loaded:', this.supplier.business_name);
    },
    
    async loadStorefront() {
        const { data, error } = await sb
            .from('supplier_storefronts')
            .select('*')
            .eq('supplier_id', this.supplierId)
            .maybeSingle();
        
        if (!error && data) {
            this.storefront = data;
        }
    },
    
    async loadCompanyProfile() {
        const { data, error } = await sb
            .from('supplier_company_profiles')
            .select('*')
            .eq('supplier_id', this.supplierId)
            .maybeSingle();
        
        if (!error && data) {
            this.companyProfile = data;
        }
    },
    
    async loadAllProducts() {
        const { data, error } = await sb
            .from('ads')
            .select('*')
            .eq('supplier_id', this.supplierId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        if (!error) {
            this.allProducts = data || [];
            console.log(`✅ Loaded ${this.allProducts.length} products`);
        }
    },
    
    async loadFeaturedProducts() {
        const { data, error } = await sb
            .from('supplier_featured_products')
            .select('*, ads(*)')
            .eq('supplier_id', this.supplierId)
            .eq('is_active', true);
        
        if (!error && data) {
            this.featuredProducts.hot = data.filter(f => f.section === 'hot_selling') || [];
            this.featuredProducts.new = data.filter(f => f.section === 'new_arrivals') || [];
        }
    },
    
    async loadTips() {
        const { data, error } = await sb
            .from('supplier_tips')
            .select('*')
            .eq('supplier_id', this.supplierId)
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(6);
        
        if (!error) {
            this.tips = data || [];
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    
    renderSupplierHeaderInfo() {
        const headerAvatar = document.getElementById('headerAvatar');
        const headerName = document.getElementById('headerSupplierName');
        const headerMeta = document.getElementById('headerSupplierMeta');
        
        const profile = this.supplier.profiles || {};
        const initials = this.supplier.business_name?.substring(0, 2).toUpperCase() || 'BS';
        
        headerAvatar.innerHTML = profile.avatar_url ? 
            `<img src="${profile.avatar_url}" alt="${this.supplier.business_name}">` : 
            `<div class="avatar-placeholder">${initials}</div>`;
        
        headerName.textContent = this.supplier.business_name;
        
        const avgRating = this.supplier.avg_rating || 0;
        const reviewCount = this.supplier.review_count || 0;
        const location = this.supplier.district || profile.location || 'Uganda';
        
        headerMeta.innerHTML = `
            <span><i class="fas fa-star" style="color: #F59E0B;"></i> ${avgRating.toFixed(1)} (${reviewCount} reviews)</span>
            <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(location)}</span>
        `;
    },
    
    renderBanner() {
        const bannerSection = document.getElementById('bannerSection');
        const bannerImage = document.getElementById('bannerImage');
        const bannerTitle = document.getElementById('bannerTitle');
        const bannerSubtitle = document.getElementById('bannerSubtitle');
        const bannerButton = document.getElementById('bannerButton');
        
        if (this.storefront.banner_image_url) {
            bannerSection.style.display = 'block';
            bannerImage.innerHTML = `<img src="${this.storefront.banner_image_url}" alt="Store Banner">`;
            bannerTitle.textContent = this.storefront.banner_title || '';
            bannerSubtitle.textContent = this.storefront.banner_subtitle || '';
            bannerButton.textContent = this.storefront.banner_button_text || 'Learn More';
            bannerButton.href = this.storefront.banner_button_link || '#';
        }
    },
    
    renderStatsCards() {
        const container = document.getElementById('statsCards');
        const profile = this.companyProfile;
        
        const stats = [
            { 
                label: 'Products', 
                value: this.allProducts.length.toString() 
            },
            { 
                label: 'Rating', 
                value: (this.supplier.avg_rating || 0).toFixed(1) + '★' 
            },
            { 
                label: 'Reviews', 
                value: (this.supplier.review_count || 0).toString() 
            },
            { 
                label: 'Location', 
                value: this.supplier.district || 'Uganda' 
            }
        ];
        
        container.innerHTML = stats.map(stat => `
            <div class="stat-card">
                <div class="stat-value">${stat.value}</div>
                <div class="stat-label">${stat.label}</div>
            </div>
        `).join('');
    },
    
    renderCategories() {
        const container = document.getElementById('productCategories');
        const categories = new Set();
        
        this.allProducts.forEach(product => {
            if (product.category_id) {
                categories.add('Category');
            }
        });
        
        if (categories.size > 0) {
            container.innerHTML = Array.from(categories).slice(0, 6).map(cat => `
                <a href="#" class="category-pill" onclick="SupplierDetail.searchCategory('${cat}')">
                    <i class="fas fa-tag"></i> ${cat}
                </a>
            `).join('');
            container.style.display = 'flex';
        } else {
            container.style.display = 'none';
        }
    },
    
    renderTagline() {
        const taglineElement = document.getElementById('tagline');
        if (this.storefront.tagline) {
            taglineElement.style.display = 'block';
            taglineElement.textContent = this.storefront.tagline;
        }
    },
    
    renderHotProducts() {
        const container = document.getElementById('hotProductsGrid');
        const hotLabel = document.getElementById('hotLabel');
        const welcomeLabel = document.getElementById('welcomeLabel');
        
        if (hotLabel) hotLabel.textContent = this.storefront.hot_selling_title || 'HOT SELLING PRODUCT';
        if (welcomeLabel) welcomeLabel.textContent = this.storefront.hot_selling_subtitle || 'WELCOME TO OUR SHOP';
        
        let productsToShow = [];
        
        if (this.featuredProducts.hot.length > 0) {
            productsToShow = this.featuredProducts.hot.map(fp => fp.ads).filter(p => p);
        }
        
        if (productsToShow.length === 0 && this.allProducts.length > 0) {
            productsToShow = this.allProducts.slice(0, 4);
        }
        
        this.renderProductGrid(container, productsToShow);
    },
    
    renderNewArrivals() {
        const container = document.getElementById('newArrivalsGrid');
        const section = document.getElementById('newArrivalsSection');
        
        let productsToShow = [];
        
        if (this.featuredProducts.new.length > 0) {
            productsToShow = this.featuredProducts.new.map(fp => fp.ads).filter(p => p);
        }
        
        if (productsToShow.length === 0 && this.allProducts.length > 4) {
            productsToShow = this.allProducts.slice(0, 4);
        }
        
        if (productsToShow.length > 0) {
            section.style.display = 'block';
            this.renderProductGrid(container, productsToShow);
        } else {
            section.style.display = 'none';
        }
    },
    
    renderProductsGrid() {
        const container = document.getElementById('allProductsGrid');
        this.renderProductGrid(container, this.allProducts);
    },
    
    renderProductGrid(container, products) {
        if (!container) return;
        
        if (products.length === 0) {
            container.innerHTML = '<p class="text-muted">No products available</p>';
            return;
        }
        
        container.innerHTML = products.map(product => {
            const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/200?text=Product';
            const price = product.wholesale_price || product.price || 0;
            
            return `
                <a href="B2B-product-detail.html?id=${product.id}" class="product-card">
                    <div class="product-image">
                        <img src="${imageUrl}" alt="${this.escapeHtml(product.title)}" loading="lazy" onerror="this.src='https://via.placeholder.com/200?text=No+Image'">
                    </div>
                    <div class="product-info">
                        <div class="product-title">${this.escapeHtml(product.title)}</div>
                        <div class="product-price">UGX ${this.formatNumber(price)}</div>
                        <div class="product-moq">MOQ: ${product.moq || 1}</div>
                    </div>
                </a>
            `;
        }).join('');
    },
    
    filterProducts() {
        const searchTerm = document.getElementById('productSearchInput')?.value.toLowerCase() || '';
        const container = document.getElementById('allProductsGrid');
        
        const filtered = this.allProducts.filter(p => 
            p.title.toLowerCase().includes(searchTerm)
        );
        
        this.renderProductGrid(container, filtered);
    },
    
    searchProducts() {
        const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const container = document.getElementById('allProductsGrid');
        
        if (!query) {
            this.renderProductGrid(container, this.allProducts);
            return;
        }
        
        const filtered = this.allProducts.filter(p => 
            p.title.toLowerCase().includes(query)
        );
        
        this.renderProductGrid(container, filtered);
    },
    
    renderProfileTab() {
        const profile = this.companyProfile;
        
        const aboutEl = document.getElementById('aboutContent');
        aboutEl.innerHTML = profile.about || '<p class="text-muted">No information provided.</p>';
        
        const missionEl = document.getElementById('missionContent');
        missionEl.innerHTML = profile.mission || '<p class="text-muted">No mission statement provided.</p>';
        
        const visionEl = document.getElementById('visionContent');
        visionEl.innerHTML = profile.vision || '<p class="text-muted">No vision statement provided.</p>';
        
        const coreValues = profile.core_values || [];
        const coreValuesEl = document.getElementById('coreValues');
        coreValuesEl.innerHTML = coreValues.length ? 
            coreValues.map(v => `<span class="core-value-tag">${this.escapeHtml(v)}</span>`).join('') :
            '<p class="text-muted">No core values listed.</p>';
        
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
        
        const certifications = profile.certifications || [];
        const certEl = document.getElementById('certifications');
        certEl.innerHTML = certifications.length ? 
            certifications.map(cert => `
                <div class="certification-card">
                    ${cert.image_url ? 
                        `<img src="${cert.image_url}" class="cert-image">` : 
                        '<div class="cert-placeholder"><i class="fas fa-certificate"></i></div>'}
                    <div class="cert-info">
                        <div class="cert-name">${this.escapeHtml(cert.name)}</div>
                        <div class="cert-meta">${this.escapeHtml(cert.issuer || '')} · ${cert.year || ''}</div>
                    </div>
                </div>
            `).join('') :
            '<p class="text-muted">No certifications listed.</p>';
        
        const markets = profile.export_markets || [];
        const marketsEl = document.getElementById('exportMarkets');
        marketsEl.innerHTML = markets.length ?
            markets.map(m => `<span class="market-tag">${this.escapeHtml(m)}</span>`).join('') :
            '<p class="text-muted">No export markets listed.</p>';
        
        const timeline = profile.company_timeline || [];
        const timelineEl = document.getElementById('timeline');
        timelineEl.innerHTML = timeline.length ?
            timeline.map(event => `
                <div class="timeline-item">
                    <div class="timeline-year">${this.escapeHtml(event.year)}</div>
                    <div class="timeline-content">
                        <div class="timeline-title">${this.escapeHtml(event.title)}</div>
                        <div class="timeline-description">${this.escapeHtml(event.description || '')}</div>
                    </div>
                </div>
            `).join('') :
            '<p class="text-muted">No timeline events.</p>';
    },
    
    renderTips() {
        const container = document.getElementById('tipsGrid');
        
        if (this.tips.length === 0) {
            container.innerHTML = '<p class="text-muted">No tips or articles available.</p>';
            return;
        }
        
        container.innerHTML = this.tips.map(tip => `
            <div class="tip-card">
                ${tip.featured_image ? `<div class="tip-image"><img src="${tip.featured_image}" alt="${tip.title}" loading="lazy"></div>` : ''}
                <div class="tip-category">${tip.category || 'General'}</div>
                <h3 class="tip-title">${this.escapeHtml(tip.title)}</h3>
                <p class="tip-excerpt">${this.escapeHtml(tip.excerpt || (tip.content || '').substring(0, 100))}...</p>
            </div>
        `).join('');
    },
    
    // ============================================
    // SHARE FUNCTIONS
    // ============================================
    openShareModal() {
        const modal = document.getElementById('shareShopModal');
        const urlEl = document.getElementById('shareShopUrl');
        const shopUrl = `${window.location.origin}/supplier-detail.html?id=${this.supplierId}`;
        urlEl.textContent = shopUrl;
        modal.style.display = 'flex';
    },
    
    closeShareModal() {
        document.getElementById('shareShopModal').style.display = 'none';
    },
    
    copyShopUrl() {
        const url = document.getElementById('shareShopUrl')?.textContent;
        if (url) {
            navigator.clipboard.writeText(url);
            this.showToast('URL copied to clipboard!', 'success');
        }
    },
    
    shareToWhatsApp() {
        const url = `${window.location.origin}/supplier-detail.html?id=${this.supplierId}`;
        const message = `Check out ${this.supplier.business_name} on BuyUganda.online: ${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    },
    
    shareToFacebook() {
        const url = `${window.location.origin}/supplier-detail.html?id=${this.supplierId}`;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    },
    
    shareToTwitter() {
        const url = `${window.location.origin}/supplier-detail.html?id=${this.supplierId}`;
        const text = `Check out ${this.supplier.business_name} on BuyUganda.online`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    },
    
    shareToEmail() {
        const url = `${window.location.origin}/supplier-detail.html?id=${this.supplierId}`;
        const subject = `${this.supplier.business_name} on BuyUganda.online`;
        const body = `I found this supplier on BuyUganda.online: ${url}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },
    
    // ============================================
    // RATING FUNCTIONS - Redirect to rate-supplier.html
    // ============================================
    openRateModal() {
        // Redirect to rate-supplier.html page
        if (!this.currentUser) {
            this.showToast('Please login to rate this supplier', 'error');
            window.location.href = `login.html?redirect=rate-supplier.html?id=${this.supplierId}`;
            return;
        }
        
        // Navigate to the rate-supplier page
        window.location.href = `rate-supplier.html?id=${this.supplierId}`;
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    toggleSearch() {
        const searchBar = document.getElementById('searchBar');
        searchBar.classList.toggle('show');
        if (searchBar.classList.contains('show')) {
            document.getElementById('searchInput').focus();
        }
    },
    
    searchCategory(category) {
        window.location.href = `search.html?category=${encodeURIComponent(category)}&supplier=${this.supplierId}`;
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
    
    showToast(message, type) {
        const toast = document.getElementById('toast');
        const colors = { success: '#10B981', error: '#EF4444', info: '#6B21E5' };
        toast.textContent = message;
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
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
        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
        
        // Search toggle
        const searchToggle = document.getElementById('searchToggle');
        const searchClose = document.getElementById('searchClose');
        const searchInput = document.getElementById('searchInput');
        const productSearchInput = document.getElementById('productSearchInput');
        
        if (searchToggle) {
            searchToggle.addEventListener('click', () => this.toggleSearch());
        }
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                document.getElementById('searchBar').classList.remove('show');
                if (searchInput) searchInput.value = '';
                this.renderProductGrid(document.getElementById('allProductsGrid'), this.allProducts);
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', () => this.searchProducts());
        }
        if (productSearchInput) {
            productSearchInput.addEventListener('input', () => this.filterProducts());
        }
        
        // Share buttons
        const shareShopBtn = document.getElementById('shareShopBtn');
        const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
        const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
        const shareFacebookBtn = document.getElementById('shareFacebookBtn');
        const shareTwitterBtn = document.getElementById('shareTwitterBtn');
        const shareEmailBtn = document.getElementById('shareEmailBtn');
        
        if (shareShopBtn) shareShopBtn.addEventListener('click', () => this.openShareModal());
        if (copyShareUrlBtn) copyShareUrlBtn.addEventListener('click', () => this.copyShopUrl());
        if (shareWhatsappBtn) shareWhatsappBtn.addEventListener('click', () => this.shareToWhatsApp());
        if (shareFacebookBtn) shareFacebookBtn.addEventListener('click', () => this.shareToFacebook());
        if (shareTwitterBtn) shareTwitterBtn.addEventListener('click', () => this.shareToTwitter());
        if (shareEmailBtn) shareEmailBtn.addEventListener('click', () => this.shareToEmail());
        
        // Rate button - redirects to rate-supplier.html
        const rateSupplierBtn = document.getElementById('rateSupplierBtn');
        if (rateSupplierBtn) {
            rateSupplierBtn.addEventListener('click', () => this.openRateModal());
        }
        
        // Modal close on overlay (for share modal only)
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => {
                const shareModal = document.getElementById('shareShopModal');
                if (shareModal) {
                    shareModal.style.display = 'none';
                }
            });
        });
    }
};

// Global functions
window.SupplierDetail = SupplierDetail;
window.closeShareModal = () => SupplierDetail.closeShareModal();
window.searchCategory = (cat) => SupplierDetail.searchCategory(cat);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    SupplierDetail.init();
});
