// ============================================
// SUPPLIER DETAIL PAGE - COMPLETE WITH SEO & ROUTING
// ============================================

console.log('🚀 Supplier detail page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const SupplierDetail = {
    supplierId: null,
    supplier: null,
    storefront: {},
    companyProfile: {},
    customStats: [],
    categoryDisplays: [],
    featuredProducts: {
        hot: [],
        new: []
    },
    allProducts: [],
    tips: [],
    shopUrl: null,
    
    // ============================================
    // INITIALIZATION - WITH ROUTING SUPPORT
    // ============================================
    async init() {
        console.log('Initializing supplier detail...');
        
        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        let supplierId = urlParams.get('id');
        const supplierSlug = urlParams.get('slug');
        
        // Try to get supplier by ID first
        if (supplierId) {
            console.log('Found supplier ID in URL:', supplierId);
            this.supplierId = supplierId;
        }
        
        // If no ID but slug exists, find by slug
        if (!this.supplierId && supplierSlug) {
            console.log('Looking up supplier by slug from URL:', supplierSlug);
            const { data, error } = await sb
                .from('suppliers')
                .select('id')
                .eq('shop_slug', supplierSlug)
                .maybeSingle();
            
            if (!error && data) {
                this.supplierId = data.id;
                console.log('Found supplier ID from slug:', this.supplierId);
            }
        }
        
        // If still no ID, check sessionStorage (from 404.html redirect)
        if (!this.supplierId) {
            const storedSlug = sessionStorage.getItem('supplier_slug');
            if (storedSlug) {
                console.log('Found stored slug in sessionStorage:', storedSlug);
                const { data, error } = await sb
                    .from('suppliers')
                    .select('id, shop_slug')
                    .eq('shop_slug', storedSlug)
                    .maybeSingle();
                
                if (!error && data) {
                    this.supplierId = data.id;
                    console.log('Found supplier from stored slug:', this.supplierId);
                    // Clean up sessionStorage
                    sessionStorage.removeItem('supplier_slug');
                    
                    // Update URL to clean format (optional)
                    if (data.shop_slug) {
                        const newUrl = `/${data.shop_slug}`;
                        window.history.replaceState({}, '', newUrl);
                    }
                }
            }
        }
        
        // Check if we have a supplier ID
        if (!this.supplierId) {
            console.error('No supplier ID or slug found');
            this.showError();
            return;
        }
        
        console.log(`📊 Loading supplier ${this.supplierId}...`);
        
        try {
            await Promise.all([
                this.loadSupplier(),
                this.loadStorefront(),
                this.loadCompanyProfile(),
                this.loadCustomStats(),
                this.loadCategoryDisplays(),
                this.loadAllProducts(),
                this.loadFeaturedProducts(),
                this.loadTips()
            ]);
            
            this.renderSupplierHeader();
            this.updateSEOMetaTags(); // SEO optimization
            this.generateAndRenderShopUrl();
            this.renderBanner();
            this.renderStats();
            this.renderCategories();
            this.renderTagline();
            this.renderHotProducts();
            this.renderNewArrivals();
            this.renderProfileTab();
            this.renderTips();
            this.addShareButton();
            
            // Pre-render all products grid for products tab
            const allProductsGrid = document.getElementById('allProductsGrid');
            if (allProductsGrid) {
                this.renderProductGrid(allProductsGrid, this.allProducts);
            }
            
            this.setupTabListeners();
            this.setupEventListeners();
            
            // Hide loading, show content
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('supplierContent').style.display = 'block';
            
            console.log('✅ Supplier detail page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showError();
        }
    },
    
    // ============================================
    // SEO OPTIMIZATION FUNCTIONS
    // ============================================
    updateSEOMetaTags() {
        if (!this.supplier) return;
        
        const name = this.supplier.business_name;
        const location = this.supplier.profiles?.location || this.supplier.warehouse_district || 'Uganda';
        const rating = this.supplier.avg_rating || 0;
        const reviewCount = this.supplier.review_count || 0;
        const isVerified = this.supplier.verification_status === 'verified';
        const slug = this.supplier.shop_slug || this.generateShopUrl().replace('/', '');
        const fullUrl = `https://schistonline.github.io/${slug}`;
        
        // Update page title
        const title = `${name} - ${isVerified ? 'Verified ' : ''}Supplier | Schist.online Uganda B2B Marketplace`;
        document.title = title;
        
        // Update meta description
        const description = `Find quality products from ${name}, a ${isVerified ? 'verified' : 'trusted'} supplier in ${location}. ${rating > 0 ? `${rating.toFixed(1)}★ (${reviewCount} reviews)` : 'Shop wholesale prices'} on Schist.online Uganda.`;
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = 'description';
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = description;
        
        // Update meta keywords
        const keywords = `${name}, supplier, wholesale, ${location}, B2B, Uganda, business, manufacturer, distributor, products, ${this.categoryDisplays.map(c => c.category_name).join(', ')}`;
        let metaKeywords = document.querySelector('meta[name="keywords"]');
        if (!metaKeywords) {
            metaKeywords = document.createElement('meta');
            metaKeywords.name = 'keywords';
            document.head.appendChild(metaKeywords);
        }
        metaKeywords.content = keywords;
        
        // Open Graph / Facebook meta tags
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
            ogTitle = document.createElement('meta');
            ogTitle.setAttribute('property', 'og:title');
            document.head.appendChild(ogTitle);
        }
        ogTitle.content = `${name} | Schist.online`;
        
        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (!ogDesc) {
            ogDesc = document.createElement('meta');
            ogDesc.setAttribute('property', 'og:description');
            document.head.appendChild(ogDesc);
        }
        ogDesc.content = description;
        
        let ogUrl = document.querySelector('meta[property="og:url"]');
        if (!ogUrl) {
            ogUrl = document.createElement('meta');
            ogUrl.setAttribute('property', 'og:url');
            document.head.appendChild(ogUrl);
        }
        ogUrl.content = fullUrl;
        
        let ogImage = document.querySelector('meta[property="og:image"]');
        if (!ogImage) {
            ogImage = document.createElement('meta');
            ogImage.setAttribute('property', 'og:image');
            document.head.appendChild(ogImage);
        }
        ogImage.content = this.supplier.profiles?.avatar_url || 'https://schistonline.github.io/images/default-supplier-og.jpg';
        
        let ogType = document.querySelector('meta[property="og:type"]');
        if (!ogType) {
            ogType = document.createElement('meta');
            ogType.setAttribute('property', 'og:type');
            document.head.appendChild(ogType);
        }
        ogType.content = 'website';
        
        // Twitter Card meta tags
        let twitterCard = document.querySelector('meta[name="twitter:card"]');
        if (!twitterCard) {
            twitterCard = document.createElement('meta');
            twitterCard.name = 'twitter:card';
            document.head.appendChild(twitterCard);
        }
        twitterCard.content = 'summary_large_image';
        
        let twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (!twitterTitle) {
            twitterTitle = document.createElement('meta');
            twitterTitle.name = 'twitter:title';
            document.head.appendChild(twitterTitle);
        }
        twitterTitle.content = `${name} | Schist.online`;
        
        let twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (!twitterDesc) {
            twitterDesc = document.createElement('meta');
            twitterDesc.name = 'twitter:description';
            document.head.appendChild(twitterDesc);
        }
        twitterDesc.content = description;
        
        let twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (!twitterImage) {
            twitterImage = document.createElement('meta');
            twitterImage.name = 'twitter:image';
            document.head.appendChild(twitterImage);
        }
        twitterImage.content = this.supplier.profiles?.avatar_url || 'https://schistonline.github.io/images/default-supplier-og.jpg';
        
        // Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = fullUrl;
        
        // Structured Data (JSON-LD) for rich snippets
        this.updateStructuredData(name, description, fullUrl, rating, reviewCount, location);
        
        console.log('✅ SEO meta tags updated for:', name);
    },
    
    updateStructuredData(name, description, url, rating, reviewCount, location) {
        const structuredData = {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": name,
            "description": description,
            "url": url,
            "telephone": this.supplier.business_phone || "",
            "email": this.supplier.business_email || "",
            "address": {
                "@type": "PostalAddress",
                "addressLocality": location,
                "addressCountry": "UG"
            },
            "priceRange": "$$",
            "areaServed": "Uganda",
            "image": this.supplier.profiles?.avatar_url || "https://schistonline.github.io/images/default-supplier-og.jpg",
            "brand": {
                "@type": "Brand",
                "name": name
            }
        };
        
        // Add rating if available
        if (rating > 0) {
            structuredData.aggregateRating = {
                "@type": "AggregateRating",
                "ratingValue": rating,
                "reviewCount": reviewCount
            };
        }
        
        // Add opening hours if available
        if (this.supplier.business_hours) {
            structuredData.openingHours = this.supplier.business_hours;
        }
        
        // Add products as offers
        if (this.allProducts && this.allProducts.length > 0) {
            structuredData.makesOffer = this.allProducts.slice(0, 5).map(product => ({
                "@type": "Offer",
                "itemOffered": {
                    "@type": "Product",
                    "name": product.title,
                    "description": product.title,
                    "price": product.wholesale_price || product.price,
                    "priceCurrency": "UGX"
                },
                "availability": "https://schema.org/InStock"
            }));
        }
        
        // Remove undefined fields
        Object.keys(structuredData).forEach(key => {
            if (structuredData[key] === undefined || structuredData[key] === "") {
                delete structuredData[key];
            }
        });
        
        // Update or create JSON-LD script tag
        let scriptTag = document.getElementById('structuredData');
        if (!scriptTag) {
            scriptTag = document.createElement('script');
            scriptTag.id = 'structuredData';
            scriptTag.type = 'application/ld+json';
            document.head.appendChild(scriptTag);
        }
        scriptTag.innerHTML = JSON.stringify(structuredData, null, 2);
    },
    
    // ============================================
    // LOAD DATA
    // ============================================
    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    *,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        location,
                        phone,
                        email,
                        full_name,
                        is_verified
                    )
                `)
                .eq('id', this.supplierId)
                .single();

            if (error) throw error;
            
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier.business_name);
            
        } catch (error) {
            console.error('❌ Error loading supplier:', error);
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
            
        } catch (error) {
            console.error('❌ Error loading storefront:', error);
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
            
        } catch (error) {
            console.error('❌ Error loading company profile:', error);
            this.companyProfile = {};
        }
    },
    
    async loadCustomStats() {
        try {
            const { data, error } = await sb
                .from('supplier_custom_stats')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });
            
            if (error) throw error;
            this.customStats = data || [];
            
        } catch (error) {
            console.error('❌ Error loading custom stats:', error);
            this.customStats = [];
        }
    },
    
    async loadCategoryDisplays() {
        try {
            const { data, error } = await sb
                .from('supplier_category_displays')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });
            
            if (error) throw error;
            this.categoryDisplays = data || [];
            
        } catch (error) {
            console.error('❌ Error loading category displays:', error);
            this.categoryDisplays = [];
        }
    },
    
    async loadAllProducts() {
        try {
            console.log('🔍 Loading products for supplier:', this.supplierId);
            
            const { data, error } = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    price,
                    wholesale_price,
                    currency,
                    image_urls,
                    moq,
                    created_at
                `)
                .eq('supplier_id', this.supplierId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error loading products:', error);
                throw error;
            }
            
            console.log(`✅ Loaded ${data?.length || 0} products:`, data);
            this.allProducts = data || [];
            
        } catch (error) {
            console.error('❌ Error loading products:', error);
            this.allProducts = [];
        }
    },
    
    async loadFeaturedProducts() {
        try {
            const { data, error } = await sb
                .from('supplier_featured_products')
                .select('*, ads(*)')
                .eq('supplier_id', this.supplierId)
                .eq('is_active', true);
            
            if (error) throw error;
            
            this.featuredProducts.hot = data?.filter(f => f.section === 'hot_selling') || [];
            this.featuredProducts.new = data?.filter(f => f.section === 'new_arrivals') || [];
            
        } catch (error) {
            console.error('❌ Error loading featured products:', error);
            this.featuredProducts = { hot: [], new: [] };
        }
    },
    
    async loadTips() {
        try {
            const { data, error } = await sb
                .from('supplier_tips')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .eq('is_published', true)
                .order('published_at', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            this.tips = data || [];
            console.log(`✅ Loaded ${this.tips.length} tips`);
            
        } catch (error) {
            console.error('❌ Error loading tips:', error);
            this.tips = [];
        }
    },
    
    // ============================================
    // SHOP URL FUNCTIONS
    // ============================================
    generateShopUrl() {
        if (!this.supplier) return null;
        
        if (this.supplier.shop_slug) {
            return `/${this.supplier.shop_slug}`;
        }
        
        const slug = this.supplier.business_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        
        return `/${slug}`;
    },
    
    getFullShopUrl() {
        const path = this.generateShopUrl();
        if (!path) return null;
        return `https://schistonline.github.io${path}`;
    },
    
    generateAndRenderShopUrl() {
        const shopUrl = this.getFullShopUrl();
        if (!shopUrl) return;
        
        this.shopUrl = shopUrl;
        
        const shopUrlBanner = document.getElementById('shopUrlBanner');
        const shopUrlCode = document.getElementById('shopUrlCode');
        
        if (shopUrlBanner && shopUrlCode) {
            shopUrlCode.textContent = shopUrl;
            shopUrlBanner.style.display = 'block';
        }
        
        const shareShopUrl = document.getElementById('shareShopUrl');
        if (shareShopUrl) {
            shareShopUrl.textContent = shopUrl;
        }
    },
    
    // ============================================
    // SHARE FUNCTIONS
    // ============================================
    addShareButton() {
        const headerRight = document.getElementById('headerRight');
        if (!headerRight) return;
        
        if (document.querySelector('.share-shop-btn')) return;
        
        const shareBtn = document.createElement('button');
        shareBtn.className = 'share-shop-btn';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i><span>Share Shop</span>';
        shareBtn.onclick = () => this.openShareModal();
        
        headerRight.appendChild(shareBtn);
    },
    
    openShareModal() {
        const modal = document.getElementById('shareShopModal');
        const shareUrlElement = document.getElementById('shareShopUrl');
        
        if (shareUrlElement && this.shopUrl) {
            shareUrlElement.textContent = this.shopUrl;
        }
        
        if (modal) {
            modal.style.display = 'flex';
        }
    },
    
    closeShareShopModal() {
        const modal = document.getElementById('shareShopModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },
    
    shareToWhatsApp() {
        if (!this.shopUrl) return;
        const message = `Check out ${this.supplier.business_name} on Schist.online: ${this.shopUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    },
    
    shareToFacebook() {
        if (!this.shopUrl) return;
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shopUrl)}`;
        window.open(url, '_blank', 'width=600,height=400');
    },
    
    shareToTwitter() {
        if (!this.shopUrl) return;
        const message = `Check out ${this.supplier.business_name} on Schist.online`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(this.shopUrl)}`;
        window.open(url, '_blank', 'width=600,height=400');
    },
    
    shareToEmail() {
        if (!this.shopUrl) return;
        const subject = `Check out ${this.supplier.business_name} on Schist.online`;
        const body = `I found this supplier on Schist.online: ${this.shopUrl}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    },
    
    copyShopUrl() {
        if (!this.shopUrl) return;
        
        navigator.clipboard.writeText(this.shopUrl).then(() => {
            this.showToast('Shop URL copied to clipboard!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy URL', 'error');
        });
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderSupplierHeader() {
        const profile = this.supplier.profiles || {};
        const name = this.supplier.business_name;
        const initials = name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BS';
        const location = profile.location || this.supplier.warehouse_district || 'Uganda';
        const years = this.supplier.year_established ? 
            `${new Date().getFullYear() - parseInt(this.supplier.year_established)} yrs` : '6 yrs';
        const orders = this.formatNumber(this.supplier.total_orders || 1000) + '+';
        
        const avatarContainer = document.getElementById('supplierAvatar');
        if (avatarContainer) {
            avatarContainer.innerHTML = profile.avatar_url ? 
                `<img src="${profile.avatar_url}" alt="${name}">` : 
                initials;
        }
        
        const nameElement = document.getElementById('supplierName');
        if (nameElement) nameElement.textContent = name;
        
        const statsContainer = document.getElementById('supplierStats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <span><i class="far fa-calendar-alt"></i> ${years}</span>
                <span><i class="fas fa-map-marker-alt"></i> ${location}</span>
                <span><i class="fas fa-chart-line"></i> ${orders} orders</span>
            `;
        }
        
        const badgesContainer = document.getElementById('supplierBadges');
        if (badgesContainer) {
            let badgesHtml = '';
            if (this.supplier.verification_status === 'verified') {
                badgesHtml += '<span class="verified-badge-compact"><i class="fas fa-check-circle"></i> Verified</span>';
            }
            if (this.supplier.is_featured) {
                badgesHtml += '<span class="featured-badge-compact"><i class="fas fa-star"></i> Featured</span>';
            }
            badgesContainer.innerHTML = badgesHtml;
        }
    },
    
    renderBanner() {
        const bannerSection = document.getElementById('bannerSection');
        const bannerImage = document.getElementById('bannerImage');
        const bannerTitle = document.getElementById('bannerTitle');
        const bannerSubtitle = document.getElementById('bannerSubtitle');
        const bannerButton = document.getElementById('bannerButton');
        
        if (!bannerSection) return;
        
        if (this.storefront.banner_image_url) {
            bannerSection.style.display = 'block';
            bannerImage.innerHTML = `<img src="${this.storefront.banner_image_url}" alt="Store Banner">`;
            bannerTitle.textContent = this.storefront.banner_title || '';
            bannerSubtitle.textContent = this.storefront.banner_subtitle || '';
            bannerButton.textContent = this.storefront.banner_button_text || 'Learn More';
            bannerButton.href = this.storefront.banner_button_link || '#';
        } else {
            bannerSection.style.display = 'none';
        }
    },
    
    renderStats() {
        const statsContainer = document.getElementById('statsCards');
        if (!statsContainer) return;
        
        if (this.customStats.length > 0) {
            statsContainer.innerHTML = this.customStats.map(stat => `
                <div class="stat-card">
                    <span class="stat-value">${stat.value}</span>
                    <span class="stat-label">${stat.label}</span>
                </div>
            `).join('');
        } else {
            const years = this.supplier.year_established ? 
                `${new Date().getFullYear() - parseInt(this.supplier.year_established)}+` : '15+';
            
            statsContainer.innerHTML = `
                <div class="stat-card">
                    <span class="stat-value">${years}</span>
                    <span class="stat-label">YEARS<br>EXPERIENCE</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${this.formatNumber(this.supplier.total_orders * 1000 || 10000)}+</span>
                    <span class="stat-label">PRODUCTS<br>SOLD</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${this.allProducts.length}</span>
                    <span class="stat-label">ACTIVE<br>PRODUCTS</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${this.supplier.completion_rate || 98}%</span>
                    <span class="stat-label">ORDER<br>COMPLETION</span>
                </div>
            `;
        }
    },
    
    renderCategories() {
        const container = document.getElementById('productCategories');
        if (!container) return;
        
        if (this.categoryDisplays.length > 0) {
            container.innerHTML = this.categoryDisplays.map(cat => `
                <a href="#" class="category-pill" onclick="SupplierDetail.searchCategory('${cat.category_name}')">
                    <i class="fas ${cat.icon}"></i> ${cat.category_name}
                </a>
            `).join('');
            container.style.display = 'flex';
        } else {
            const categories = new Set();
            this.allProducts.forEach(product => {
                const title = product.title.toLowerCase();
                if (title.includes('scooter')) categories.add('Electric Scooter');
                else if (title.includes('motorcycle')) categories.add('Motorcycle');
                else if (title.includes('bike')) categories.add('E-Bike');
                else if (title.includes('part')) categories.add('Parts');
            });
            
            if (categories.size > 0) {
                container.innerHTML = Array.from(categories).map(cat => {
                    const icon = cat.includes('Scooter') ? 'fa-motorcycle' : 
                                cat.includes('Motorcycle') ? 'fa-gas-pump' :
                                cat.includes('Bike') ? 'fa-bicycle' : 'fa-cog';
                    
                    return `<a href="#" class="category-pill" onclick="SupplierDetail.searchCategory('${cat}')">
                        <i class="fas ${icon}"></i> ${cat}
                    </a>`;
                }).join('');
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        }
    },
    
    renderTagline() {
        const taglineElement = document.getElementById('tagline');
        if (!taglineElement) return;
        
        if (this.storefront.tagline) {
            taglineElement.style.display = 'block';
            taglineElement.textContent = this.storefront.tagline;
        } else {
            taglineElement.style.display = 'none';
        }
    },
    
    renderHotProducts() {
        const container = document.getElementById('hotProductsGrid');
        const hotLabel = document.getElementById('hotLabel');
        const welcomeLabel = document.getElementById('welcomeLabel');
        
        if (!container) return;
        
        if (hotLabel) hotLabel.textContent = this.storefront.hot_selling_title || 'HOT SELLING PRODUCT';
        if (welcomeLabel) welcomeLabel.textContent = this.storefront.hot_selling_subtitle || 'WELCOME TO OUR COUNTRY';
        
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
        
        if (!container || !section) return;
        
        let productsToShow = [];
        
        if (this.featuredProducts.new.length > 0) {
            productsToShow = this.featuredProducts.new.map(fp => fp.ads).filter(p => p);
        }
        
        if (productsToShow.length === 0 && this.allProducts.length > 4) {
            productsToShow = this.allProducts.slice(4, 8);
        }
        
        if (productsToShow.length > 0) {
            section.style.display = 'block';
            this.renderProductGrid(container, productsToShow);
        } else {
            section.style.display = 'none';
        }
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
                        <div class="product-title">${this.escapeHtml(product.title) || 'Product'}</div>
                        <div class="product-price">UGX ${this.formatNumber(price)}</div>
                        <div class="product-moq">MOQ: ${product.moq || 1} pcs</div>
                    </div>
                </a>
            `;
        }).join('');
    },
    
    renderProfileTab() {
        const profile = this.companyProfile;
        
        const aboutEl = document.getElementById('aboutContent');
        if (aboutEl) aboutEl.innerHTML = profile.about || '<p class="text-muted">No information provided.</p>';
        
        const missionEl = document.getElementById('missionContent');
        if (missionEl) missionEl.innerHTML = profile.mission || '<p class="text-muted">No mission statement provided.</p>';
        
        const visionEl = document.getElementById('visionContent');
        if (visionEl) visionEl.innerHTML = profile.vision || '<p class="text-muted">No vision statement provided.</p>';
        
        const coreValues = profile.core_values || [];
        const coreValuesEl = document.getElementById('coreValues');
        if (coreValuesEl) {
            if (coreValues.length > 0) {
                coreValuesEl.innerHTML = coreValues.map(value => 
                    `<span class="core-value-tag">${this.escapeHtml(value)}</span>`
                ).join('');
            } else {
                coreValuesEl.innerHTML = '<p class="text-muted">No core values listed.</p>';
            }
        }
        
        const facilitiesEl = document.getElementById('facilities');
        if (facilitiesEl) {
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
        }
        
        const certifications = profile.certifications || [];
        const certEl = document.getElementById('certifications');
        if (certEl) {
            if (certifications.length > 0) {
                certEl.innerHTML = certifications.map(cert => `
                    <div class="certification-card">
                        ${cert.image_url ? 
                            `<img src="${cert.image_url}" alt="${cert.name}" class="cert-image">` : 
                            '<div class="cert-placeholder"><i class="fas fa-certificate"></i></div>'}
                        <div class="cert-info">
                            <div class="cert-name">${this.escapeHtml(cert.name)}</div>
                            <div class="cert-meta">${this.escapeHtml(cert.issuer || '')} · ${cert.year || ''}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                certEl.innerHTML = '<p class="text-muted">No certifications listed.</p>';
            }
        }
        
        const markets = profile.export_markets || [];
        const marketsEl = document.getElementById('exportMarkets');
        if (marketsEl) {
            if (markets.length > 0) {
                marketsEl.innerHTML = markets.map(market => 
                    `<span class="market-tag">${this.escapeHtml(market)}</span>`
                ).join('');
            } else {
                marketsEl.innerHTML = '<p class="text-muted">No export markets listed.</p>';
            }
        }
        
        const timeline = profile.company_timeline || [];
        const timelineEl = document.getElementById('timeline');
        if (timelineEl) {
            if (timeline.length > 0) {
                timelineEl.innerHTML = timeline.map(event => `
                    <div class="timeline-item">
                        <div class="timeline-year">${this.escapeHtml(event.year)}</div>
                        <div class="timeline-content">
                            <div class="timeline-title">${this.escapeHtml(event.title)}</div>
                            <div class="timeline-description">${this.escapeHtml(event.description || '')}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                timelineEl.innerHTML = '<p class="text-muted">No timeline events.</p>';
            }
        }
    },
    
    renderTips() {
        const container = document.getElementById('tipsGrid');
        if (!container) return;
        
        if (this.tips.length === 0) {
            container.innerHTML = '<p class="text-muted">No tips or articles available.</p>';
            return;
        }
        
        container.innerHTML = this.tips.map(tip => {
            const date = tip.published_at || tip.created_at;
            const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { 
                year: 'numeric', month: 'short', day: 'numeric' 
            }) : '';
            
            return `
                <div class="tip-card">
                    ${tip.featured_image ? 
                        `<div class="tip-image"><img src="${tip.featured_image}" alt="${tip.title}"></div>` : 
                        ''}
                    <div class="tip-category">${tip.category || 'General'}</div>
                    <h3 class="tip-title">${this.escapeHtml(tip.title)}</h3>
                    <p class="tip-excerpt">${this.escapeHtml(tip.excerpt || tip.content.substring(0, 100))}...</p>
                    <div class="tip-footer">
                        <span class="tip-date">${formattedDate}</span>
                        <span class="tip-views"><i class="far fa-eye"></i> ${tip.view_count || 0}</span>
                    </div>
                </div>
            `;
        }).join('');
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
    
    showToast(message, type) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        const colors = { success: '#10B981', error: '#EF4444', info: '#6B21E5' };
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    
    // ============================================
    // SEARCH FUNCTIONS
    // ============================================
    searchCategory(category) {
        window.location.href = `search.html?category=${encodeURIComponent(category)}&supplier=${this.supplierId}`;
    },
    
    filterProducts() {
        const searchTerm = document.getElementById('productSearchInput')?.value.toLowerCase() || '';
        const container = document.getElementById('allProductsGrid');
        
        if (!container) return;
        
        const filtered = this.allProducts.filter(p => 
            p.title.toLowerCase().includes(searchTerm)
        );
        
        if (filtered.length === 0) {
            container.innerHTML = '<p class="text-muted">No products match your search</p>';
            return;
        }
        
        this.renderProductGrid(container, filtered);
    },
    
    // ============================================
    // ACTIONS
    // ============================================
    contactSupplier() {
        sb.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                window.location.href = `chat.html?user=${this.supplierId}`;
            } else {
                window.location.href = `login.html?redirect=supplier-detail.html?id=${this.supplierId}`;
            }
        });
    },
    
    sendInquiry() {
        sb.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                window.location.href = `send-inquiry.html?supplier=${this.supplierId}`;
            } else {
                window.location.href = `login.html?redirect=send-inquiry.html&supplier=${this.supplierId}`;
            }
        });
    },
    
    // ============================================
    // TAB NAVIGATION
    // ============================================
    setupTabListeners() {
        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = e.target.dataset.tab;
                
                document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`tab-${tabId}`).classList.add('active');
                
                if (tabId === 'products') {
                    const allProductsGrid = document.getElementById('allProductsGrid');
                    if (allProductsGrid && allProductsGrid.children.length === 0) {
                        this.renderProductGrid(allProductsGrid, this.allProducts);
                    }
                }
            });
        });
    },
    
    // ============================================
    // ERROR HANDLING
    // ============================================
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
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
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Search toggle
        const searchToggle = document.getElementById('searchToggle');
        if (searchToggle) {
            searchToggle.addEventListener('click', () => {
                this.toggleSearch();
            });
        }
        
        const searchClose = document.getElementById('searchClose');
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                document.getElementById('searchBar').classList.remove('show');
            });
        }
        
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value;
                    window.location.href = `search.html?q=${encodeURIComponent(query)}&supplier=${this.supplierId}`;
                }
            });
        }
        
        // Product search in products tab
        const productSearch = document.getElementById('productSearchInput');
        if (productSearch) {
            productSearch.addEventListener('input', () => {
                this.filterProducts();
            });
        }
        
        // Copy shop URL button
        const copyUrlBtn = document.getElementById('copyShopUrlBtn');
        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', () => {
                this.copyShopUrl();
            });
        }
        
        // Bottom nav share button
        const shareShopBottomBtn = document.getElementById('shareShopBottomBtn');
        if (shareShopBottomBtn) {
            shareShopBottomBtn.addEventListener('click', () => {
                this.openShareModal();
            });
        }
        
        // Rate Supplier button
        const rateSupplierBtn = document.getElementById('rateSupplierBtn');
        if (rateSupplierBtn) {
            rateSupplierBtn.addEventListener('click', () => {
                if (this.supplierId) {
                    console.log('🔗 Redirecting to rate-supplier.html with ID:', this.supplierId);
                    window.location.href = `rate-supplier.html?id=${this.supplierId}`;
                } else {
                    console.error('❌ No supplier ID found');
                    this.showToast('Supplier not found', 'error');
                }
            });
        }
        
        // Send Inquiry button
        const sendInquiryBtn = document.getElementById('sendInquiryBtn');
        if (sendInquiryBtn) {
            sendInquiryBtn.addEventListener('click', () => {
                this.sendInquiry();
            });
        }
        
        // Share modal buttons
        const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
        if (copyShareUrlBtn) {
            copyShareUrlBtn.addEventListener('click', () => {
                this.copyShopUrl();
                this.closeShareShopModal();
            });
        }
        
        const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
        if (shareWhatsappBtn) {
            shareWhatsappBtn.addEventListener('click', () => {
                this.shareToWhatsApp();
                this.closeShareShopModal();
            });
        }
        
        const shareFacebookBtn = document.getElementById('shareFacebookBtn');
        if (shareFacebookBtn) {
            shareFacebookBtn.addEventListener('click', () => {
                this.shareToFacebook();
                this.closeShareShopModal();
            });
        }
        
        const shareTwitterBtn = document.getElementById('shareTwitterBtn');
        if (shareTwitterBtn) {
            shareTwitterBtn.addEventListener('click', () => {
                this.shareToTwitter();
                this.closeShareShopModal();
            });
        }
        
        const shareEmailBtn = document.getElementById('shareEmailBtn');
        if (shareEmailBtn) {
            shareEmailBtn.addEventListener('click', () => {
                this.shareToEmail();
                this.closeShareShopModal();
            });
        }
        
        // Modal close on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    SupplierDetail.init();
});

// Make functions globally available
window.SupplierDetail = SupplierDetail;
window.closeShareShopModal = () => SupplierDetail.closeShareShopModal();
