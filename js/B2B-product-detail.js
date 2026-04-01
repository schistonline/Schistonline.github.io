// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Chat project configuration
const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const ProductDetail = {
    currentUser: null,
    productData: null,
    supplierData: null,
    supplierProfile: null,
    supplierId: null,
    variants: [],
    currentVariant: null,
    productVideos: [],
    bulkPricing: [],
    selectedQuantity: 1,
    isSaved: false,
    swiperInstance: null,
    relatedSwiperInstance: null,
    chatConversationId: null,

    // Get product ID from URL
    productId: new URLSearchParams(window.location.search).get('id'),

    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📦 Loading product details for ID:', this.productId);
        
        if (!this.productId) {
            this.showToast('Product not found', 'error');
            setTimeout(() => window.history.back(), 2000);
            return;
        }
        
        await this.checkAuth();
        await this.loadProductData();
        this.setupEventListeners();
        await this.checkPendingInquiry();
    },

    // ============================================
    // CHECK AUTHENTICATION
    // ============================================
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
            
            if (this.currentUser) {
                console.log('✅ User logged in:', this.currentUser.id);
                await this.checkIfSaved();
            }
        } catch (error) {
            console.error('❌ Auth error:', error);
            this.currentUser = null;
        }
    },

    // ============================================
    // CHECK IF PRODUCT IS SAVED
    // ============================================
    async checkIfSaved() {
        if (!this.currentUser || !this.productId) return;
        
        try {
            const { data } = await sb
                .from('saved_ads')
                .select('id')
                .eq('user_id', this.currentUser.id)
                .eq('ad_id', this.productId)
                .maybeSingle();
            
            this.isSaved = !!data;
            this.updateSaveButton();
        } catch (error) {
            console.error('Error checking saved status:', error);
        }
    },

    // ============================================
    // LOAD PRODUCT DATA
    // ============================================
    async loadProductData() {
        try {
            // Load ad details with seller profile
            const { data: ad, error: adError } = await sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        id,
                        full_name,
                        email,
                        phone,
                        avatar_url,
                        location,
                        district,
                        is_verified,
                        business_name,
                        is_supplier,
                        created_at
                    ),
                    category:categories!ads_category_id_fkey (
                        id,
                        name,
                        slug
                    ),
                    subcategory:categories!ads_subcategory_id_fkey (
                        id,
                        name,
                        slug
                    )
                `)
                .eq('id', this.productId)
                .single();

            if (adError) throw adError;
            if (!ad) throw new Error('Product not found');

            this.productData = ad;
            
            // Store seller profile
            this.supplierProfile = ad.seller;
            
            // Get supplier ID from suppliers table
            await this.getSupplierId(ad.seller_id);

            // Load variants
            await this.loadVariants();

            // Load bulk pricing
            await this.loadBulkPricing();

            // Load product videos
            await this.loadProductVideos();

            // Load supplier info
            await this.loadSupplierInfo(ad.seller_id);

            // Load related products
            await this.loadRelatedProducts(ad.category_id, ad.id);

            // Increment view count
            await this.incrementViewCount();

            // Track view in analytics
            await this.trackProductView();

            // Render all sections
            this.renderProduct();

            // Hide loading, show content
            const loadingState = document.getElementById('loadingState');
            const productContent = document.getElementById('productContent');
            
            if (loadingState) loadingState.style.display = 'none';
            if (productContent) productContent.style.display = 'block';

            // Initialize Swiper after content is rendered
            setTimeout(() => {
                this.initGallerySwiper();
            }, 100);

        } catch (error) {
            console.error('Error loading product:', error);
            this.showToast(error.message || 'Error loading product', 'error');
            
            const loadingState = document.getElementById('loadingState');
            if (loadingState) {
                loadingState.innerHTML = `
                    <div style="text-align: center; padding: 50px 20px;">
                        <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #EF4444; margin-bottom: 16px;"></i>
                        <h3>Error Loading Product</h3>
                        <p style="color: #6B7280; margin-top: 8px;">${error.message}</p>
                        <button onclick="window.history.back()" class="btn btn-primary" style="margin-top: 20px;">Go Back</button>
                    </div>
                `;
            }
        }
    },

    // ============================================
    // GET SUPPLIER ID
    // ============================================
    async getSupplierId(profileId) {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id')
                .eq('profile_id', profileId)
                .maybeSingle();

            if (!error && data) {
                this.supplierId = data.id;
                
                // Set supplier detail link
                const supplierLink = document.getElementById('supplierDetailLink');
                if (supplierLink) {
                    supplierLink.href = `supplier-detail.html?id=${this.supplierId}`;
                }
            }
        } catch (error) {
            console.error('Error getting supplier ID:', error);
        }
    },

    // ============================================
    // LOAD VARIANTS
    // ============================================
    async loadVariants() {
        try {
            const { data, error } = await sb
                .from('product_variants')
                .select('*')
                .eq('ad_id', this.productId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (error) throw error;
            
            this.variants = data || [];
            
            // If no variants, create a default one
            if (this.variants.length === 0) {
                this.variants = [{
                    id: null,
                    ad_id: this.productId,
                    color_name: 'Default',
                    color_code: '#808080',
                    image_url: this.productData.image_urls?.[0] || 'https://via.placeholder.com/600',
                    stock_quantity: this.productData.stock_quantity || 100,
                    price: this.productData.wholesale_price || this.productData.price
                }];
            }
            
            // Set current variant to first one
            this.currentVariant = this.variants[0];
            
        } catch (error) {
            console.error('Error loading variants:', error);
            this.variants = [];
        }
    },

    // ============================================
    // LOAD PRODUCT VIDEOS
    // ============================================
    async loadProductVideos() {
        try {
            if (!this.supplierId) return;

            const { data, error } = await sb
                .from('product_videos')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .eq('product_id', this.productId)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            this.productVideos = data || [];
            console.log(`✅ Loaded ${this.productVideos.length} videos`);

        } catch (error) {
            console.error('Error loading product videos:', error);
            this.productVideos = [];
        }
    },

    // ============================================
    // LOAD SUPPLIER INFO
    // ============================================
    async loadSupplierInfo(sellerId) {
        try {
            // Get supplier record with stats
            const { data: supplier, error } = await sb
                .from('suppliers')
                .select(`
                    *,
                    profile:profiles!suppliers_profile_id_fkey (
                        full_name,
                        avatar_url,
                        is_verified
                    )
                `)
                .eq('profile_id', sellerId)
                .maybeSingle();

            if (!error && supplier) {
                this.supplierData = supplier;
            }

            // Get product count
            const { count: productCount } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('seller_id', sellerId)
                .eq('status', 'active');
            
            // Get reviews for this seller
            const { data: reviews } = await sb
                .from('reviews')
                .select('rating')
                .eq('reviewee_id', sellerId);

            // Update DOM with stats
            const supplierProductsEl = document.getElementById('supplierProducts');
            const supplierRatingEl = document.getElementById('supplierRating');
            const supplierOrdersEl = document.getElementById('supplierOrders');
            
            if (supplierProductsEl) supplierProductsEl.textContent = productCount || 0;
            if (supplierOrdersEl) supplierOrdersEl.textContent = this.formatNumber(supplier?.total_orders || 0);
            
            if (reviews && reviews.length > 0) {
                const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
                if (supplierRatingEl) supplierRatingEl.textContent = avgRating.toFixed(1);
            }

            // Response time
            const responseTimeEl = document.getElementById('responseTime');
            if (responseTimeEl && supplier?.response_time_hours) {
                responseTimeEl.innerHTML = `<i class="fas fa-clock"></i> Response: ~${supplier.response_time_hours}h`;
            }

        } catch (error) {
            console.error('Error loading supplier info:', error);
        }
    },

    // ============================================
    // LOAD BULK PRICING
    // ============================================
    async loadBulkPricing() {
        try {
            const { data, error } = await sb
                .from('bulk_pricing')
                .select('*')
                .eq('ad_id', this.productId)
                .eq('is_active', true)
                .order('min_quantity', { ascending: true });

            if (error) throw error;
            
            this.bulkPricing = data || [];
        } catch (error) {
            console.error('Error loading bulk pricing:', error);
            this.bulkPricing = [];
        }
    },

    // ============================================
    // LOAD RELATED PRODUCTS
    // ============================================
    async loadRelatedProducts(categoryId, currentProductId) {
        try {
            const { data: products, error } = await sb
                .from('ads')
                .select(`
                    id,
                    title,
                    wholesale_price,
                    price,
                    image_urls,
                    moq
                `)
                .eq('status', 'active')
                .eq('category_id', categoryId)
                .neq('id', currentProductId)
                .not('wholesale_price', 'is', null)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            const wrapper = document.getElementById('relatedWrapper');
            
            if (!products || products.length === 0) {
                const relatedSection = document.getElementById('relatedSection');
                if (relatedSection) relatedSection.style.display = 'none';
                return;
            }

            if (wrapper) {
                wrapper.innerHTML = products.map(product => {
                    const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/140';
                    const price = product.wholesale_price || product.price || 0;
                    return `
                        <div class="swiper-slide">
                            <a href="B2B-product-detail.html?id=${product.id}" class="related-card">
                                <div class="related-image">
                                    <img src="${imageUrl}" 
                                         alt="${this.escapeHtml(product.title)}"
                                         loading="lazy"
                                         onerror="this.src='https://via.placeholder.com/140'">
                                </div>
                                <div class="related-info">
                                    <div class="related-title">${this.escapeHtml(product.title.substring(0, 20))}${product.title.length > 20 ? '...' : ''}</div>
                                    <div class="related-price">UGX ${this.formatNumber(price)}</div>
                                </div>
                            </a>
                        </div>
                    `;
                }).join('');
            }

            // Initialize related swiper
            setTimeout(() => {
                if (document.querySelector('.related-swiper')) {
                    this.relatedSwiperInstance = new Swiper('.related-swiper', {
                        slidesPerView: 2.5,
                        spaceBetween: 12,
                        freeMode: true,
                        breakpoints: {
                            640: { slidesPerView: 3.5 },
                            768: { slidesPerView: 4.5 }
                        }
                    });
                }
            }, 100);

        } catch (error) {
            console.error('Error loading related products:', error);
        }
    },

    // ============================================
    // INCREMENT VIEW COUNT
    // ============================================
    async incrementViewCount() {
        try {
            await sb
                .from('ads')
                .update({ 
                    view_count: (this.productData.view_count || 0) + 1,
                    last_view_date: new Date().toISOString()
                })
                .eq('id', this.productId);

            const viewCountEl = document.getElementById('viewCount');
            if (viewCountEl) {
                viewCountEl.textContent = (this.productData.view_count || 0) + 1;
            }

        } catch (error) {
            console.error('Error incrementing view count:', error);
        }
    },

    // ============================================
    // TRACK PRODUCT VIEW
    // ============================================
    async trackProductView() {
        try {
            await sb
                .from('ad_views')
                .insert({
                    ad_id: this.productId,
                    viewer_id: this.currentUser?.id || null,
                    user_agent: navigator.userAgent,
                    viewed_at: new Date().toISOString()
                });

            if (this.currentUser) {
                await sb
                    .from('user_product_interactions')
                    .insert({
                        user_id: this.currentUser.id,
                        ad_id: this.productId,
                        interaction_type: 'view',
                        created_at: new Date().toISOString()
                    });
            }

        } catch (error) {
            console.error('Error tracking view:', error);
        }
    },

    // ============================================
    // RENDER PRODUCT
    // ============================================
    renderProduct() {
        if (!this.productData) return;
        
        const ad = this.productData;
        const seller = ad.seller;
        
        // Basic info
        const titleEl = document.getElementById('productTitle');
        const descEl = document.getElementById('productDescription');
        
        if (titleEl) titleEl.textContent = ad.title || '';
        if (descEl) descEl.textContent = ad.description || 'No description available';
        
        // Price
        const wholesalePrice = ad.wholesale_price || ad.price;
        const wholesalePriceEl = document.getElementById('wholesalePrice');
        if (wholesalePriceEl) wholesalePriceEl.textContent = this.formatNumber(wholesalePrice);
        
        if (ad.price && ad.wholesale_price && ad.price > ad.wholesale_price) {
            const retailPriceBlock = document.getElementById('retailPriceBlock');
            const retailPriceEl = document.getElementById('retailPrice');
            const savingsBadgeEl = document.getElementById('savingsBadge');
            
            if (retailPriceBlock) retailPriceBlock.style.display = 'block';
            if (retailPriceEl) retailPriceEl.textContent = `UGX ${this.formatNumber(ad.price)}`;
            
            const savings = Math.round(((ad.price - ad.wholesale_price) / ad.price) * 100);
            if (savingsBadgeEl) savingsBadgeEl.textContent = `Save ${savings}%`;
        }
        
        // Render variants
        this.renderVariants();
        
        // MOQ and Stock
        const moqEl = document.getElementById('moqValue');
        const stockEl = document.getElementById('stockValue');
        const leadTimeEl = document.getElementById('leadTimeValue');
        
        if (moqEl) moqEl.textContent = ad.moq || 1;
        if (stockEl) stockEl.textContent = ad.stock_quantity !== null ? this.formatNumber(ad.stock_quantity) : 'In Stock';
        if (leadTimeEl) leadTimeEl.textContent = ad.lead_time_days ? `${ad.lead_time_days} days` : 'Contact supplier';
        
        // Quantity selector
        const quantityInput = document.getElementById('quantity');
        if (quantityInput) {
            quantityInput.value = ad.moq || 1;
            quantityInput.min = ad.moq || 1;
            this.selectedQuantity = ad.moq || 1;
        }
        
        // Location
        const locationEl = document.getElementById('productLocation');
        if (locationEl) {
            locationEl.textContent = `${ad.district || seller?.district || 'Kampala'}, ${ad.region || 'Uganda'}`;
        }
        
        // Date
        const dateEl = document.getElementById('postedDate');
        if (dateEl && ad.created_at) {
            const date = new Date(ad.created_at);
            dateEl.textContent = this.formatDate(date);
        }
        
        // Badges
        const featuredBadge = document.getElementById('featuredBadge');
        const urgentBadge = document.getElementById('urgentBadge');
        const verifiedBadge = document.getElementById('verifiedBadge');
        const bulkBadge = document.getElementById('bulkBadge');
        const negotiableBadge = document.getElementById('negotiableBadge');
        const supplierVerifiedBadge = document.getElementById('supplierVerifiedBadge');
        
        if (ad.is_featured && featuredBadge) featuredBadge.style.display = 'block';
        if (ad.status === 'urgent' && urgentBadge) urgentBadge.style.display = 'block';
        if (seller?.is_verified) {
            if (verifiedBadge) verifiedBadge.style.display = 'block';
            if (supplierVerifiedBadge) supplierVerifiedBadge.style.display = 'flex';
        }
        if (ad.is_bulk_only && bulkBadge) bulkBadge.style.display = 'block';
        if (ad.is_negotiable && negotiableBadge) negotiableBadge.style.display = 'inline-flex';
        
        // Tags
        if (ad.tags && ad.tags.length > 0) {
            const tagsSection = document.getElementById('tagsSection');
            const tagsContainer = document.getElementById('tagsContainer');
            
            if (tagsSection) tagsSection.style.display = 'block';
            if (tagsContainer) {
                tagsContainer.innerHTML = ad.tags.map(tag => 
                    `<span class="tag">${this.escapeHtml(tag)}</span>`
                ).join('');
            }
        }
        
        // Images
        this.renderImages(ad.image_urls || []);
        
        // Videos
        this.renderVideos();
        
        // Specifications
        this.renderSpecifications(ad);
        
        // Bulk pricing table
        this.renderBulkPricing();
        
        // Supplier info
        this.renderSupplierInfo(seller);
    },

    // ============================================
    // RENDER VARIANTS
    // ============================================
    renderVariants() {
        const variantSection = document.getElementById('colorVariantSection');
        const container = document.getElementById('colorOptions');
        
        if (!variantSection || !container) return;
        
        if (this.variants.length <= 1) {
            variantSection.style.display = 'none';
            return;
        }
        
        variantSection.style.display = 'block';
        
        let html = '';
        this.variants.forEach((variant, index) => {
            const isSelected = this.currentVariant?.id === variant.id;
            const bgColor = variant.color_code || this.getColorFromName(variant.color_name);
            
            html += `
                <button class="color-option ${isSelected ? 'selected' : ''}" 
                        data-variant-id="${variant.id}"
                        data-image="${variant.image_url}"
                        data-stock="${variant.stock_quantity}"
                        data-price="${variant.price || this.productData.wholesale_price || this.productData.price}"
                        data-color="${variant.color_name}"
                        style="background-color: ${bgColor};"
                        onclick="ProductDetail.selectVariant(${index})">
                    ${variant.color_name}
                </button>
            `;
        });
        
        container.innerHTML = html;
        
        if (this.currentVariant) {
            document.getElementById('selectedColor').textContent = this.currentVariant.color_name;
        }
    },

    // ============================================
    // SELECT VARIANT
    // ============================================
    selectVariant(index) {
        const variant = this.variants[index];
        if (!variant) return;
        
        this.currentVariant = variant;
        
        // Update UI
        document.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`[data-variant-id="${variant.id}"]`)?.classList.add('selected');
        
        // Update main image
        this.updateMainImage(variant.image_url);
        
        // Update selected color text
        document.getElementById('selectedColor').textContent = variant.color_name;
        
        // Update price if variant has different price
        if (variant.price) {
            document.getElementById('wholesalePrice').textContent = this.formatNumber(variant.price);
        }
        
        // Update stock status
        this.updateStockStatus(variant);
    },

    // ============================================
    // RENDER VIDEOS
    // ============================================
    renderVideos() {
        const videosSection = document.getElementById('videosSection');
        const videosGrid = document.getElementById('videosGrid');
        
        if (!videosSection || !videosGrid) return;
        
        if (this.productVideos.length === 0) {
            videosSection.style.display = 'none';
            return;
        }
        
        videosSection.style.display = 'block';
        
        videosGrid.innerHTML = this.productVideos.map(video => `
            <div class="video-thumbnail-card" onclick="ProductDetail.playVideo('${video.video_url}', '${this.escapeHtml(video.caption || '')}', ${video.duration || 0})">
                <div class="video-thumbnail">
                    <img src="${video.thumbnail_url || 'https://via.placeholder.com/300x200'}" alt="Video thumbnail">
                    <span class="video-duration">${this.formatDuration(video.duration || 0)}</span>
                    <span class="play-icon"><i class="fas fa-play"></i></span>
                </div>
                <div class="video-caption">${this.escapeHtml(video.caption || '').substring(0, 50)}${video.caption?.length > 50 ? '...' : ''}</div>
            </div>
        `).join('');
    },

    // ============================================
    // PLAY VIDEO
    // ============================================
    playVideo(videoUrl, caption, duration) {
        const modal = document.getElementById('videoModal');
        const container = document.getElementById('videoPlayerContainer');
        const infoEl = document.getElementById('videoInfo');
        
        if (!modal || !container) return;
        
        // Check if video is YouTube or direct MP4
        let videoHtml;
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            // Extract YouTube ID
            const videoId = this.extractYouTubeId(videoUrl);
            videoHtml = `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        } else {
            videoHtml = `<video controls autoplay><source src="${videoUrl}" type="video/mp4"></video>`;
        }
        
        container.innerHTML = videoHtml;
        
        if (infoEl) {
            infoEl.innerHTML = `
                <p><strong>${caption || 'Product Video'}</strong></p>
                <p class="video-meta">Duration: ${this.formatDuration(duration)}</p>
            `;
        }
        
        modal.classList.add('show');
    },

    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const container = document.getElementById('videoPlayerContainer');
        
        if (modal) modal.classList.remove('show');
        if (container) container.innerHTML = '';
    },

    extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    // ============================================
    // UPDATE STOCK STATUS
    // ============================================
    updateStockStatus(variant) {
        const stockEl = document.getElementById('stockValue');
        
        const stock = variant?.stock_quantity || this.productData?.stock_quantity || 0;
        
        if (stockEl) {
            if (stock <= 0) {
                stockEl.textContent = 'Out of Stock';
            } else if (stock < 10) {
                stockEl.textContent = `Low Stock (${stock} left)`;
            } else {
                stockEl.textContent = this.formatNumber(stock) + '+ units';
            }
        }
    },

    // ============================================
    // RENDER IMAGES
    // ============================================
    renderImages(images) {
        const wrapper = document.getElementById('galleryWrapper');
        if (!wrapper) return;
        
        if (images.length === 0) {
            wrapper.innerHTML = `
                <div class="swiper-slide">
                    <img src="https://via.placeholder.com/400?text=No+Image" alt="No image available">
                </div>
            `;
            return;
        }
        
        wrapper.innerHTML = images.map(img => `
            <div class="swiper-slide">
                <img src="${img}" alt="Product image" loading="lazy">
            </div>
        `).join('');
    },

    // ============================================
    // UPDATE MAIN IMAGE
    // ============================================
    updateMainImage(imageUrl) {
        if (!this.swiperInstance) return;
        
        const slides = document.querySelectorAll('.gallery-swiper .swiper-slide img');
        for (let i = 0; i < slides.length; i++) {
            if (slides[i].src === imageUrl) {
                this.swiperInstance.slideTo(i);
                break;
            }
        }
    },

    // ============================================
    // RENDER SPECIFICATIONS
    // ============================================
    renderSpecifications(ad) {
        const specsGrid = document.getElementById('specsGrid');
        if (!specsGrid) return;
        
        const specs = [
            { label: 'Condition', value: ad.condition || 'New' },
            { label: 'Brand', value: ad.brand || 'Not specified' },
            { label: 'Model', value: ad.model || 'Not specified' },
            { label: 'SKU', value: ad.sku || 'Not available' },
            { label: 'Negotiable', value: ad.is_negotiable ? 'Yes' : 'No' },
            { label: 'Bulk Only', value: ad.is_bulk_only ? 'Yes' : 'No' }
        ];
        
        specsGrid.innerHTML = specs.map(spec => `
            <div class="spec-item">
                <div class="spec-label">${spec.label}</div>
                <div class="spec-value">${this.escapeHtml(spec.value)}</div>
            </div>
        `).join('');
    },

    // ============================================
    // RENDER BULK PRICING
    // ============================================
    renderBulkPricing() {
        const tableBody = document.getElementById('bulkPricingBody');
        const bulkSection = document.getElementById('bulkPricingSection');
        
        if (this.bulkPricing.length === 0) {
            if (bulkSection) bulkSection.style.display = 'none';
            return;
        }
        
        if (!tableBody) return;
        
        const basePrice = this.productData?.wholesale_price || this.productData?.price || 0;
        
        tableBody.innerHTML = this.bulkPricing.map(tier => {
            const totalPrice = tier.price_per_unit * tier.min_quantity;
            const savings = basePrice ? Math.round(((basePrice - tier.price_per_unit) / basePrice) * 100) : 0;
            
            return `
                <tr onclick="ProductDetail.selectBulkTier(${tier.min_quantity})">
                    <td><strong>${tier.min_quantity}</strong>${tier.max_quantity ? ` - ${tier.max_quantity}` : '+'}</td>
                    <td>UGX ${this.formatNumber(tier.price_per_unit)}<\/td>
                    <td>UGX ${this.formatNumber(totalPrice)}<\/td>
                    <td class="savings-cell">Save ${savings}%<\/td>
                <\/tr>
            `;
        }).join('');
    },

    // ============================================
    // RENDER SUPPLIER INFO
    // ============================================
    renderSupplierInfo(seller) {
        if (!seller) return;
        
        const supplierName = seller.business_name || seller.full_name || 'Business Seller';
        const supplierNameEl = document.getElementById('supplierName');
        if (supplierNameEl) supplierNameEl.textContent = supplierName;
        
        const initials = supplierName
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        
        const supplierInitialsEl = document.getElementById('supplierInitials');
        if (supplierInitialsEl) supplierInitialsEl.textContent = initials;
        
        const supplierAvatar = document.getElementById('supplierAvatar');
        if (supplierAvatar) {
            if (seller.avatar_url) {
                supplierAvatar.innerHTML = `
                    <img src="${seller.avatar_url}" alt="${this.escapeHtml(supplierName)}">
                    ${seller.is_verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : ''}
                `;
            }
        }
        
        const supplierLocationEl = document.getElementById('supplierLocation');
        if (supplierLocationEl) {
            supplierLocationEl.textContent = seller.district || seller.location || 'Uganda';
        }
    },

    // ============================================
    // INIT GALLERY SWIPER
    // ============================================
    initGallerySwiper() {
        if (document.querySelector('.gallery-swiper')) {
            this.swiperInstance = new Swiper('.gallery-swiper', {
                pagination: { el: '.swiper-pagination', clickable: true },
                loop: true,
                speed: 400,
                autoplay: {
                    delay: 3000,
                    disableOnInteraction: false
                }
            });
        }
    },

    // ============================================
    // SELECT BULK TIER
    // ============================================
    selectBulkTier(quantity) {
        const quantityInput = document.getElementById('quantity');
        if (quantityInput) {
            quantityInput.value = quantity;
            this.selectedQuantity = quantity;
        }
        
        document.querySelectorAll('#bulkPricingBody tr').forEach(tr => {
            tr.style.background = '';
        });
        
        event.currentTarget.style.background = '#F3F4F6';
    },

    // ============================================
    // CONTACT SUPPLIER (Old behaviour – redirect to supplier-contact.html)
    // ============================================
    async contactSupplier() {
        // If user is not logged in, redirect to login first
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', `B2B-product-detail.html?id=${this.productId}`);
            sessionStorage.setItem('pendingProductInquiry', JSON.stringify({
                productId: this.productId,
                productTitle: this.productData?.title,
                quantity: this.selectedQuantity,
                variant: this.currentVariant?.color_name !== 'Default' ? this.currentVariant?.color_name : null
            }));
            window.location.href = `login.html`;
            return;
        }

        // Build query parameters for the contact page
        const params = new URLSearchParams();
        params.append('product_id', this.productId);
        params.append('product_title', this.productData?.title || '');
        params.append('quantity', this.selectedQuantity);
        if (this.currentVariant?.color_name !== 'Default') {
            params.append('variant', this.currentVariant.color_name);
        }
        if (this.supplierId) {
            params.append('supplier_id', this.supplierId);
        }
        // Redirect to the old contact page
        window.location.href = `supplier-contact.html?${params.toString()}`;
    },

    // ============================================
    // SEND INQUIRY (New chat system)
    // ============================================
    quickInquiryWithPreset() {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', `B2B-product-detail.html?id=${this.productId}`);
            sessionStorage.setItem('pendingProductInquiry', JSON.stringify({
                productId: this.productId,
                productTitle: this.productData?.title,
                quantity: this.selectedQuantity,
                variant: this.currentVariant?.color_name !== 'Default' ? this.currentVariant?.color_name : null,
                action: 'quick_inquiry'
            }));
            window.location.href = `login.html`;
            return;
        }
        this.showQuickInquiryModal();
    },

    // ============================================
    // CHAT HELPER FUNCTIONS (used only by Send Inquiry)
    // ============================================

    // Find existing conversation with supplier
    async findExistingConversation() {
        try {
            const { data, error } = await chatSupabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', this.supplierId);
            
            if (error) {
                console.error('Error finding conversation:', error);
                return null;
            }
            
            if (data && data.length > 0) {
                const conversationId = data[0].conversation_id;
                const { data: userInConv, error: userError } = await chatSupabase
                    .from('conversation_participants')
                    .select('conversation_id')
                    .eq('conversation_id', conversationId)
                    .eq('user_id', this.currentUser.id);
                
                if (!userError && userInConv && userInConv.length > 0) {
                    return conversationId;
                }
            }
            return null;
        } catch (error) {
            console.error('Error in findExistingConversation:', error);
            return null;
        }
    },

    // Create new conversation
    async createNewConversation() {
        try {
            const supplierName = this.supplierProfile?.business_name || 
                                this.supplierProfile?.full_name || 
                                'Supplier';
            
            const { data: conversation, error: convError } = await chatSupabase
                .from('conversations')
                .insert({
                    title: `${supplierName} - ${this.productData?.title || 'Product Inquiry'}`,
                    created_by: this.currentUser.id,
                    last_message: `Inquiry about ${this.productData?.title || 'product'}`,
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (convError) throw convError;
            
            await chatSupabase
                .from('conversation_participants')
                .insert([
                    { 
                        conversation_id: conversation.id, 
                        user_id: this.currentUser.id, 
                        user_type: 'buyer',
                        unread_count: 0,
                        is_admin: true
                    },
                    { 
                        conversation_id: conversation.id, 
                        user_id: this.supplierId, 
                        user_type: 'supplier',
                        unread_count: 1,
                        is_admin: false
                    }
                ]);
            
            return conversation.id;
        } catch (error) {
            console.error('Error creating conversation:', error);
            return null;
        }
    },

    // Generate inquiry message
    generateInquiryMessage() {
        const productTitle = this.productData?.title || 'this product';
        const quantity = this.selectedQuantity || (this.productData?.moq || 1);
        const variant = this.currentVariant?.color_name !== 'Default' ? this.currentVariant?.color_name : null;
        const price = this.productData?.wholesale_price || this.productData?.price || 0;
        
        let message = `Hello! I'm interested in ${productTitle}.\n\n`;
        message += `📦 Product Details:\n`;
        message += `• Product: ${productTitle}\n`;
        message += `• Quantity: ${quantity} unit(s)\n`;
        if (variant) {
            message += `• Color/Variant: ${variant}\n`;
        }
        message += `• Price: UGX ${this.formatNumber(price)} per unit\n\n`;
        message += `I would like to inquire about:\n`;
        message += `• Current availability\n`;
        message += `• Shipping options to my location\n`;
        message += `• Payment terms\n\n`;
        message += `Please let me know if you need any additional information.`;
        return message;
    },

    // Send initial chat message
    async sendInitialChatMessage(conversationId, message) {
        try {
            const { error } = await chatSupabase
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: this.currentUser.id,
                    sender_type: 'buyer',
                    content: message,
                    message_type: 'text',
                    product_data: {
                        product_id: this.productId,
                        product_title: this.productData?.title,
                        product_price: this.productData?.wholesale_price || this.productData?.price,
                        quantity: this.selectedQuantity,
                        variant: this.currentVariant?.color_name !== 'Default' ? this.currentVariant?.color_name : null,
                        image_url: this.currentVariant?.image_url || this.productData?.image_urls?.[0]
                    }
                });
            if (error) throw error;
            
            await chatSupabase
                .from('conversations')
                .update({
                    last_message: message,
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);
            
            return true;
        } catch (error) {
            console.error('Error sending initial message:', error);
            return false;
        }
    },

    // Check for pending inquiry after login
    async checkPendingInquiry() {
        const pendingMessage = sessionStorage.getItem('pendingChatMessage');
        const pendingConvId = sessionStorage.getItem('pendingConversationId');
        
        if (pendingMessage && pendingConvId && this.currentUser) {
            sessionStorage.removeItem('pendingChatMessage');
            sessionStorage.removeItem('pendingConversationId');
            await this.sendInitialChatMessage(pendingConvId, pendingMessage);
        }
        
        const pendingProduct = sessionStorage.getItem('pendingProductInquiry');
        if (pendingProduct && this.currentUser) {
            sessionStorage.removeItem('pendingProductInquiry');
            // If it's a quick inquiry, open the modal; otherwise, contact supplier?
            const inquiry = JSON.parse(pendingProduct);
            if (inquiry.action === 'quick_inquiry') {
                this.showQuickInquiryModal();
            } else {
                this.contactSupplier();
            }
        }
    },

    // Show quick inquiry modal
    showQuickInquiryModal() {
        const modal = document.getElementById('quickInquiryModal');
        if (!modal) return;
        
        // Update product summary preview
        const previewContainer = document.getElementById('productSummaryPreview');
        if (previewContainer && this.productData) {
            const imageUrl = this.currentVariant?.image_url || this.productData.image_urls?.[0] || 'https://via.placeholder.com/60';
            const price = this.productData.wholesale_price || this.productData.price || 0;
            
            previewContainer.innerHTML = `
                <img src="${imageUrl}" alt="${this.escapeHtml(this.productData.title)}">
                <div style="flex: 1;">
                    <h4>${this.escapeHtml(this.productData.title)}</h4>
                    <p>Quantity: ${this.selectedQuantity} unit(s)</p>
                    <p>Price: UGX ${this.formatNumber(price)} per unit</p>
                    ${this.currentVariant?.color_name !== 'Default' ? `<p>Color: ${this.currentVariant.color_name}</p>` : ''}
                    <div class="price">Total: UGX ${this.formatNumber(price * this.selectedQuantity)}</div>
                </div>
            `;
            previewContainer.style.display = 'flex';
        }
        
        // Set preset messages
        const presetMessages = [
            "Hi, I'm interested in this product. Is it currently in stock?",
            "What's the minimum order quantity for this item?",
            "Can you provide a quote including shipping to Kampala?",
            "Do you offer bulk discounts for larger orders?",
            "What payment methods do you accept?",
            "Can I get a sample before placing a bulk order?"
        ];
        
        const presetContainer = document.getElementById('presetMessagesList');
        if (presetContainer) {
            presetContainer.innerHTML = presetMessages.map(msg => `
                <button class="preset-message-btn" onclick="ProductDetail.selectPresetMessage('${this.escapeHtml(msg)}')">
                    ${this.escapeHtml(msg)}
                </button>
            `).join('');
        }
        
        modal.classList.add('show');
    },

    // Select preset message
    selectPresetMessage(message) {
        const textarea = document.getElementById('customMessageInput');
        if (textarea) {
            textarea.value = message;
            textarea.focus();
            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    // Close quick inquiry modal
    closeQuickInquiryModal() {
        const modal = document.getElementById('quickInquiryModal');
        if (modal) modal.classList.remove('show');
    },

    // Send custom inquiry from modal
    sendCustomInquiry: async function() {
        const textarea = document.getElementById('customMessageInput');
        const message = textarea?.value.trim();
        
        if (!message) {
            this.showToast('Please enter a message', 'warning');
            return;
        }
        
        this.closeQuickInquiryModal();
        this.showToast('Sending inquiry...', 'info');
        
        try {
            let conversationId = await this.findExistingConversation();
            if (!conversationId) {
                conversationId = await this.createNewConversation();
            }
            
            if (conversationId) {
                const { error } = await chatSupabase
                    .from('messages')
                    .insert({
                        conversation_id: conversationId,
                        sender_id: this.currentUser.id,
                        sender_type: 'buyer',
                        content: message,
                        message_type: 'text',
                        product_data: {
                            product_id: this.productId,
                            product_title: this.productData?.title,
                            product_price: this.productData?.wholesale_price || this.productData?.price,
                            quantity: this.selectedQuantity,
                            variant: this.currentVariant?.color_name !== 'Default' ? this.currentVariant?.color_name : null,
                            image_url: this.currentVariant?.image_url || this.productData?.image_urls?.[0]
                        }
                    });
                
                if (error) throw error;
                
                await chatSupabase
                    .from('conversations')
                    .update({
                        last_message: message,
                        last_message_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', conversationId);
                
                this.showToast('Message sent! Redirecting to chat...', 'success');
                setTimeout(() => {
                    window.location.href = `chat-room.html?conversation=${conversationId}&product=${this.productId}`;
                }, 1500);
            } else {
                throw new Error('Could not create conversation');
            }
        } catch (error) {
            console.error('Error sending inquiry:', error);
            this.showToast('Failed to send inquiry. Please try again.', 'error');
        }
    },

    // ============================================
    // TOGGLE SAVE PRODUCT
    // ============================================
    async toggleSave() {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', `B2B-product-detail.html?id=${this.productId}`);
            window.location.href = `login.html`;
            return;
        }
        
        try {
            if (this.isSaved) {
                await sb
                    .from('saved_ads')
                    .delete()
                    .eq('user_id', this.currentUser.id)
                    .eq('ad_id', this.productId);
                this.showToast('Removed from saved', 'success');
            } else {
                await sb
                    .from('saved_ads')
                    .insert({
                        user_id: this.currentUser.id,
                        ad_id: this.productId,
                        created_at: new Date().toISOString()
                    });
                this.showToast('Saved to your list', 'success');
            }
            
            this.isSaved = !this.isSaved;
            this.updateSaveButton();
        } catch (error) {
            console.error('Error toggling save:', error);
            this.showToast('Error saving item', 'error');
        }
    },

    updateSaveButton() {
        const saveBtn = document.getElementById('saveBtn');
        if (!saveBtn) return;
        
        saveBtn.innerHTML = this.isSaved ? 
            '<i class="fas fa-bookmark"></i>' : 
            '<i class="far fa-bookmark"></i>';
        
        if (this.isSaved) {
            saveBtn.classList.add('saved');
        } else {
            saveBtn.classList.remove('saved');
        }
    },

    // ============================================
    // QUANTITY CONTROLS
    // ============================================
    incrementQuantity() {
        const input = document.getElementById('quantity');
        const max = this.productData?.max_order_quantity || 999;
        const newValue = parseInt(input.value) + 1;
        if (newValue <= max) {
            input.value = newValue;
            this.selectedQuantity = newValue;
        }
    },

    decrementQuantity() {
        const input = document.getElementById('quantity');
        const min = this.productData?.moq || 1;
        const newValue = parseInt(input.value) - 1;
        if (newValue >= min) {
            input.value = newValue;
            this.selectedQuantity = newValue;
        }
    },

    // ============================================
    // SHARE PRODUCT
    // ============================================
    shareProduct() {
        if (navigator.share) {
            navigator.share({
                title: this.productData?.title || 'Product',
                text: `Check out this product on SourceX B2B: ${this.productData?.title || ''}`,
                url: window.location.href
            }).catch(() => {
                this.copyToClipboard();
            });
        } else {
            this.copyToClipboard();
        }
    },

    copyToClipboard() {
        navigator.clipboard.writeText(window.location.href);
        this.showToast('Link copied to clipboard', 'success');
    },

    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    showSuccessModal(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('show');
    },

    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#6B21E5',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    formatDate(date) {
        if (!date) return 'Recently';
        const now = new Date();
        const diff = now - date;
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return hours === 0 ? 'Just now' : `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString('en-UG', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        }
    },

    formatNumber(num) {
        if (!num && num !== 0) return '0';
        return parseInt(num).toLocaleString('en-UG');
    },

    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getColorFromName(colorName) {
        const colors = {
            'red': '#EF4444',
            'blue': '#3B82F6',
            'green': '#10B981',
            'yellow': '#F59E0B',
            'purple': '#8B5CF6',
            'pink': '#EC4899',
            'black': '#1F2937',
            'white': '#F9FAFB',
            'gray': '#6B7280',
            'brown': '#92400E',
            'orange': '#F97316'
        };
        return colors[colorName.toLowerCase()] || '#808080';
    },

    // ============================================
    // SETUP EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        document.getElementById('incrementQty')?.addEventListener('click', () => this.incrementQuantity());
        document.getElementById('decrementQty')?.addEventListener('click', () => this.decrementQuantity());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.toggleSave());
        document.getElementById('shareBtn')?.addEventListener('click', () => this.shareProduct());
        document.getElementById('contactSupplierBtn')?.addEventListener('click', () => this.contactSupplier());
        document.getElementById('quickInquiryBtn')?.addEventListener('click', () => this.quickInquiryWithPreset());
        document.getElementById('floatingQuickInquiry')?.addEventListener('click', () => this.quickInquiryWithPreset());
        
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeSuccessModal();
                this.closeVideoModal();
                this.closeQuickInquiryModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSuccessModal();
                this.closeVideoModal();
                this.closeQuickInquiryModal();
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ProductDetail.init());
} else {
    ProductDetail.init();
}

// Make functions globally available
window.ProductDetail = ProductDetail;