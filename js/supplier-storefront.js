// ============================================
// SUPPLIER STOREFRONT MANAGEMENT - COMPLETE FIXED VERSION
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// IMAGE COMPRESSION FUNCTION
// ============================================
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions while maintaining aspect ratio
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to blob with compression
                canvas.toBlob((blob) => {
                    // Create a new file from the blob
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ============================================
// STATE MANAGEMENT
// ============================================
let StorefrontManager = {
    currentUser: null,
    currentSupplier: null,
    currentStorefront: null,
    customStats: [],
    categoryDisplays: [],
    featuredProducts: {
        hot: [],
        new: []
    },
    allProducts: [],
    currentProductSection: null,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('🚀 Storefront Manager initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            
            // Update preview link with supplier ID
            const previewLink = document.getElementById('previewLink');
            if (previewLink) {
                previewLink.href = `supplier-detail.html?id=${this.currentSupplier.id}`;
            }
            
            const previewBtn = document.getElementById('previewBtn');
            if (previewBtn) {
                previewBtn.onclick = () => {
                    window.open(`supplier-detail.html?id=${this.currentSupplier.id}`, '_blank');
                };
            }
            
            await this.loadStorefront();
            await this.loadProducts();
            await this.loadCustomStats();
            await this.loadCategoryDisplays();
            await this.loadFeaturedProducts();
            
            // Wait for DOM to be fully ready
            setTimeout(() => {
                this.renderBannerTab();
                this.renderStatsTab();
                this.renderCategoriesTab();
                this.renderFeaturedTab();
                this.renderTaglineTab();
                this.setupEventListeners();
            }, 100);
            
            console.log('✅ Storefront Manager initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading storefront data', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-storefront.html';
                return;
            }
            this.currentUser = user;
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('*')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            this.currentSupplier = data;
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
        }
    },
    
    async loadStorefront() {
        try {
            const { data, error } = await sb
                .from('supplier_storefronts')
                .select('*')
                .eq('supplier_id', this.currentSupplier.id)
                .maybeSingle();
            
            if (error) throw error;
            
            if (data) {
                this.currentStorefront = data;
            } else {
                // Create default storefront
                const { data: newStorefront, error: createError } = await sb
                    .from('supplier_storefronts')
                    .insert({
                        supplier_id: this.currentSupplier.id,
                        banner_title: 'Verified Custom Manufacturer',
                        hot_selling_title: 'HOT SELLING PRODUCT',
                        hot_selling_subtitle: 'WELCOME TO OUR COUNTRY',
                        tagline: 'FOCUS ON SAMPLE CUSTOMIZATION TO CREATE EXCLUSIVE STYLE.'
                    })
                    .select()
                    .single();
                
                if (createError) throw createError;
                this.currentStorefront = newStorefront;
            }
        } catch (error) {
            console.error('Error loading storefront:', error);
            this.showToast('Error loading storefront', 'error');
        }
    },
    
    async loadProducts() {
        try {
            const { data, error } = await sb
                .from('ads')
                .select('*')
                .eq('supplier_id', this.currentSupplier.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.allProducts = data || [];
        } catch (error) {
            console.error('Error loading products:', error);
            this.allProducts = [];
        }
    },
    
    async loadCustomStats() {
        try {
            const { data, error } = await sb
                .from('supplier_custom_stats')
                .select('*')
                .eq('supplier_id', this.currentSupplier.id)
                .order('display_order', { ascending: true });
            
            if (error) throw error;
            this.customStats = data || [];
        } catch (error) {
            console.error('Error loading custom stats:', error);
            this.customStats = [];
        }
    },
    
    async loadCategoryDisplays() {
        try {
            const { data, error } = await sb
                .from('supplier_category_displays')
                .select('*')
                .eq('supplier_id', this.currentSupplier.id)
                .order('display_order', { ascending: true });
            
            if (error) throw error;
            this.categoryDisplays = data || [];
        } catch (error) {
            console.error('Error loading category displays:', error);
            this.categoryDisplays = [];
        }
    },
    
    async loadFeaturedProducts() {
        try {
            const { data, error } = await sb
                .from('supplier_featured_products')
                .select('*, ads(*)')
                .eq('supplier_id', this.currentSupplier.id)
                .eq('is_active', true);
            
            if (error) throw error;
            
            this.featuredProducts.hot = data?.filter(f => f.section === 'hot_selling') || [];
            this.featuredProducts.new = data?.filter(f => f.section === 'new_arrivals') || [];
        } catch (error) {
            console.error('Error loading featured products:', error);
            this.featuredProducts = { hot: [], new: [] };
        }
    },
    
    // ============================================
    // HELPER: Set Field Value Safely
    // ============================================
    setFieldValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '';
        }
    },
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    renderBannerTab() {
        const preview = document.getElementById('bannerPreview');
        if (!preview) return;
        
        if (this.currentStorefront.banner_image_url) {
            preview.innerHTML = `
                <img src="${this.currentStorefront.banner_image_url}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                <button class="btn btn-sm btn-danger" onclick="StorefrontManager.removeBanner()">
                    <i class="fas fa-trash"></i> Remove
                </button>
            `;
        } else {
            preview.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to upload banner image</p>
                <small>Recommended: 1200x400px (will be compressed)</small>
            `;
        }
        
        this.setFieldValue('bannerTitle', this.currentStorefront.banner_title);
        this.setFieldValue('bannerSubtitle', this.currentStorefront.banner_subtitle);
        this.setFieldValue('bannerButtonText', this.currentStorefront.banner_button_text || 'Learn More');
        this.setFieldValue('bannerButtonLink', this.currentStorefront.banner_button_link || '');
    },
    
    renderStatsTab() {
        const container = document.getElementById('statsList');
        if (!container) return;
        
        if (this.customStats.length === 0) {
            container.innerHTML = '<p class="text-muted">No custom stats added yet. Click "Add Stat" to create one.</p>';
            return;
        }
        
        container.innerHTML = this.customStats.map((stat, index) => `
            <div class="stat-item" data-id="${stat.id || 'new-' + index}" data-index="${index}">
                <div class="stat-drag"><i class="fas fa-grip-vertical"></i></div>
                <div class="stat-content">
                    <input type="text" value="${stat.value || ''}" placeholder="Value" class="stat-value-input" id="stat-value-${index}">
                    <input type="text" value="${stat.label || ''}" placeholder="Label" class="stat-label-input" id="stat-label-${index}">
                    <input type="text" value="${stat.sublabel || ''}" placeholder="Sublabel" class="stat-sublabel-input" id="stat-sublabel-${index}">
                </div>
                <div class="stat-actions">
                    <button class="btn-icon" onclick="StorefrontManager.updateStat(${index})">
                        <i class="fas fa-save"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="StorefrontManager.deleteStat(${stat.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    renderCategoriesTab() {
        const container = document.getElementById('categoriesList');
        if (!container) return;
        
        if (this.categoryDisplays.length === 0) {
            container.innerHTML = '<p class="text-muted">No categories added yet. Click "Add Category" to create one.</p>';
            return;
        }
        
        container.innerHTML = this.categoryDisplays.map((cat, index) => `
            <div class="category-item" data-id="${cat.id || 'new-' + index}" data-index="${index}">
                <div class="category-drag"><i class="fas fa-grip-vertical"></i></div>
                <div class="category-content">
                    <input type="text" value="${cat.category_name || ''}" placeholder="Category Name" class="category-name-input" id="cat-name-${index}">
                    <select class="category-icon-select" id="cat-icon-${index}">
                        <option value="fa-tag" ${cat.icon === 'fa-tag' ? 'selected' : ''}>Tag</option>
                        <option value="fa-motorcycle" ${cat.icon === 'fa-motorcycle' ? 'selected' : ''}>Motorcycle</option>
                        <option value="fa-bolt" ${cat.icon === 'fa-bolt' ? 'selected' : ''}>Bolt</option>
                        <option value="fa-bicycle" ${cat.icon === 'fa-bicycle' ? 'selected' : ''}>Bicycle</option>
                        <option value="fa-car" ${cat.icon === 'fa-car' ? 'selected' : ''}>Car</option>
                        <option value="fa-gas-pump" ${cat.icon === 'fa-gas-pump' ? 'selected' : ''}>Gas Pump</option>
                        <option value="fa-cog" ${cat.icon === 'fa-cog' ? 'selected' : ''}>Cog</option>
                    </select>
                </div>
                <div class="category-actions">
                    <button class="btn-icon" onclick="StorefrontManager.updateCategory(${index})">
                        <i class="fas fa-save"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="StorefrontManager.deleteCategory(${cat.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    renderFeaturedTab() {
        this.setFieldValue('hotSellingTitle', this.currentStorefront.hot_selling_title);
        this.setFieldValue('hotSellingSubtitle', this.currentStorefront.hot_selling_subtitle);
        
        this.renderHotProductsList();
        this.renderNewArrivalsList();
    },
    
    renderHotProductsList() {
        const container = document.getElementById('hotProductsList');
        if (!container) return;
        
        if (this.featuredProducts.hot.length === 0) {
            container.innerHTML = '<p class="text-muted">No hot selling products selected. Click "Add Product" to add some.</p>';
            return;
        }
        
        container.innerHTML = this.featuredProducts.hot.map(fp => `
            <div class="product-selection-item" data-id="${fp.id}">
                <img src="${fp.ads?.image_urls?.[0] || 'https://via.placeholder.com/50'}" class="product-thumb">
                <span class="product-name">${fp.ads?.title || 'Product'}</span>
                <button class="btn-icon btn-danger" onclick="StorefrontManager.removeHotProduct(${fp.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },
    
    renderNewArrivalsList() {
        const container = document.getElementById('newArrivalsList');
        if (!container) return;
        
        if (this.featuredProducts.new.length === 0) {
            container.innerHTML = '<p class="text-muted">No new arrival products selected. Click "Add Product" to add some.</p>';
            return;
        }
        
        container.innerHTML = this.featuredProducts.new.map(fp => `
            <div class="product-selection-item" data-id="${fp.id}">
                <img src="${fp.ads?.image_urls?.[0] || 'https://via.placeholder.com/50'}" class="product-thumb">
                <span class="product-name">${fp.ads?.title || 'Product'}</span>
                <button class="btn-icon btn-danger" onclick="StorefrontManager.removeNewArrival(${fp.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },
    
    renderTaglineTab() {
        this.setFieldValue('tagline', this.currentStorefront.tagline);
    },
    
    // ============================================
    // STATS FUNCTIONS
    // ============================================
    addStat() {
        this.customStats.push({
            supplier_id: this.currentSupplier.id,
            label: 'New Stat',
            value: '100+',
            sublabel: '',
            display_order: this.customStats.length
        });
        this.renderStatsTab();
        this.showToast('New stat added. Click save to confirm.', 'info');
    },
    
    async updateStat(index) {
        const stat = this.customStats[index];
        
        stat.value = document.getElementById(`stat-value-${index}`)?.value || stat.value;
        stat.label = document.getElementById(`stat-label-${index}`)?.value || stat.label;
        stat.sublabel = document.getElementById(`stat-sublabel-${index}`)?.value || stat.sublabel;
        
        try {
            if (stat.id) {
                await sb.from('supplier_custom_stats').update(stat).eq('id', stat.id);
            } else {
                const { data } = await sb.from('supplier_custom_stats').insert(stat).select();
                stat.id = data[0].id;
            }
            this.showToast('Stat updated successfully', 'success');
        } catch (error) {
            console.error('Error updating stat:', error);
            this.showToast('Error updating stat', 'error');
        }
    },
    
    async deleteStat(id) {
        if (!id) return;
        if (!confirm('Delete this stat?')) return;
        
        try {
            await sb.from('supplier_custom_stats').delete().eq('id', id);
            this.customStats = this.customStats.filter(s => s.id !== id);
            this.renderStatsTab();
            this.showToast('Stat deleted', 'success');
        } catch (error) {
            console.error('Error deleting stat:', error);
            this.showToast('Error deleting stat', 'error');
        }
    },
    
    // ============================================
    // CATEGORY FUNCTIONS
    // ============================================
    addCategory() {
        this.categoryDisplays.push({
            supplier_id: this.currentSupplier.id,
            category_name: 'New Category',
            icon: 'fa-tag',
            display_order: this.categoryDisplays.length
        });
        this.renderCategoriesTab();
        this.showToast('New category added. Click save to confirm.', 'info');
    },
    
    async updateCategory(index) {
        const cat = this.categoryDisplays[index];
        
        cat.category_name = document.getElementById(`cat-name-${index}`)?.value || cat.category_name;
        cat.icon = document.getElementById(`cat-icon-${index}`)?.value || cat.icon;
        
        try {
            if (cat.id) {
                await sb.from('supplier_category_displays').update(cat).eq('id', cat.id);
            } else {
                const { data } = await sb.from('supplier_category_displays').insert(cat).select();
                cat.id = data[0].id;
            }
            this.showToast('Category updated successfully', 'success');
        } catch (error) {
            console.error('Error updating category:', error);
            this.showToast('Error updating category', 'error');
        }
    },
    
    async deleteCategory(id) {
        if (!id) return;
        if (!confirm('Delete this category?')) return;
        
        try {
            await sb.from('supplier_category_displays').delete().eq('id', id);
            this.categoryDisplays = this.categoryDisplays.filter(c => c.id !== id);
            this.renderCategoriesTab();
            this.showToast('Category deleted', 'success');
        } catch (error) {
            console.error('Error deleting category:', error);
            this.showToast('Error deleting category', 'error');
        }
    },
    
    // ============================================
    // FEATURED PRODUCTS FUNCTIONS
    // ============================================
    addHotProduct() {
        this.openProductModal('hot');
    },
    
    addNewArrival() {
        this.openProductModal('new');
    },
    
    openProductModal(section) {
        this.currentProductSection = section;
        
        const grid = document.getElementById('productGrid');
        if (!grid) return;
        
        const existingIds = section === 'hot' 
            ? this.featuredProducts.hot.map(fp => fp.product_id)
            : this.featuredProducts.new.map(fp => fp.product_id);
        
        grid.innerHTML = this.allProducts.map(p => {
            const isSelected = existingIds.includes(p.id);
            return `
                <div class="product-select-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                    <img src="${p.image_urls?.[0] || 'https://via.placeholder.com/100'}" alt="${p.title}">
                    <div class="product-select-info">
                        <div class="product-select-title">${p.title}</div>
                        <div class="product-select-price">UGX ${this.formatNumber(p.price)}</div>
                    </div>
                    <input type="checkbox" class="product-select-checkbox" ${isSelected ? 'checked' : ''}>
                </div>
            `;
        }).join('');
        
        // Setup search
        const searchInput = document.getElementById('productSearch');
        if (searchInput) {
            searchInput.value = '';
            searchInput.addEventListener('input', this.filterProductsInModal.bind(this));
        }
        
        document.getElementById('productModal').classList.add('show');
    },
    
    filterProductsInModal(e) {
        const searchTerm = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.product-select-card');
        
        cards.forEach(card => {
            const title = card.querySelector('.product-select-title').textContent.toLowerCase();
            if (title.includes(searchTerm)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    },
    
    closeProductModal() {
        document.getElementById('productModal').classList.remove('show');
    },
    
    async confirmProductSelection() {
        const selected = document.querySelectorAll('.product-select-card input:checked');
        const productIds = Array.from(selected).map(cb => 
            parseInt(cb.closest('.product-select-card').dataset.id)
        );
        
        const section = this.currentProductSection === 'hot' ? 'hot_selling' : 'new_arrivals';
        const currentFeatured = this.currentProductSection === 'hot' 
            ? this.featuredProducts.hot 
            : this.featuredProducts.new;
        
        try {
            // Remove products that are no longer selected
            for (const fp of currentFeatured) {
                if (!productIds.includes(fp.product_id)) {
                    await sb.from('supplier_featured_products').delete().eq('id', fp.id);
                }
            }
            
            // Add new products
            const existingIds = currentFeatured.map(fp => fp.product_id);
            for (const productId of productIds) {
                if (!existingIds.includes(productId)) {
                    await sb.from('supplier_featured_products').insert({
                        supplier_id: this.currentSupplier.id,
                        product_id: productId,
                        section: section
                    });
                }
            }
            
            await this.loadFeaturedProducts();
            this.renderFeaturedTab();
            this.closeProductModal();
            this.showToast('Products updated successfully', 'success');
        } catch (error) {
            console.error('Error updating products:', error);
            this.showToast('Error updating products', 'error');
        }
    },
    
    async removeHotProduct(id) {
        if (!confirm('Remove this product from hot selling?')) return;
        
        try {
            await sb.from('supplier_featured_products').delete().eq('id', id);
            await this.loadFeaturedProducts();
            this.renderFeaturedTab();
            this.showToast('Product removed', 'success');
        } catch (error) {
            console.error('Error removing product:', error);
            this.showToast('Error removing product', 'error');
        }
    },
    
    async removeNewArrival(id) {
        if (!confirm('Remove this product from new arrivals?')) return;
        
        try {
            await sb.from('supplier_featured_products').delete().eq('id', id);
            await this.loadFeaturedProducts();
            this.renderFeaturedTab();
            this.showToast('Product removed', 'success');
        } catch (error) {
            console.error('Error removing product:', error);
            this.showToast('Error removing product', 'error');
        }
    },
    
    // ============================================
    // BANNER FUNCTIONS WITH COMPRESSION
    // ============================================
    async uploadBanner(file) {
        try {
            this.showToast('Compressing image...', 'info');
            
            // Compress the image
            const compressedFile = await compressImage(file, 1200, 0.8);
            
            const fileName = `banners/${this.currentSupplier.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            
            const { error } = await sb.storage
                .from('supplier-assets')
                .upload(fileName, compressedFile);
            
            if (error) throw error;
            
            const { data: { publicUrl } } = sb.storage
                .from('supplier-assets')
                .getPublicUrl(fileName);
            
            return publicUrl;
        } catch (error) {
            console.error('Error uploading banner:', error);
            throw error;
        }
    },
    
    removeBanner() {
        this.currentStorefront.banner_image_url = null;
        this.renderBannerTab();
    },
    
    // ============================================
    // SAVE ALL
    // ============================================
    async saveAll() {
        try {
            this.showToast('Saving changes...', 'info');
            
            // Save storefront
            this.currentStorefront.banner_title = document.getElementById('bannerTitle')?.value || '';
            this.currentStorefront.banner_subtitle = document.getElementById('bannerSubtitle')?.value || '';
            this.currentStorefront.banner_button_text = document.getElementById('bannerButtonText')?.value || 'Learn More';
            this.currentStorefront.banner_button_link = document.getElementById('bannerButtonLink')?.value || '';
            this.currentStorefront.hot_selling_title = document.getElementById('hotSellingTitle')?.value || 'HOT SELLING PRODUCT';
            this.currentStorefront.hot_selling_subtitle = document.getElementById('hotSellingSubtitle')?.value || 'WELCOME TO OUR COUNTRY';
            this.currentStorefront.tagline = document.getElementById('tagline')?.value || '';
            
            await sb.from('supplier_storefronts').update(this.currentStorefront).eq('id', this.currentStorefront.id);
            
            this.showToast('All changes saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving:', error);
            this.showToast('Error saving changes', 'error');
        }
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    showToast(message, type = 'success') {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#0B4F6C',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Banner upload
        const bannerUpload = document.getElementById('bannerUploadArea');
        const bannerInput = document.getElementById('bannerImage');
        
        if (bannerUpload && bannerInput) {
            bannerUpload.addEventListener('click', () => bannerInput.click());
            
            bannerInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const url = await this.uploadBanner(file);
                        this.currentStorefront.banner_image_url = url;
                        this.renderBannerTab();
                        this.showToast('Banner uploaded successfully', 'success');
                    } catch (error) {
                        console.error('Error uploading banner:', error);
                        this.showToast('Error uploading banner', 'error');
                    }
                }
            });
        }
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
            });
        });
        
        // Modal close on outside click
        const modal = document.getElementById('productModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeProductModal();
                }
            });
        }
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    StorefrontManager.init();
});

// Make functions globally available
window.StorefrontManager = StorefrontManager;